/* Next Stop: reading and writing missions.
   Plain JS, no build step. Content comes from /content/*.json.
   Nothing typed here leaves the browser unless the learner copies it. */
(function () {
  'use strict';

  // ---------- Storage (localStorage, with an in-memory fallback) ----------

  var PREFIX = 'nextstop:';
  var memory = {};

  var store = {
    get: function (key, fallback) {
      if (Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
      try {
        var raw = window.localStorage.getItem(PREFIX + key);
        if (raw !== null) {
          var value = JSON.parse(raw);
          memory[key] = value;
          return value;
        }
      } catch (e) { /* storage unavailable or corrupt: use fallback */ }
      return fallback;
    },
    set: function (key, value) {
      memory[key] = value;
      try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* keep in memory only */ }
    },
    remove: function (key) {
      delete memory[key];
      try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    }
  };

  // ---------- Small DOM helper (text only, never innerHTML) ----------

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el) {
    for (var i = 1; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); continue; }
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  // ---------- State ----------

  var LEVELS = { L1: 'Level 1', L2: 'Level 2' };
  var content = null;
  var main = document.getElementById('main');

  function level() {
    var l = store.get('level', 'L1');
    return LEVELS[l] ? l : 'L1';
  }

  function forLevel(items) {
    var l = level();
    return (items || []).filter(function (it) { return !it.levels || it.levels.indexOf(l) !== -1; });
  }

  function isDone(id) {
    var done = store.get('done', {});
    return !!(done[level()] && done[level()][id]);
  }

  function markDone(id) {
    var done = store.get('done', {});
    if (!done[level()]) done[level()] = {};
    done[level()][id] = true;
    store.set('done', done);
  }

  // ---------- Level switch ----------

  function setupLevelSwitch() {
    var radios = document.querySelectorAll('input[name="level"]');
    Array.prototype.forEach.call(radios, function (r) {
      r.checked = r.value === level();
      r.addEventListener('change', function () {
        if (!r.checked) return;
        store.set('level', r.value);
        render({ keepFocus: true });
      });
    });
  }

  // ---------- Routing ----------

  function parseRoute() {
    var parts = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    return parts;
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render(opts) {
    opts = opts || {};
    if (!content) return;
    var parts = parseRoute();
    var view;
    main.className = '';
    if (parts[0] === 'reading' && parts[1]) view = readingView(parts[1], parts[2]);
    else if (parts[0] === 'writing' && parts[1]) view = writingView(parts[1], parts[2]);
    else if (parts[0] === 'toolkit' && parts[1] && parts[2]) view = toolView(parts[1], parts[2]);
    else if (parts[0] === 'toolkit') view = toolkitView();
    else view = homeView();

    main.replaceChildren(view);
    updateNav(parts[0] || '');
    document.title = (main.querySelector('h1') ? main.querySelector('h1').textContent + ' · ' : '') + 'Next Stop';

    if (!opts.keepFocus) {
      window.scrollTo(0, 0);
      var h1 = main.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }

  function updateNav(section) {
    Array.prototype.forEach.call(document.querySelectorAll('.site-nav a'), function (a) {
      var target = a.getAttribute('href').replace('#/', '');
      var current = target === '' ? section !== 'toolkit' : section === target;
      if (current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------- Home ----------

  function homeView() {
    main.className = 'home';
    var reading = content.reading.missions;
    var writing = content.writing.missions;
    var all = reading.concat(writing);
    var doneCount = all.filter(function (m) { return isDone(m.id); }).length;

    return h('div', null,
      h('section', { class: 'map-intro' },
        h('h1', { text: 'Pick a mission' }),
        h('p', { class: 'lede', text: 'Each mission takes about 10 minutes. Do one, then stop or carry on. It is up to you.' }),
        h('p', { class: 'progress-line', text: doneCount + ' of ' + all.length + ' missions done at ' + LEVELS[level()] + '.' }),
        h('p', { class: 'muted small', text: 'Not sure which level? Every mission works at both. Use the switch at the top.' })
      ),
      h('div', { class: 'lines-grid' },
        lineSection('reading', 'Reading line', 'Read a short text, then answer questions one at a time.', reading.map(function (m) {
          return { id: m.id, href: '#/reading/' + m.id, title: m.title, meta: m.topic + ' · ' + forLevel(m.questions).length + ' questions' };
        })),
        lineSection('writing', 'Writing line', 'Plan and write a short piece, then send it for marking if you want to.', writing.map(function (m) {
          return { id: m.id, href: '#/writing/' + m.id, title: m.title, meta: m.topic + ' · ' + (m.task === 1 ? 'longer task' : 'shorter task') + ' · ' + formatName(missionFor(m).format) };
        }))
      ),
      h('section', { class: 'line toolkit' },
        h('h2', { class: 'line-title', text: 'Toolkit' }),
        h('p', { text: 'Short guides to each kind of writing, plus punctuation and spelling, each with a quick practice.' }),
        h('a', { class: 'btn secondary', href: '#/toolkit', text: 'Open the toolkit' })
      )
    );
  }

  function lineSection(kind, title, blurb, stops) {
    return h('section', { class: 'line ' + kind, 'aria-labelledby': 'line-' + kind },
      h('h2', { class: 'line-title', id: 'line-' + kind, text: title }),
      h('p', { text: blurb }),
      h('ol', { class: 'stops' }, stops.map(function (s) {
        var done = isDone(s.id);
        return h('li', { class: 'stop' + (done ? ' done' : '') },
          h('a', { href: s.href },
            h('span', { class: 'stop-title', text: s.title }),
            h('span', { class: 'stop-state', text: done ? 'Done' : '10 min' }),
            h('span', { class: 'stop-meta', text: s.meta })
          ));
      }))
    );
  }

  // ---------- Reading ----------

  var TFNS = [['true', 'True'], ['false', 'False'], ['notstated', 'Not stated']];
  var FO = [['fact', 'Fact'], ['opinion', 'Opinion']];

  function optionsFor(q) {
    if (q.type === 'tfns') return TFNS.map(function (o) { return o[1]; });
    if (q.type === 'factopinion') return FO.map(function (o) { return o[1]; });
    return q.options || [];
  }

  function answerIndex(q) {
    var list = q.type === 'tfns' ? TFNS : q.type === 'factopinion' ? FO : null;
    if (!list) return q.answer;
    for (var i = 0; i < list.length; i++) if (list[i][0] === q.answer) return i;
    return -1;
  }

  function promptFor(q) {
    if (q.type === 'tfns') return 'True, false or not stated?';
    if (q.type === 'factopinion') return 'Is this a fact or an opinion?';
    return null;
  }

  function readingSteps(m) {
    var texts = forLevel(m.texts);
    var steps = texts.map(function (t, i) { return { kind: 'text', text: t, index: i }; });
    forLevel(m.questions).forEach(function (q, i) { steps.push({ kind: 'question', q: q, index: i }); });
    steps.push({ kind: 'done' });
    return { steps: steps, texts: texts };
  }

  function readingView(id, stepParam) {
    var m = find(content.reading.missions, id);
    if (!m) return notFound();
    var key = 'reading:' + id + ':' + level();
    var saved = store.get(key, { answers: {}, pos: 0 });
    if (!saved.answers) saved.answers = {};
    var built = readingSteps(m);
    var steps = built.steps;
    var pos = stepParam !== undefined ? parseInt(stepParam, 10) : (saved.pos || 0);
    if (isNaN(pos) || pos < 0) pos = 0;
    if (pos > steps.length - 1) pos = steps.length - 1;
    saved.pos = pos;
    store.set(key, saved);

    var step = steps[pos];
    var questionCount = steps.filter(function (s) { return s.kind === 'question'; }).length;
    var multi = built.texts.length > 1;
    function hrefFor(p) { return '#/reading/' + id + '/' + p; }
    function save() { store.set(key, saved); }

    var wrap = h('article', { class: 'mission reading' });
    append(wrap, h('p', { class: 'eyebrow', text: 'Reading · ' + m.topic + ' · ' + LEVELS[level()] }));

    if (step.kind === 'text') {
      var t = step.text;
      append(wrap, h('h1', { text: step.index === 0 ? m.title : 'Now read Text ' + t.id }));
      if (step.index === 0) {
        append(wrap, h('section', { class: 'howto', 'aria-labelledby': 'howto-h' },
          h('h2', { id: 'howto-h', text: 'What to do' }),
          h('ol', null,
            h('li', { text: multi ? 'Read Text A. Then read Text B on the next screen.' : 'Read the text below. Take your time.' }),
            h('li', { text: 'Answer ' + questionCount + ' questions, one at a time.' }),
            h('li', { text: 'You can look back at the text whenever you like.' })
          )
        ));
      }
      append(wrap, sourceText(t, multi));
      var last = step.index === built.texts.length - 1;
      append(wrap, h('div', { class: 'actions' },
        pos > 0 ? h('a', { class: 'btn quiet', href: hrefFor(pos - 1), text: 'Back' }) : h('a', { class: 'btn quiet', href: '#/', text: 'Back to the map' }),
        h('a', { class: 'btn', href: hrefFor(pos + 1), text: last ? "I've read it. Start the questions" : 'Next: Text ' + built.texts[step.index + 1].id })
      ));
      return wrap;
    }

    if (step.kind === 'question') {
      var q = step.q;
      var ans = saved.answers[q.id] || (saved.answers[q.id] = {});
      append(wrap, h('p', { class: 'step-count', text: 'Question ' + (step.index + 1) + ' of ' + questionCount }));

      var layout = h('div', { class: 'q-layout' });
      var qCol = h('div', { class: 'q-col' });
      layout.appendChild(qCol);

      var refTexts = q.text === 'both' || !q.text ? built.texts : built.texts.filter(function (t) { return t.id === q.text; });
      if (multi) append(qCol, h('p', { class: 'look-at', text: q.text === 'both' ? 'Use both texts.' : 'Look at Text ' + q.text + '.' }));

      var lead = promptFor(q);
      append(qCol, h('h1', { class: 'question-prompt', id: 'qp-' + q.id, text: lead ? lead : q.prompt }));
      if (lead) append(qCol, h('p', { class: 'question-prompt', id: 'qs-' + q.id, text: q.prompt }));
      q.labelledBy = 'qp-' + q.id + (lead ? ' qs-' + q.id : '');

      var next = h('a', { class: 'btn', href: hrefFor(pos + 1), text: step.index === questionCount - 1 ? 'Finish' : 'Next question' });

      if (q.type === 'open') append(qCol, openQuestion(q, ans, save));
      else append(qCol, closedQuestion(q, ans, save));

      append(qCol, h('div', { class: 'actions' },
        h('a', { class: 'btn quiet', href: hrefFor(pos - 1), text: 'Back' }),
        next
      ));

      var look = h('details', { class: 'look-back' },
        h('summary', { text: refTexts.length > 1 ? 'Show the texts' : 'Show the text' }),
        refTexts.map(function (t) { return sourceText(t, multi, true); })
      );
      if (window.matchMedia && window.matchMedia('(min-width: 1000px)').matches) {
        look.open = true;
        main.className = 'wide';
      }
      layout.appendChild(look);
      append(wrap, layout);
      return wrap;
    }

    // Done
    markDone(id);
    var closed = forLevel(m.questions).filter(function (q) { return q.type !== 'open'; });
    var matched = closed.filter(function (q) { var a = saved.answers[q.id]; return a && a.checked && a.choice === answerIndex(q); }).length;
    var openCount = forLevel(m.questions).length - closed.length;
    var scoreSlot = h('div', { 'aria-live': 'polite' });

    append(wrap,
      h('div', { class: 'done-mark', 'aria-hidden': 'true' }),
      h('h1', { text: 'Mission done' }),
      h('p', { class: 'lede', text: 'That is one more stop on the reading line. Nice work.' }),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn secondary', onclick: function (e) {
          e.currentTarget.disabled = true;
          scoreSlot.replaceChildren(h('div', { class: 'score-box' },
            h('p', { text: matched + ' of ' + closed.length + ' choice answers matched the answer key.' }),
            openCount ? h('p', { class: 'muted', text: 'You checked ' + openCount + (openCount === 1 ? ' written answer' : ' written answers') + ' yourself against a model answer.' }) : null
          ));
        }, text: 'Show how many matched' }),
        h('a', { class: 'btn', href: '#/', text: 'Back to the map' }),
        h('button', { type: 'button', class: 'btn quiet', onclick: function () {
          store.remove(key);
          go(hrefFor(0));
        }, text: 'Do it again' })
      ),
      scoreSlot
    );
    return wrap;
  }

  function closedQuestion(q, ans, save, onChecked) {
    var opts = optionsFor(q);
    var right = answerIndex(q);
    var name = 'q-' + q.id;
    var box = h('div');
    var fbSlot = h('div', { 'aria-live': 'polite' });
    var checkBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Check my answer' });

    var fs = q.labelledBy
      ? h('fieldset', { class: 'options', 'aria-labelledby': q.labelledBy })
      : h('fieldset', { class: 'options' }, h('legend', { class: 'visually-hidden', text: q.prompt }));
    var labels = opts.map(function (text, i) {
      var input = h('input', { type: 'radio', name: name, value: String(i) });
      if (ans.choice === i) input.checked = true;
      if (ans.checked) input.disabled = true;
      input.addEventListener('change', function () {
        ans.choice = i; save(); checkBtn.disabled = false;
      });
      var lab = h('label', { class: 'option' + (ans.checked ? ' locked' : '') }, input, h('span', { text: text }));
      fs.appendChild(lab);
      return lab;
    });
    box.appendChild(fs);

    function showFeedback() {
      labels.forEach(function (lab, i) {
        lab.classList.add('locked');
        lab.querySelector('input').disabled = true;
        if (i === right) {
          lab.classList.add('is-answer');
          lab.appendChild(h('span', { class: 'tag', text: 'Answer' }));
        }
      });
      var same = ans.choice === right;
      fbSlot.replaceChildren(h('div', { class: 'feedback' },
        h('p', { class: 'fb-head', text: same ? 'Yes, that matches the answer.' : 'The answer is: ' + opts[right] + '.' }),
        h('p', { text: q.why })
      ));
      checkBtn.remove();
    }

    checkBtn.disabled = typeof ans.choice !== 'number';
    checkBtn.addEventListener('click', function () {
      if (typeof ans.choice !== 'number') return;
      ans.checked = true; save(); showFeedback();
      if (onChecked) onChecked();
      var fb = fbSlot.querySelector('.feedback');
      if (fb) { fb.setAttribute('tabindex', '-1'); fb.focus(); }
    });

    if (ans.checked) showFeedback(); else box.appendChild(h('div', { class: 'actions' }, checkBtn));
    box.appendChild(fbSlot);
    return box;
  }

  function openQuestion(q, ans, save) {
    var box = h('div');
    var id = 'open-' + q.id;
    var ta = h('textarea', { id: id, rows: '5' });
    ta.value = ans.text || '';
    ta.addEventListener('input', function () { ans.text = ta.value; save(); });
    box.appendChild(h('label', { class: 'field', for: id }, 'Your answer', h('span', { class: 'hint', text: 'A few sentences is enough. No one else sees this.' })));
    box.appendChild(ta);

    var slot = h('div');
    var showBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Show the model answer' });

    function reveal() {
      ans.text = ta.value; ans.shown = true;
      if (!ans.checks) ans.checks = [];
      save();
      showBtn.remove();
      slot.replaceChildren(h('section', { class: 'model', 'aria-labelledby': 'model-' + q.id },
        h('h2', { id: 'model-' + q.id, text: 'One possible answer' }),
        h('p', { text: q.model }),
        h('h3', { text: 'Check your own answer' }),
        h('ul', { class: 'checks' }, q.check.map(function (c, i) {
          var cb = h('input', { type: 'checkbox' });
          cb.checked = !!ans.checks[i];
          cb.addEventListener('change', function () { ans.checks[i] = cb.checked; save(); });
          return h('li', null, h('label', null, cb, h('span', { text: c })));
        })),
        h('p', { class: 'muted small', text: 'Yours does not need to match word for word. If you are missing something, you can add it to your answer now.' })
      ));
    }
    showBtn.addEventListener('click', function () {
      reveal();
      var model = slot.querySelector('.model');
      if (model) { model.setAttribute('tabindex', '-1'); model.focus(); }
    });

    if (ans.shown) reveal(); else box.appendChild(h('div', { class: 'actions' }, showBtn));
    box.appendChild(slot);
    return box;
  }

  function sourceText(t, multi, compact) {
    return h('section', { class: 'source-text', 'aria-label': (multi ? 'Text ' + t.id + ': ' : '') + t.title },
      h('p', { class: 'text-label', text: (multi ? 'Text ' + t.id + ' · ' : '') + t.kind + ' · ' + t.source }),
      h(compact ? 'h3' : 'h2', { text: t.title }),
      blocks(t.body, compact)
    );
  }

  function blocks(list, compact) {
    return (list || []).map(function (b) {
      if (b.h) return h(compact ? 'h4' : 'h3', { text: b.h });
      if (b.p) return h('p', { text: b.p });
      if (b.ul) return h('ul', null, b.ul.map(function (li) { return h('li', { text: li }); }));
      if (b.table) {
        return h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Table' },
          h('table', null,
            h('thead', null, h('tr', null, b.table.head.map(function (c) { return h('th', { scope: 'col', text: c }); }))),
            h('tbody', null, b.table.rows.map(function (r) {
              return h('tr', null, r.map(function (c) { return h('td', { text: c }); }));
            }))
          ));
      }
      return null;
    });
  }

  // ---------- Writing ----------

  var WRITING_STEPS = [['task', 'Task'], ['plan', 'Plan'], ['write', 'Write'], ['send', 'Send']];

  // Applies any per-level overrides from the JSON.
  function missionFor(m) {
    var o = (m.levels && m.levels[level()]) || {};
    var out = {};
    Object.keys(m).forEach(function (k) { out[k] = m[k]; });
    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  function formatName(id) {
    var f = find(content.toolkit.formats, id);
    return f ? f.name.toLowerCase() : id;
  }

  function wordCount(text) {
    var t = (text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function writingView(id, stepParam) {
    var raw = find(content.writing.missions, id);
    if (!raw) return notFound();
    var m = missionFor(raw);
    var stepIds = WRITING_STEPS.map(function (s) { return s[0]; });
    var key = 'writing:' + id + ':' + level();
    var saved = store.get(key, {});
    if (!saved.plan) saved.plan = {};
    if (!saved.checks) saved.checks = {};
    var step = stepIds.indexOf(stepParam) !== -1 ? stepParam : (saved.step || 'task');
    saved.step = step;
    store.set(key, saved);
    function save() { store.set(key, saved); }
    var format = find(content.toolkit.formats, m.format);
    var length = content.writing.lengthGuide[String(m.task)][level()];
    var idx = stepIds.indexOf(step);
    function hrefFor(s) { return '#/writing/' + id + '/' + s; }

    var wrap = h('article', { class: 'mission writing' });
    append(wrap, h('p', { class: 'eyebrow', text: 'Writing · ' + m.topic + ' · ' + LEVELS[level()] }));
    append(wrap, h('nav', { 'aria-label': 'Mission steps' },
      h('ol', { class: 'route' }, WRITING_STEPS.map(function (s, i) {
        var cls = i < idx ? 'past' : i === idx ? 'current' : '';
        return h('li', { class: cls },
          h('a', { href: hrefFor(s[0]), 'aria-current': i === idx ? 'step' : null },
            h('span', { class: 'dot', 'aria-hidden': 'true' }),
            h('span', { text: (i + 1) + '. ' + s[1] })));
      }))
    ));

    var nextBtn = idx < stepIds.length - 1 ? h('a', { class: 'btn', href: hrefFor(stepIds[idx + 1]), text: 'Next: ' + WRITING_STEPS[idx + 1][1] }) : null;
    var backBtn = idx > 0 ? h('a', { class: 'btn quiet', href: hrefFor(stepIds[idx - 1]), text: 'Back' }) : h('a', { class: 'btn quiet', href: '#/', text: 'Back to the map' });

    if (step === 'task') {
      append(wrap,
        h('h1', { text: m.title }),
        h('p', { class: 'lede', text: (m.task === 1 ? 'Longer task' : 'Shorter task') + '. Read the task, then plan it on the next screen.' }),
        taskCard(m, format, length),
        h('div', { class: 'actions' }, backBtn, nextBtn)
      );
    }

    if (step === 'plan') {
      var fields = planFields(m);
      append(wrap,
        h('h1', { text: 'Plan it' }),
        h('p', { class: 'lede', text: 'Jot down a few words for each box. Notes are fine; you do not need full sentences here.' }),
        fields.map(function (f) {
          var fid = 'plan-' + f.key;
          var ta = h('textarea', { id: fid, rows: '3' });
          ta.value = saved.plan[f.key] || '';
          ta.addEventListener('input', function () { saved.plan[f.key] = ta.value; save(); });
          return h('div', null,
            h('label', { class: 'field', for: fid }, f.label, h('span', { class: 'hint', text: f.hint })),
            ta);
        }),
        h('div', { class: 'actions' }, backBtn, nextBtn)
      );
    }

    if (step === 'write') {
      var countEl = h('span', { class: 'word-count' });
      var status = h('span', { class: 'visually-hidden', role: 'status' });
      var box = h('textarea', { id: 'draft', class: 'big', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
      box.value = saved.draft || '';
      var announce = debounce(function () { status.textContent = countEl.textContent; }, 1500);
      function updateCount() {
        var n = wordCount(box.value);
        countEl.textContent = n + (n === 1 ? ' word' : ' words');
      }
      updateCount();
      box.addEventListener('input', function () { saved.draft = box.value; save(); updateCount(); announce(); });

      var spell = h('input', { type: 'checkbox' });
      spell.checked = !!saved.spellcheck;
      box.spellcheck = !!saved.spellcheck;
      spell.addEventListener('change', function () { saved.spellcheck = spell.checked; box.spellcheck = spell.checked; save(); });

      var checklist = (format ? format.checklist : []).map(function (c, i) { return { key: 'f' + i, text: c }; });
      m.bullets.forEach(function (b, i) { checklist.push({ key: 'b' + i, text: 'I covered: ' + b + '.' }); });

      append(wrap,
        h('h1', { text: 'Write it' }),
        h('p', { class: 'lede', text: 'Aim for ' + length + ' (a rough guide).' }),
        h('details', { class: 'plan-peek' }, h('summary', { text: 'Show the task' }), taskCard(m, format, length)),
        planPeek(m, saved.plan),
        h('label', { class: 'field', for: 'draft' }, 'Your ' + formatName(m.format)),
        box,
        h('div', { class: 'write-meta' }, countEl, status,
          h('label', { class: 'toggle' }, spell, 'Show spelling underlines')),
        h('section', { 'aria-labelledby': 'fc-h' },
          h('h2', { id: 'fc-h', text: 'Check before you send' }),
          h('p', { class: 'muted small' }, 'Tick each one when it is true. ', format ? h('a', { href: '#/toolkit/format/' + format.id, text: 'How to write ' + (format.id === 'email' || format.id === 'article' ? 'an ' : 'a ') + format.name.toLowerCase() }) : null),
          h('ul', { class: 'checks' }, checklist.map(function (c) {
            var cb = h('input', { type: 'checkbox' });
            cb.checked = !!saved.checks[c.key];
            cb.addEventListener('change', function () { saved.checks[c.key] = cb.checked; save(); });
            return h('li', null, h('label', null, cb, h('span', { text: c.text })));
          }))
        ),
        h('div', { class: 'actions' }, backBtn, nextBtn)
      );
    }

    if (step === 'send') {
      var draft = saved.draft || '';
      var words = wordCount(draft);
      if (!words) {
        append(wrap,
          h('h1', { text: 'Send for marking' }),
          h('p', { class: 'notice', text: 'There is nothing in the writing box yet. Go back to the Write step and write your answer first.' }),
          h('div', { class: 'actions' }, h('a', { class: 'btn', href: hrefFor('write'), text: 'Back to Write' }))
        );
        return wrap;
      }
      var block = markingBlock(m, format, length, draft);
      var out = h('textarea', { id: 'marking', class: 'marking-block', readonly: true, rows: '16' });
      out.value = block;
      var msg = h('p', { class: 'status', role: 'status' });
      var copyBtn = h('button', { type: 'button', class: 'btn', text: 'Copy' });
      copyBtn.addEventListener('click', function () {
        copyText(out).then(function (ok) {
          if (ok) {
            markDone(id);
            msg.textContent = 'Copied. Paste it into a message to whoever is marking your work.';
          } else {
            out.focus(); out.select();
            msg.textContent = 'Could not copy automatically. The text is selected: press Ctrl+C, or long-press and choose Copy.';
          }
        });
      });
      append(wrap,
        h('h1', { text: 'Send for marking' }),
        h('p', { class: 'lede', text: 'This puts the task, a marking guide and your answer together in one block. Copy it and paste it into a message. Nothing is sent from this page.' }),
        h('p', { class: 'muted', text: words + ' words. The block does not include your name.' }),
        h('label', { class: 'field', for: 'marking' }, 'Text to copy'),
        out,
        h('div', { class: 'actions' }, copyBtn,
          h('button', { type: 'button', class: 'btn secondary', onclick: function () {
            markDone(id);
            msg.textContent = 'Marked as done. You can still come back and change it.';
          }, text: "I'm done with this one" }),
          h('span', { class: 'spacer' }),
          backBtn),
        msg,
        h('p', { class: 'muted small' }, h('a', { href: '#/', text: 'Back to the map' }))
      );
    }

    return wrap;
  }

  function taskCard(m, format, length) {
    return h('section', { class: 'task-card', 'aria-label': 'The task' },
      h('p', { text: m.context }),
      m.info ? h('div', { class: 'info-box' },
        h('h3', { text: 'Information you can use' }),
        h('ul', null, m.info.map(function (i) { return h('li', { text: i }); }))) : null,
      h('dl', null,
        h('dt', { text: 'Who it is for' }), h('dd', { text: m.audience }),
        h('dt', { text: 'Why you are writing' }), h('dd', { text: m.purpose }),
        h('dt', { text: 'Format' }), h('dd', null, format ? h('a', { href: '#/toolkit/format/' + format.id, text: format.name }) : m.format),
        h('dt', { text: 'Length' }), h('dd', { text: length + '. ' + content.writing.lengthNote })
      ),
      h('p', { class: 'task-instruction', text: m.instruction }),
      h('p', { text: 'In your ' + formatName(m.format) + ' you should include:' }),
      h('ul', { class: 'bullets' }, m.bullets.map(function (b) { return h('li', { text: b }); }))
    );
  }

  function planFields(m) {
    var fields = [{ key: 'opening', label: 'Opening', hint: 'Say who you are (if needed) and why you are writing.' }];
    m.bullets.forEach(function (b, i) {
      fields.push({ key: 'b' + i, label: 'Point ' + (i + 1) + ': ' + b, hint: 'One or two paragraphs. What details or examples will you use?' });
    });
    fields.push({ key: 'close', label: 'Close', hint: 'How will you finish? What do you want the reader to do or think?' });
    return fields;
  }

  function planPeek(m, plan) {
    var fields = planFields(m).filter(function (f) { return plan[f.key]; });
    if (!fields.length) return h('p', { class: 'muted small' }, 'No plan yet. ', h('a', { href: '#/writing/' + m.id + '/plan', text: 'Make a quick plan' }), ' or just start writing.');
    return h('details', { class: 'plan-peek' },
      h('summary', { text: 'Show my plan' }),
      h('dl', null, fields.map(function (f) { return [h('dt', { text: f.label }), h('dd', { text: plan[f.key] })]; })));
  }

  function markingBlock(m, format, length, draft) {
    var lv = level();
    var marks = content.writing.marks[String(m.task)];
    var guide = content.writing.markGuide;
    function bands(list, max) {
      var n = list.length;
      var size = max / n;
      return list.map(function (d, i) {
        var lo = Math.round(i * size) + 1;
        var hi = Math.round((i + 1) * size);
        var text = d.replace(/^[^:]+: /, '');
        return '  ' + lo + '–' + hi + ' marks: ' + text.charAt(0).toUpperCase() + text.slice(1);
      }).join('\n') + '\n  0 marks: nothing that can be credited.';
    }
    var lines = [
      'Please mark this Functional Skills English writing answer.',
      '',
      'Level: ' + LEVELS[lv],
      'Task: ' + (m.task === 1 ? 'Task 1 (longer task)' : 'Task 2 (shorter task)'),
      'Marks available: Composition ' + marks.composition + ', Spelling, punctuation and grammar (SPaG) ' + marks.spag + ', total ' + (marks.composition + marks.spag) + '.',
      '',
      '=== THE TASK ===',
      m.context,
      m.info ? 'Information given: ' + m.info.join(' ') : null,
      'Audience: ' + m.audience,
      'Purpose: ' + m.purpose,
      'Format: ' + (format ? format.name : m.format),
      'Suggested length: ' + length + ' (rough guide).',
      m.instruction,
      'Include:',
      m.bullets.map(function (b) { return '- ' + b; }).join('\n'),
      '',
      '=== MARKING GUIDE ===',
      guide.note,
      '',
      'Composition (out of ' + marks.composition + '):',
      bands(guide.composition[lv], marks.composition),
      '',
      'SPaG (out of ' + marks.spag + '):',
      bands(guide.spag[lv], marks.spag),
      '',
      '=== THE ANSWER ===',
      draft.trim(),
      '',
      '=== WHAT TO SEND BACK ===',
      '1. A Composition mark out of ' + marks.composition + ' and a SPaG mark out of ' + marks.spag + ', with the band for each.',
      '2. Two things that worked well, each with a short quote from the answer.',
      '3. One thing to try next time, with a short example of how to do it.',
      'Please keep the feedback short, plain and encouraging. Do not rewrite the whole answer.'
    ];
    return lines.filter(function (l) { return l !== null; }).join('\n');
  }

  function copyText(textarea) {
    var text = textarea.value;
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(textarea); });
    }
    return Promise.resolve(legacyCopy(textarea));
  }

  function legacyCopy(textarea) {
    try {
      textarea.focus();
      textarea.select();
      return document.execCommand('copy');
    } catch (e) { return false; }
  }

  // ---------- Toolkit ----------

  function toolkitView() {
    var formats = content.toolkit.formats;
    var spag = forLevel(content.toolkit.spag);
    return h('div', { class: 'mission toolkit' },
      h('p', { class: 'eyebrow', text: 'Toolkit · ' + LEVELS[level()] }),
      h('h1', { text: 'Toolkit' }),
      h('p', { class: 'lede', text: 'Short guides you can dip into at any time. Each one ends with a quick practice question.' }),
      h('h2', { text: 'Kinds of writing' }),
      h('ul', { class: 'tool-list' }, formats.map(function (f) {
        return h('li', null, h('a', { href: '#/toolkit/format/' + f.id },
          h('span', { class: 't-name', text: f.name }), h('span', { class: 't-sum', text: f.summary })));
      })),
      h('h2', { text: 'Punctuation, spelling and grammar' }),
      h('p', { class: 'muted small', text: level() === 'L2' ? 'Showing everything for Level 2, including inverted commas and apostrophes for missing letters.' : 'Showing the points for Level 1. Switch to Level 2 to see two more.' }),
      h('ul', { class: 'tool-list' }, spag.map(function (s) {
        return h('li', null, h('a', { href: '#/toolkit/spag/' + s.id },
          h('span', { class: 't-name', text: s.name }), h('span', { class: 't-sum', text: s.explain[0] })));
      }))
    );
  }

  function toolView(kind, id) {
    var item = find(kind === 'format' ? content.toolkit.formats : content.toolkit.spag, id);
    if (!item) return notFound();
    var wrap = h('article', { class: 'mission toolkit' });
    append(wrap, h('p', { class: 'eyebrow', text: 'Toolkit · ' + (kind === 'format' ? 'Kinds of writing' : 'Punctuation, spelling and grammar') }));
    append(wrap, h('h1', { text: item.name }));

    if (kind === 'format') {
      append(wrap,
        h('p', { class: 'lede', text: item.summary }),
        h('h2', { text: 'Layout' }),
        h('ul', null, item.layout.map(function (l) { return h('li', { text: l }); })),
        h('h2', { text: 'Opening' }), h('p', { text: item.opening }),
        h('h2', { text: 'Closing' }), h('p', { text: item.closing }),
        h('h2', { text: 'Tone' }), h('p', { text: item.tone }),
        h('h2', { text: 'Checklist' }),
        h('ul', null, item.checklist.map(function (c) { return h('li', { text: c }); }))
      );
    } else {
      if (item.levels && item.levels.indexOf('L1') === -1) append(wrap, h('p', { class: 'notice', text: 'This point is in the Level 2 descriptors. It is still useful at Level 1.' }));
      append(wrap,
        h('ul', null, item.explain.map(function (e) { return h('li', { text: e }); })),
        h('div', { class: 'example-pair' },
          h('p', null, h('span', { class: 'lbl', text: 'Before' }), item.example.wrong),
          h('p', null, h('span', { class: 'lbl', text: 'After' }), item.example.right))
      );
    }

    var key = 'tool:' + kind + ':' + id;
    var ans = store.get(key, {});
    var q = { id: kind + '-' + id, type: 'choice', prompt: item.practice.prompt, options: item.practice.options, answer: item.practice.answer, why: item.practice.why, labelledBy: 'practice-q' };
    var again = h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn quiet', onclick: function () {
      store.remove(key); render({ keepFocus: true });
      var first = main.querySelector('.practice input');
      if (first) first.focus();
    }, text: 'Try it again' }));
    var section = h('section', { class: 'practice', 'aria-labelledby': 'practice-h' },
      h('h2', { id: 'practice-h', text: 'Quick practice' }),
      h('p', { class: 'question-prompt', id: 'practice-q', text: q.prompt }),
      closedQuestion(q, ans, function () { store.set(key, ans); }, function () { section.appendChild(again); }),
      ans.checked ? again : null
    );
    append(wrap, section);
    append(wrap, h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/toolkit', text: 'Back to the toolkit' })));
    return wrap;
  }

  // ---------- Misc ----------

  function find(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function notFound() {
    return h('div', null,
      h('h1', { text: 'That stop is not on the map' }),
      h('p', { text: 'The link might be old. Head back and pick a mission.' }),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/', text: 'Back to the map' })));
  }

  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ': ' + r.status);
      return r.json();
    });
  }

  function start() {
    setupLevelSwitch();
    Promise.all([
      loadJSON('content/reading.json'),
      loadJSON('content/writing.json'),
      loadJSON('content/toolkit.json')
    ]).then(function (res) {
      content = { reading: res[0], writing: res[1], toolkit: res[2] };
      window.addEventListener('hashchange', function () { render(); });
      render({ keepFocus: true });
    }).catch(function () {
      main.replaceChildren(h('div', { class: 'notice' },
        h('h1', { text: 'The missions did not load' }),
        h('p', { text: 'Try refreshing the page. If you opened the file straight from your computer, it needs to be served from a web address instead (for example, GitHub Pages or a local web server).' })));
    });
  }

  start();
})();
