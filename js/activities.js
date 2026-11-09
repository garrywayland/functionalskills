// Activity types the site can mark by itself. One entry per type, each with:
//   check(q, need)                  the content rules (also used by tools/validate.mjs and "Make a pack")
//   ready(q, a)                     has the learner done enough to check?
//   isCorrect(q, a)                 does the saved answer match the key?
//   mine(q, a) / key(q)             the learner's answer and the answer key as plain text (for review and downloads)
//   render(q, ans, save, onChecked, h)   the screen (browser only; h is the page's element builder)
// To add a type, add an entry here. Nothing else in the site needs to know about it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NextStopActivities = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var isText = function (x) { return typeof x === 'string' && x.trim().length > 0; };
  var isList = function (x, min, max) { return Array.isArray(x) && x.length >= min && x.length <= (max || 99); };
  var isIndex = function (n, list) { return Number.isInteger(n) && n >= 0 && n < (list || []).length; };
  var distinct = function (list) { return new Set(list.map(function (x) { return String(x).trim().toLowerCase(); })).size === list.length; };

  // The same "mixed up" order every time for a question, and never the right order.
  function mixed(id, n) {
    var seed = 0, i, order = [];
    for (i = 0; i < String(id).length; i++) seed = (seed * 31 + String(id).charCodeAt(i)) >>> 0;
    for (i = 0; i < n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var j = seed % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t;
    }
    if (n > 1 && order.every(function (v, k) { return v === k; })) order.push(order.shift());
    return order;
  }

  var GAP = /\{\{(\d+)\}\}/g;
  function gapParts(passage) {
    var out = [], last = 0, m;
    GAP.lastIndex = 0;
    while ((m = GAP.exec(String(passage)))) {
      if (m.index > last) out.push(String(passage).slice(last, m.index));
      out.push(parseInt(m[1], 10));
      last = m.index + m[0].length;
    }
    if (last < String(passage).length) out.push(String(passage).slice(last));
    return out;
  }
  var gapCount = function (q) { return gapParts(q.passage).filter(function (p) { return typeof p === 'number'; }).length; };

  // ---------- shared screen parts ----------

  // The Check button, the feedback box, and locking once checked. `reveal` draws the answer; `summary` is the first line.
  function checker(h, q, ans, save, onChecked, type, box, lock, reveal) {
    var fbSlot = h('div', { 'aria-live': 'polite' });
    var btn = h('button', { type: 'button', class: 'btn secondary', text: 'Check my answer' });
    function show() {
      lock();
      fbSlot.replaceChildren(h('div', { class: 'feedback' }, reveal(type.isCorrect(q, ans)), h('p', { text: q.why })));
      btn.remove();
    }
    function refresh() { btn.disabled = !type.ready(q, ans); }
    btn.addEventListener('click', function () {
      if (!type.ready(q, ans)) return;
      ans.checked = true; save(); show();
      if (onChecked) onChecked();
      var fb = fbSlot.querySelector('.feedback');
      if (fb) { fb.setAttribute('tabindex', '-1'); fb.focus(); }
    });
    refresh();
    if (ans.checked) show(); else box.appendChild(h('div', { class: 'actions' }, btn));
    box.appendChild(fbSlot);
    return refresh;
  }

  var types = {};

  // ---------- Put it in order ----------
  // { type: "order", prompt, items: [in the right order], why }
  types.order = {
    name: 'Put it in order',
    check: function (q, need) {
      need(isList(q.items, 3, 7) && q.items.every(isText), 'needs 3 to 7 items, written in the right order');
      need(!Array.isArray(q.items) || distinct(q.items), 'two items are the same');
      need(isText(q.why), 'missing why');
    },
    start: function (q, a) { if (!isList(a.order, q.items.length, q.items.length)) a.order = mixed(q.id, q.items.length); },
    ready: function () { return true; },
    isCorrect: function (q, a) { return Array.isArray(a.order) && a.order.every(function (v, i) { return v === i; }) && a.order.length === q.items.length; },
    mine: function (q, a) { return Array.isArray(a.order) ? a.order.map(function (i, n) { return (n + 1) + '. ' + q.items[i]; }).join('; ') : '(no answer)'; },
    key: function (q) { return q.items.map(function (t, n) { return (n + 1) + '. ' + t; }).join('; '); },
    render: function (q, ans, save, onChecked, h) {
      var type = this; type.start(q, ans);
      var box = h('div'), list = h('ol', { class: 'order-list' }), status = h('p', { class: 'visually-hidden', role: 'status' });
      function draw(focus) {
        list.replaceChildren.apply(list, ans.order.map(function (item, pos) {
          function move(by) {
            return function () {
              var to = pos + by; if (to < 0 || to >= ans.order.length) return;
              ans.order.splice(to, 0, ans.order.splice(pos, 1)[0]); save();
              status.textContent = 'Moved to place ' + (to + 1) + ' of ' + ans.order.length + '.';
              draw({ pos: to, up: by < 0 });
            };
          }
          var up = h('button', { type: 'button', class: 'btn quiet move', 'aria-label': 'Move up: ' + q.items[item], text: 'Up', onclick: move(-1) });
          var down = h('button', { type: 'button', class: 'btn quiet move', 'aria-label': 'Move down: ' + q.items[item], text: 'Down', onclick: move(1) });
          up.disabled = Boolean(ans.checked) || pos === 0; down.disabled = Boolean(ans.checked) || pos === ans.order.length - 1;
          var li = h('li', { class: 'order-item' }, h('span', { class: 'order-text', text: q.items[item] }), ans.checked ? null : h('span', { class: 'order-moves' }, up, down));
          if (focus && focus.pos === pos) setTimeout(function () { var b = focus.up && !up.disabled ? up : (!down.disabled ? down : up); if (b.isConnected) b.focus(); }, 0);
          return li;
        }));
      }
      draw();
      box.appendChild(h('p', { class: 'look-at', text: 'Use Up and Down to put these in the right order.' }));
      box.appendChild(list); box.appendChild(status);
      checker(h, q, ans, save, onChecked, type, box, function () { draw(); }, function (same) {
        return same ? h('p', { class: 'fb-head', text: 'Yes, that is the order.' })
          : h('div', null, h('p', { class: 'fb-head', text: 'The order is:' }), h('ol', null, q.items.map(function (t) { return h('li', { text: t }); })));
      });
      return box;
    },
  };

  // ---------- Fill the gaps ----------
  // { type: "gapfill", prompt, passage: "The bus {{1}} at nine.", bank: [words], answer: [bank index for each gap], why }
  types.gapfill = {
    name: 'Fill the gaps',
    check: function (q, need) {
      var gaps = isText(q.passage) ? gapParts(q.passage).filter(function (p) { return typeof p === 'number'; }) : [];
      need(isText(q.passage) && gaps.length >= 2 && gaps.length <= 8, 'needs a passage with 2 to 8 gaps written as {{1}}, {{2}} and so on');
      need(gaps.every(function (g, i) { return g === i + 1; }), 'gaps must be numbered in order from {{1}}');
      need(isList(q.bank, gaps.length, 12) && q.bank.every(isText) && distinct(q.bank), 'needs a word bank of different words, at least one for each gap');
      need(isList(q.answer, gaps.length, gaps.length) && q.answer.every(function (a) { return isIndex(a, q.bank); }), 'answer must give a word-bank position (starting at 0) for each gap');
      need(!Array.isArray(q.answer) || new Set(q.answer).size === q.answer.length, 'a word is the answer to two gaps');
      need(isText(q.why), 'missing why');
    },
    ready: function (q, a) { var n = gapCount(q); return Array.isArray(a.gaps) && a.gaps.length === n && a.gaps.every(function (g) { return Number.isInteger(g); }); },
    isCorrect: function (q, a) { return this.ready(q, a) && a.gaps.every(function (g, i) { return g === q.answer[i]; }); },
    filled: function (q, picks) { return gapParts(q.passage).map(function (p) { return typeof p === 'number' ? '[' + (Number.isInteger(picks[p - 1]) ? q.bank[picks[p - 1]] : '?') + ']' : p; }).join(''); },
    mine: function (q, a) { return Array.isArray(a.gaps) ? this.filled(q, a.gaps) : '(no answer)'; },
    key: function (q) { return this.filled(q, q.answer); },
    render: function (q, ans, save, onChecked, h) {
      var type = this, n = gapCount(q), selects = [], refresh;
      if (!Array.isArray(ans.gaps) || ans.gaps.length !== n) ans.gaps = new Array(n).fill(null);
      var box = h('div');
      box.appendChild(h('p', { class: 'look-at', text: 'Choose a word for each gap. Each word is used once at most.' }));
      box.appendChild(h('ul', { class: 'word-bank', 'aria-label': 'Words to choose from' }, q.bank.map(function (w) { return h('li', { text: w }); })));
      var passage = h('p', { class: 'gap-passage' }, gapParts(q.passage).map(function (part) {
        if (typeof part !== 'number') return part;
        var sel = h('select', { class: 'gap', 'aria-label': 'Gap ' + part }, h('option', { value: '', text: 'choose' }), q.bank.map(function (w, i) { return h('option', { value: String(i), text: w }); }));
        if (Number.isInteger(ans.gaps[part - 1])) sel.value = String(ans.gaps[part - 1]);
        sel.addEventListener('change', function () { ans.gaps[part - 1] = sel.value === '' ? null : parseInt(sel.value, 10); save(); refresh(); });
        selects.push(sel);
        return sel;
      }));
      box.appendChild(passage);
      refresh = checker(h, q, ans, save, onChecked, type, box, function () { selects.forEach(function (s) { s.disabled = true; }); }, function (same) {
        var hit = ans.gaps.filter(function (g, i) { return g === q.answer[i]; }).length;
        return h('div', null,
          h('p', { class: 'fb-head', text: same ? 'Yes, every gap matches.' : hit + ' of ' + n + ' gaps match. Here it is filled in:' }),
          same ? null : h('p', null, gapParts(q.passage).map(function (p) { return typeof p === 'number' ? h('strong', { text: q.bank[q.answer[p - 1]] }) : p; })));
      });
      return box;
    },
  };

  // ---------- Sort into groups ----------
  // { type: "sort", prompt, groups: ["Formal", "Informal"], items: [{ label, group: 0 }], why }
  // Also used for "which text says this?" (groups: Text A, Text B, Both) and for naming the parts of a letter.
  types.sort = {
    name: 'Sort into groups',
    check: function (q, need) {
      need(isList(q.groups, 2, 6) && q.groups.every(isText) && distinct(q.groups), 'needs 2 to 6 different group names');
      need(isList(q.items, 3, 10) && q.items.every(function (it) { return it && isText(it.label) && isIndex(it.group, q.groups); }), 'needs 3 to 10 items, each with a label and a group position (starting at 0)');
      need(!Array.isArray(q.items) || !Array.isArray(q.groups) || new Set(q.items.map(function (it) { return it && it.group; })).size >= 2, 'every item is in the same group');
      need(isText(q.why), 'missing why');
    },
    ready: function (q, a) { return Boolean(a.groups) && q.items.every(function (it, i) { return Number.isInteger(a.groups[i]); }); },
    isCorrect: function (q, a) { return this.ready(q, a) && q.items.every(function (it, i) { return a.groups[i] === it.group; }); },
    mine: function (q, a) { return q.items.map(function (it, i) { return it.label + ': ' + (a.groups && Number.isInteger(a.groups[i]) ? q.groups[a.groups[i]] : '?'); }).join('; '); },
    key: function (q) { return q.items.map(function (it) { return it.label + ': ' + q.groups[it.group]; }).join('; '); },
    render: function (q, ans, save, onChecked, h) {
      var type = this, refresh, inputs = [], rows = [];
      if (!ans.groups || typeof ans.groups !== 'object') ans.groups = {};
      var box = h('div');
      box.appendChild(h('p', { class: 'look-at', text: 'Choose a group for each one.' }));
      q.items.forEach(function (it, i) {
        var name = 'sort-' + q.id + '-' + i;
        var fs = h('fieldset', { class: 'sort-item' }, h('legend', { text: it.label }),
          h('div', { class: 'sort-choices' }, q.groups.map(function (g, gi) {
            var input = h('input', { type: 'radio', name: name, value: String(gi) });
            if (ans.groups[i] === gi) input.checked = true;
            input.addEventListener('change', function () { ans.groups[i] = gi; save(); refresh(); });
            inputs.push(input);
            return h('label', { class: 'sort-choice' }, input, h('span', { text: g }));
          })));
        rows.push(fs); box.appendChild(fs);
      });
      refresh = checker(h, q, ans, save, onChecked, type, box, function () {
        inputs.forEach(function (x) { x.disabled = true; });
        rows.forEach(function (fs, i) {
          if (fs.querySelector('.tag')) return;
          fs.appendChild(h('span', { class: 'tag', text: (ans.groups[i] === q.items[i].group ? 'Matches: ' : 'Answer: ') + q.groups[q.items[i].group] }));
        });
      }, function (same) {
        var hit = q.items.filter(function (it, i) { return ans.groups[i] === it.group; }).length;
        return h('p', { class: 'fb-head', text: same ? 'Yes, they all match.' : hit + ' of ' + q.items.length + ' match. The answers are shown above.' });
      });
      return box;
    },
  };

  // ---------- Spot the mistake ----------
  // { type: "spot", prompt, words: ["Their", "going", "to", "the", "match."], answer: 0, fix: "They're", why }
  types.spot = {
    name: 'Spot the mistake',
    check: function (q, need) {
      need(isList(q.words, 4, 40) && q.words.every(isText), 'needs the sentence as a list of 4 to 40 words');
      need(isIndex(q.answer, q.words), 'answer must be the position of the wrong word (starting at 0)');
      need(isText(q.fix) && (!Array.isArray(q.words) || q.fix !== q.words[q.answer]), 'needs fix: the word as it should be, different from the mistake');
      need(isText(q.why), 'missing why');
    },
    ready: function (q, a) { return Number.isInteger(a.choice); },
    isCorrect: function (q, a) { return a.choice === q.answer; },
    mine: function (q, a) { return Number.isInteger(a.choice) ? '"' + q.words[a.choice] + '"' : '(no answer)'; },
    key: function (q) { return '"' + q.words[q.answer] + '" should be "' + q.fix + '"'; },
    render: function (q, ans, save, onChecked, h) {
      var type = this, refresh, buttons;
      var box = h('div');
      box.appendChild(h('p', { class: 'look-at', text: 'One word is wrong. Choose it.' }));
      buttons = q.words.map(function (w, i) {
        var b = h('button', { type: 'button', class: 'word', 'aria-pressed': ans.choice === i ? 'true' : 'false', text: w });
        b.addEventListener('click', function () {
          ans.choice = i; save();
          buttons.forEach(function (x, k) { x.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
          refresh();
        });
        return b;
      });
      box.appendChild(h('p', { class: 'spot-sentence' }, buttons.map(function (b, i) { return i ? [' ', b] : b; })));
      refresh = checker(h, q, ans, save, onChecked, type, box, function () {
        buttons.forEach(function (b, i) { b.disabled = true; if (i === q.answer) b.classList.add('is-answer'); });
      }, function (same) {
        return h('p', { class: 'fb-head', text: (same ? 'Yes. ' : 'The word to change is "' + q.words[q.answer] + '". ') + 'It should be "' + q.fix + '".' });
      });
      return box;
    },
  };

  // ---------- Find the evidence ----------
  // { type: "evidence", prompt: "Which sentence shows that ...?", sentences: [...], answer: 2, why }
  types.evidence = {
    name: 'Find the evidence',
    check: function (q, need) {
      need(isList(q.sentences, 3, 8) && q.sentences.every(isText) && distinct(q.sentences), 'needs 3 to 8 different sentences');
      need(isIndex(q.answer, q.sentences), 'answer must be the position of the sentence (starting at 0)');
      need(isText(q.why), 'missing why');
    },
    ready: function (q, a) { return Number.isInteger(a.choice); },
    isCorrect: function (q, a) { return a.choice === q.answer; },
    mine: function (q, a) { return Number.isInteger(a.choice) ? q.sentences[a.choice] : '(no answer)'; },
    key: function (q) { return q.sentences[q.answer]; },
    render: function (q, ans, save, onChecked, h) {
      var type = this, refresh, labels;
      var box = h('div');
      box.appendChild(h('p', { class: 'look-at', text: 'Choose one sentence.' }));
      var fs = q.labelledBy ? h('fieldset', { class: 'options', 'aria-labelledby': q.labelledBy }) : h('fieldset', { class: 'options' }, h('legend', { class: 'visually-hidden', text: q.prompt }));
      labels = q.sentences.map(function (s, i) {
        var input = h('input', { type: 'radio', name: 'ev-' + q.id, value: String(i) });
        if (ans.choice === i) input.checked = true;
        input.addEventListener('change', function () { ans.choice = i; save(); refresh(); });
        var lab = h('label', { class: 'option' }, input, h('span', { text: s }));
        fs.appendChild(lab);
        return lab;
      });
      box.appendChild(fs);
      refresh = checker(h, q, ans, save, onChecked, type, box, function () {
        labels.forEach(function (lab, i) {
          lab.classList.add('locked'); lab.querySelector('input').disabled = true;
          if (i === q.answer && !lab.querySelector('.tag')) { lab.classList.add('is-answer'); lab.appendChild(h('span', { class: 'tag', text: 'Answer' })); }
        });
      }, function (same) {
        return h('p', { class: 'fb-head', text: same ? 'Yes, that is the sentence.' : 'The sentence is marked above.' });
      });
      return box;
    },
  };

  return { types: types, names: Object.keys(types), mixed: mixed, gapParts: gapParts };
});
