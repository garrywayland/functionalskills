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

  // Practice answers should be the learner's own: no spell-check, autocorrect, capitals or grammar helpers.
  var NO_HELP = { spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', autocomplete: 'off', 'data-gramm': 'false', 'data-gramm_editor': 'false', 'data-enable-grammarly': 'false' };
  function plain(attrs) { var o = {}; Object.keys(NO_HELP).forEach(function (k) { o[k] = NO_HELP[k]; }); Object.keys(attrs).forEach(function (k) { o[k] = attrs[k]; }); return o; }

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

  function inLevel(m) {
    // Reading missions list their levels; writing missions use `levels` for per-level overrides.
    return !Array.isArray(m.levels) || m.levels.indexOf(level()) !== -1;
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

  // ---------- Progress log (dates of finished missions) ----------

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function readLog() {
    var log = store.get('log', []);
    return Array.isArray(log) ? log : [];
  }

  // One entry per mission, level and day. Finishing it again the same day updates that entry.
  function logDone(entry) {
    var log = readLog();
    entry.level = level();
    entry.date = today();
    for (var i = 0; i < log.length; i++) {
      if (log[i].id === entry.id && log[i].level === entry.level && log[i].date === entry.date) {
        log[i] = entry;
        store.set('log', log);
        return;
      }
    }
    log.push(entry);
    store.set('log', log);
  }

  function prettyDate(iso) {
    var p = String(iso).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
    else if (parts[0] === 'theme' && parts[1]) view = themeView(parts[1]);
    else if (parts[0] === 'learn' && parts[1] === 'mark' && parts[3]) view = learnSampleView(parts[2], parts[3]);
    else if (parts[0] === 'learn' && parts[1] === 'mark' && parts[2]) view = learnTaskView(parts[2]);
    else if (parts[0] === 'learn' && parts[1] === 'fix' && parts[2]) view = learnFixView(parts[2]);
    else if (parts[0] === 'learn') view = learnIndexView();
    else if (parts[0] === 'progress') view = progressView();
    else if (parts[0] === 'reading') view = readingIndexView();
    else if (parts[0] === 'writing') view = writingIndexView();
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
      var current = section === target;
      if (current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------- Home ----------

  // A mission marked status: "draft" is unchecked (for example, imported from another AI). It stays hidden
  // from the learner unless teacher view is switched on in the footer.
  function showDrafts() { return !!store.get('drafts', false); }
  function visible(m) { return m.status !== 'draft' || showDrafts(); }
  function themeList() { return content.themes; }
  function themeOrder() { return themeList().map(function (t) { return t.name; }); }
  function findTheme(id) { return find(themeList(), id); }
  function themeSlug(name) { var t = themeList().filter(function (x) { return x.name === name; })[0]; return t ? t.id : null; }
  function draftTag(m) { return m.status === 'draft' ? h('span', { class: 'draft-tag', text: 'Unchecked' }) : null; }

  function themeCounts(t) {
    var r = counts(levelReading().filter(function (m) { return m.topic === t.name; }));
    var w = counts(levelWriting().filter(function (m) { return m.topic === t.name; }));
    return { done: r.done + w.done, total: r.total + w.total };
  }

  function setupFooter() {
    var foot = document.querySelector('.site-footer');
    if (!foot) return;
    var btn = h('button', { type: 'button', class: 'linkish', 'aria-pressed': String(showDrafts()) });
    function label() { btn.textContent = 'Teacher view: unchecked missions ' + (showDrafts() ? 'shown' : 'hidden'); btn.setAttribute('aria-pressed', String(showDrafts())); }
    btn.addEventListener('click', function () { store.set('drafts', !showDrafts()); label(); render({ keepFocus: true }); });
    label();
    foot.appendChild(h('p', { class: 'small' }, btn));
  }

  function counts(list) {
    return { done: list.filter(function (m) { return isDone(m.id); }).length, total: list.length };
  }

  function levelReading() { return content.reading.missions.filter(inLevel).filter(visible); }
  function levelWriting() { return content.writing.missions.filter(inLevel).filter(visible); }

  // Pick one of these missions at random and go to it.
  function pickFrom(readingList, writingList) {
    var shortReading = readingList.filter(function (m) { return m.length !== 'long' && !isDone(m.id); }).map(function (m) { return '#/reading/' + m.id; });
    var shortWriting = writingList.filter(function (m) { return m.task === 2 && !isDone(m.id); }).map(function (m) { return '#/writing/' + m.id; });
    var pool = shortReading.concat(shortWriting);
    if (!pool.length) pool = readingList.filter(function (m) { return !isDone(m.id); }).map(function (m) { return '#/reading/' + m.id; })
      .concat(writingList.filter(function (m) { return !isDone(m.id); }).map(function (m) { return '#/writing/' + m.id; }));
    if (!pool.length) pool = readingList.map(function (m) { return '#/reading/' + m.id; }).concat(writingList.map(function (m) { return '#/writing/' + m.id; }));
    if (!pool.length) { location.hash = '#/learn'; return; }
    location.hash = pool[Math.floor(Math.random() * pool.length)];
  }

  function readingStop(m) {
    return { id: m.id, href: '#/reading/' + m.id, title: m.title, minutes: m.minutes, draft: m.status === 'draft',
      meta: m.length === 'long' ? m.texts.length + ' texts · ' + questionNumbers(m) + ' questions' : forLevel(m.questions).length + ' questions' };
  }
  function readingSub(m) { return m.length === 'long' ? 'Longer missions (about ' + (m.minutes || 35) + ' minutes)' : 'Short missions (about 10 minutes)'; }
  function writingStop(m) {
    var mm = missionFor(m);
    return { id: m.id, href: '#/writing/' + m.id, title: m.title, minutes: m.task === 1 ? 25 : 15, draft: m.status === 'draft',
      meta: formatName(mm.format) + ' · ' + content.writing.lengthGuide[String(m.task)][level()] };
  }
  function writingSub(m) { return m.task === 1 ? 'Longer tasks' : 'Shorter tasks'; }

  // A plain (not folded) list of stops, grouped by size. Used on a theme page.
  function stopGroups(missions, toStop, subLabel) {
    var labels = [];
    missions.forEach(function (m) { var l = subLabel(m); if (labels.indexOf(l) === -1) labels.push(l); });
    return labels.map(function (l) {
      return h('div', { class: 'menu-group' },
        labels.length > 1 ? h('h3', { class: 'menu-sub', text: l }) : null,
        h('ol', { class: 'stops' }, missions.filter(function (m) { return subLabel(m) === l; }).map(function (m) {
          var s = toStop(m); var done = isDone(s.id);
          return h('li', { class: 'stop' + (done ? ' done' : '') },
            h('a', { href: s.href },
              h('span', { class: 'stop-title', text: s.title }),
              s.draft ? h('span', { class: 'draft-tag', text: 'Unchecked' }) : null,
              h('span', { class: 'stop-state', text: done ? 'Done' : (s.minutes || 10) + ' min' }),
              h('span', { class: 'stop-meta', text: s.meta })));
        })));
    });
  }

  // The landing page: pick a theme. Skills that work with any theme sit underneath.
  function homeView() {
    main.className = 'home';
    var rAll = levelReading(), wAll = levelWriting();
    var shown = themeList().filter(function (t) { return themeCounts(t).total > 0; });
    var tk = content.toolkit.formats.concat(forLevel(content.toolkit.spag));
    var t = { done: tk.filter(function (x) { return isDone('tool-' + x.id); }).length, total: tk.length };
    var l = learnCounts();

    function themeCard(th, i) {
      var c = themeCounts(th);
      return h('li', { class: 'theme-card accent-' + (i % 4) },
        h('a', { href: '#/theme/' + th.id },
          h('span', { class: 'st-name', text: th.name }),
          h('span', { class: 'st-desc', text: th.blurb }),
          h('span', { class: 'st-count', text: c.done + ' of ' + c.total + ' done' })));
    }
    function skillCard(kind, href, name, desc, c) {
      return h('li', { class: 'station ' + kind },
        h('a', { href: href },
          h('span', { class: 'st-name', text: name }),
          h('span', { class: 'st-desc', text: desc }),
          h('span', { class: 'st-count', text: c.done + ' of ' + c.total + ' done' })));
    }

    return h('div', null,
      h('section', { class: 'map-intro' },
        h('h1', { text: 'What are you into?' }),
        h('p', { class: 'lede', text: 'Pick a theme. You will get reading and writing tasks about it. Each takes about ten minutes, or longer if you want a bigger one. You can stop whenever you like.' })),
      shown.length ? h('ul', { class: 'theme-grid' }, shown.map(themeCard)) : h('p', { class: 'notice', text: 'There are no missions at this level yet.' }),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { pickFrom(rAll, wAll); }, text: 'Pick one for me' }),
        h('a', { class: 'btn quiet', href: '#/progress', text: 'My progress' })),
      h('section', { class: 'skills', 'aria-labelledby': 'skills-h' },
        h('h2', { id: 'skills-h', text: 'Skills, any theme' }),
        h('ul', { class: 'skill-grid' },
          skillCard('learn', '#/learn', 'Learn by marking', 'Mark sample work and fix mistakes, like an examiner.', l),
          skillCard('toolkit', '#/toolkit', 'Practise a skill', 'Short drills on writing formats, punctuation, spelling and grammar.', t))),
      h('p', { class: 'muted small', text: 'You are on ' + LEVELS[level()] + '. Not sure which level? Nearly everything works at both. Use the switch at the top.' })
    );
  }

  function themeView(id) {
    var th = findTheme(id);
    if (!th) return notFound();
    main.className = 'home';
    var r = levelReading().filter(function (m) { return m.topic === th.name; });
    var w = levelWriting().filter(function (m) { return m.topic === th.name; });
    var learn = learnTasks().filter(function (t) { var raw = find(content.writing.missions, t.missionId); return raw && raw.topic === th.name; });
    function section(cls, title, blurb, body) {
      return h('section', { class: 'line ' + cls }, h('h2', { class: 'line-title', text: title }), h('p', { text: blurb }), body);
    }
    return h('div', null,
      sectionIntro(th.name, th.blurb),
      !r.length && !w.length ? h('p', { class: 'notice', text: 'Nothing here at ' + LEVELS[level()] + ' yet. Try the other level, or pick another theme.' }) : null,
      r.length ? section('reading', 'Reading', 'Read the text or texts, then answer questions one at a time.', stopGroups(r, readingStop, readingSub)) : null,
      w.length ? section('writing', 'Writing', 'Plan and write a piece, then get feedback if you want to.', stopGroups(w, writingStop, writingSub)) : null,
      learn.length ? section('learn', 'Learn by marking', 'Mark sample answers to tasks on this theme.', h('ul', { class: 'tool-list' }, learn.map(function (t) {
        var n = t.samples.filter(function (s) { return isDone('learn-' + s.id); }).length;
        return h('li', null, h('a', { href: '#/learn/mark/' + t.id }, h('span', { class: 't-name', text: t.title }), h('span', { class: 't-sum', text: n + ' of ' + t.samples.length + ' answers marked' })));
      }))) : null,
      h('div', { class: 'actions' },
        (r.length || w.length) ? h('button', { type: 'button', class: 'btn', onclick: function () { pickFrom(r, w); }, text: 'Pick one for me' }) : null,
        h('a', { class: 'btn quiet', href: '#/', text: 'All themes' })));
  }

  function sectionIntro(title, text) {
    return h('section', { class: 'map-intro' },
      h('p', { class: 'eyebrow', text: LEVELS[level()] }),
      h('h1', { text: title }),
      h('p', { class: 'lede', text: text }));
  }

  function readingIndexView() {
    main.className = 'home';
    return h('div', null,
      sectionIntro('Reading', 'Open a theme, then pick a mission. Short ones take about 10 minutes. The longer ones have three texts and 15 questions, like the real paper.'),
      menuSection('reading', 'Reading missions', 'Read the text or texts, then answer questions one at a time.', levelReading(), readingStop, readingSub),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  function writingIndexView() {
    main.className = 'home';
    return h('div', null,
      sectionIntro('Writing', 'Open a theme, then pick a task. Shorter tasks take about 15 minutes and longer ones about 25.'),
      menuSection('writing', 'Writing tasks', 'Plan and write a piece, then get feedback if you want to.', levelWriting(), writingStop, writingSub),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  // How many numbered questions a mission has (1(a) and 1(b) count as one).
  function questionNumbers(m) {
    var seen = {};
    forLevel(m.questions).forEach(function (q, i) { seen[q.label ? String(q.label).split('(')[0] : 'n' + i] = true; });
    return Object.keys(seen).length;
  }

  // One folded menu per topic. Open or closed is remembered on this device.
  function menuSection(kind, title, blurb, missions, toStop, subLabel) {
    var hid = 'line-' + kind;
    var topics = themeOrder().filter(function (t) { return missions.some(function (m) { return m.topic === t; }); });
    missions.forEach(function (m) { if (topics.indexOf(m.topic) === -1) topics.push(m.topic); });

    function stopItem(m) {
      var s = toStop(m);
      var done = isDone(s.id);
      return h('li', { class: 'stop' + (done ? ' done' : '') },
        h('a', { href: s.href },
          h('span', { class: 'stop-title', text: s.title }),
          s.draft ? h('span', { class: 'draft-tag', text: 'Unchecked' }) : null,
          h('span', { class: 'stop-state', text: done ? 'Done' : (s.minutes || 10) + ' min' }),
          h('span', { class: 'stop-meta', text: s.meta })
        ));
    }

    return h('section', { class: 'line ' + kind, 'aria-labelledby': hid },
      h('h2', { class: 'line-title', id: hid, text: title }),
      h('p', { text: blurb }),
      topics.map(function (topic) {
        var items = missions.filter(function (m) { return m.topic === topic; });
        var done = items.filter(function (m) { return isDone(m.id); }).length;
        var key = kind + ':' + topic;
        var labels = [];
        items.forEach(function (m) { var l = subLabel(m); if (labels.indexOf(l) === -1) labels.push(l); });
        var det = h('details', { class: 'menu' },
          h('summary', null,
            h('span', { class: 'menu-name', text: topic }),
            h('span', { class: 'menu-count', text: done + ' of ' + items.length + ' done' })),
          labels.map(function (l) {
            return h('div', { class: 'menu-group' },
              labels.length > 1 ? h('h3', { class: 'menu-sub', text: l }) : null,
              h('ol', { class: 'stops' }, items.filter(function (m) { return subLabel(m) === l; }).map(stopItem)));
          }));
        if ((store.get('menus', {}) || {})[key]) det.open = true;
        det.addEventListener('toggle', function () {
          var o = store.get('menus', {}) || {};
          if (det.open) o[key] = true; else delete o[key];
          store.set('menus', o);
        });
        return det;
      })
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
    if (!inLevel(m)) return wrongLevel(m);
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
    append(wrap, h('p', { class: 'eyebrow', text: 'Reading · ' + m.topic + ' · ' + LEVELS[level()] }), draftTag(m));

    if (step.kind === 'text') {
      var t = step.text;
      append(wrap, h('h1', { text: step.index === 0 ? m.title : 'Now read Text ' + t.id }));
      if (step.index === 0) {
        append(wrap, h('section', { class: 'howto', 'aria-labelledby': 'howto-h' },
          h('h2', { id: 'howto-h', text: 'What to do' }),
          h('ol', null,
            h('li', { text: multi ? 'Read the texts one at a time: ' + built.texts.map(function (x) { return 'Text ' + x.id; }).join(', then ') + '. Each has its own screen.' : 'Read the text below. Take your time.' }),
            h('li', { text: 'Answer ' + (m.length === 'long' ? questionNumbers(m) : questionCount) + ' questions, one at a time.' + (m.length === 'long' ? ' Some are worth more than one mark, and the screen tells you how many.' : '') }),
            h('li', { text: 'You can look back at the texts whenever you like.' }),
            m.length === 'long' ? h('li', { text: 'You can stop and come back later. Your place is saved on this device.' }) : null
          )
        ));
      }
      if (step.index === 0 && m.intro) append(wrap, h('p', { class: 'lede', text: m.intro }));
      append(wrap, sourceText(t, multi));
      var last = step.index === built.texts.length - 1;
      append(wrap, h('div', { class: 'actions' },
        pos > 0 ? h('a', { class: 'btn quiet', href: hrefFor(pos - 1), text: 'Back' }) : h('a', { class: 'btn quiet', href: '#/reading', text: 'Back to reading' }),
        h('a', { class: 'btn', href: hrefFor(pos + 1), text: last ? "I've read it. Start the questions" : 'Next: Text ' + built.texts[step.index + 1].id })
      ));
      return wrap;
    }

    if (step.kind === 'question') {
      var q = step.q;
      var ans = saved.answers[q.id] || (saved.answers[q.id] = {});
      var where = (step.index + 1) + ' of ' + questionCount;
      append(wrap, h('p', { class: 'step-count', text: q.label
        ? 'Question ' + q.label + (q.marks ? ' · ' + q.marks + (q.marks === 1 ? ' mark' : ' marks') : '') + ' · ' + where
        : 'Question ' + where }));

      var layout = h('div', { class: 'q-layout' });
      var qCol = h('div', { class: 'q-col' });
      layout.appendChild(qCol);

      var refIds = q.text && q.text !== 'both' ? String(q.text).split(',') : null;
      var refTexts = refIds ? built.texts.filter(function (t) { return refIds.indexOf(t.id) !== -1; }) : built.texts;
      if (multi) append(qCol, h('p', { class: 'look-at', text: refIds ? 'Look at ' + refIds.map(function (x) { return 'Text ' + x; }).join(' and ') + '.' : (built.texts.length > 2 ? 'Use all the texts.' : 'Use both texts.') }));

      var lead = promptFor(q);
      append(qCol, h('h1', { class: 'question-prompt', id: 'qp-' + q.id, text: lead ? lead : q.prompt }));
      if (lead) append(qCol, h('p', { class: 'question-prompt', id: 'qs-' + q.id, text: q.prompt }));
      q.labelledBy = 'qp-' + q.id + (lead ? ' qs-' + q.id : '');

      var next = h('a', { class: 'btn', href: hrefFor(pos + 1), text: step.index === questionCount - 1 ? 'Finish' : 'Next question' });

      if (q.type === 'open') append(qCol, openQuestion(q, ans, save));
      else if (q.type === 'multi') append(qCol, multiQuestion(q, ans, save));
      else if (q.type === 'match') append(qCol, matchQuestion(q, ans, save));
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
    var closed = forLevel(m.questions).filter(function (q) { return q.type !== 'open'; });
    var matched = closed.filter(function (q) { var a = saved.answers[q.id]; return a && a.checked && isCorrect(q, a); }).length;
    var openCount = forLevel(m.questions).length - closed.length;
    markDone(id);
    logDone({ id: id, kind: 'Reading', title: m.title, topic: m.topic, matched: matched, total: closed.length });
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
        h('a', { class: 'btn', href: '#/reading', text: 'Back to reading' }),
        h('button', { type: 'button', class: 'btn quiet', onclick: function () {
          store.remove(key);
          go(hrefFor(0));
        }, text: 'Do it again' })
      ),
      scoreSlot
    );
    return wrap;
  }

  function isCorrect(q, a) {
    if (q.type === 'match') {
      return q.items.every(function (it, i) { return it.given || String((a.map || {})[i]) === String(it.answer); });
    }
    if (q.type === 'multi') {
      var got = (a.choices || []).slice().sort().join(',');
      return got === q.answer.slice().sort().join(',');
    }
    return a.choice === answerIndex(q);
  }

  // Matching: give each heading the number of the paragraph it fits. Some are done for the learner.
  function matchQuestion(q, ans, save, onChecked) {
    if (!ans.map) ans.map = {};
    var box = h('div');
    var fbSlot = h('div', { 'aria-live': 'polite' });
    var checkBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Check my answer' });
    var selects = [];
    var list = h('ul', { class: 'match-list', 'aria-labelledby': q.labelledBy });

    function ready() {
      return q.items.every(function (it, i) { return it.given || ans.map[i]; });
    }

    q.items.forEach(function (it, i) {
      var sel = h('select', { id: 'match-' + q.id + '-' + i, 'aria-label': 'Paragraph number for: ' + it.label });
      sel.appendChild(h('option', { value: '', text: 'Choose' }));
      for (var n = 1; n <= q.paragraphs; n++) sel.appendChild(h('option', { value: String(n), text: 'Paragraph ' + n }));
      if (it.given) { sel.value = String(it.answer); sel.disabled = true; }
      else if (ans.map[i]) sel.value = String(ans.map[i]);
      if (ans.checked) sel.disabled = true;
      sel.addEventListener('change', function () { ans.map[i] = sel.value; save(); checkBtn.disabled = !ready(); });
      selects.push(sel);
      list.appendChild(h('li', { class: 'match-row' },
        h('label', { for: sel.id, class: 'match-label', text: it.label }),
        sel,
        it.given ? h('span', { class: 'muted small', text: 'done for you' }) : null));
    });
    box.appendChild(list);

    function showFeedback() {
      var gaps = q.items.filter(function (it) { return !it.given; });
      var right = 0;
      q.items.forEach(function (it, i) {
        selects[i].disabled = true;
        if (it.given) return;
        if (String(ans.map[i]) === String(it.answer)) right++;
      });
      fbSlot.replaceChildren(h('div', { class: 'feedback' },
        h('p', { class: 'fb-head', text: right === gaps.length ? 'Yes, they all match.' : right + ' of ' + gaps.length + ' match. Here is the full set.' }),
        h('ul', null, q.items.map(function (it) { return h('li', { text: it.label + ': paragraph ' + it.answer }); })),
        h('p', { text: q.why })));
      checkBtn.remove();
    }

    checkBtn.disabled = !ready();
    checkBtn.addEventListener('click', function () {
      if (!ready()) return;
      ans.checked = true; save(); showFeedback();
      if (onChecked) onChecked();
      var fb = fbSlot.querySelector('.feedback');
      if (fb) { fb.setAttribute('tabindex', '-1'); fb.focus(); }
    });
    if (ans.checked) showFeedback(); else box.appendChild(h('div', { class: 'actions' }, checkBtn));
    box.appendChild(fbSlot);
    return box;
  }

  // "Choose TWO" style questions: tick the right number of boxes.
  function multiQuestion(q, ans, save, onChecked) {
    var need = q.answer.length;
    if (!Array.isArray(ans.choices)) ans.choices = [];
    var box = h('div');
    var fbSlot = h('div', { 'aria-live': 'polite' });
    var checkBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Check my answer' });
    var fs = h('fieldset', { class: 'options', 'aria-labelledby': q.labelledBy });
    var labels = q.options.map(function (text, i) {
      var input = h('input', { type: 'checkbox', value: String(i) });
      input.checked = ans.choices.indexOf(i) !== -1;
      if (ans.checked) input.disabled = true;
      input.addEventListener('change', function () {
        var at = ans.choices.indexOf(i);
        if (input.checked && at === -1) ans.choices.push(i);
        if (!input.checked && at !== -1) ans.choices.splice(at, 1);
        save();
        checkBtn.disabled = ans.choices.length !== need;
      });
      var lab = h('label', { class: 'option' + (ans.checked ? ' locked' : '') }, input, h('span', { text: text }));
      fs.appendChild(lab);
      return lab;
    });
    box.appendChild(h('p', { class: 'look-at', text: 'Choose ' + need + ' answers.' }));
    box.appendChild(fs);

    function showFeedback() {
      labels.forEach(function (lab, i) {
        lab.classList.add('locked');
        lab.querySelector('input').disabled = true;
        if (q.answer.indexOf(i) !== -1) {
          lab.classList.add('is-answer');
          lab.appendChild(h('span', { class: 'tag', text: 'Answer' }));
        }
      });
      var hit = ans.choices.filter(function (c) { return q.answer.indexOf(c) !== -1; }).length;
      var all = hit === need && ans.choices.length === need;
      fbSlot.replaceChildren(h('div', { class: 'feedback' },
        h('p', { class: 'fb-head', text: all ? 'Yes, both match the answers.' : (hit ? 'One of your choices matches. The answers are marked above.' : 'The answers are marked above.') }),
        h('p', { text: q.why })
      ));
      checkBtn.remove();
    }

    checkBtn.disabled = ans.choices.length !== need;
    checkBtn.addEventListener('click', function () {
      if (ans.choices.length !== need) return;
      ans.checked = true; save(); showFeedback();
      if (onChecked) onChecked();
      var fb = fbSlot.querySelector('.feedback');
      if (fb) { fb.setAttribute('tabindex', '-1'); fb.focus(); }
    });
    if (ans.checked) showFeedback(); else box.appendChild(h('div', { class: 'actions' }, checkBtn));
    box.appendChild(fbSlot);
    return box;
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
        h('p', { class: 'fb-head', text: same ? 'Yes, that matches the answer.' : 'The answer is: ' + opts[right] + (/[.?!"\u201d]$/.test(opts[right]) ? '' : '.') }),
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
    var ta = h('textarea', plain({ id: id, rows: '5' }));
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
      blocks(t.body, compact, t.numbered)
    );
  }

  // Text with **bold** words, built from text nodes only (never innerHTML).
  function rich(text) {
    return String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(function (part) {
      return /^\*\*[^*]+\*\*$/.test(part) ? h('strong', { text: part.slice(2, -2) }) : part;
    });
  }

  function blocks(list, compact, numbered) {
    var pn = 0;
    return (list || []).map(function (b) {
      if (b.h) return h(compact ? 'h4' : 'h3', { text: b.h });
      if (b.p) {
        if (!numbered) return h('p', null, rich(b.p));
        pn += 1;
        return h('p', { class: 'numbered' }, h('span', { class: 'pnum', 'aria-label': 'Paragraph ' + pn, text: String(pn) }), rich(b.p));
      }
      if (b.box) return h('div', { class: 'text-box' }, rich(b.box));
      if (b.callout) return h('p', { class: 'callout' }, rich(b.callout));
      if (b.ul) return h('ul', null, b.ul.map(function (li) { return h('li', null, rich(li)); }));
      if (b.ol) return h('ol', null, b.ol.map(function (li) { return h('li', null, rich(li)); }));
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

  // Plan and Write keep the task in view: beside the work on wide screens. On narrow ones a button
  // slides the task up over the page, and a second tap (or Escape) puts it away.
  function splitLayout(m, format, length, plan, withPlan, work) {
    var pane = h('aside', { class: 'task-pane', id: 'task-pane', 'aria-label': 'The task' });
    var closeBtn = h('button', { type: 'button', class: 'btn quiet sheet-close', text: 'Close' });
    var openBtn = h('button', { type: 'button', class: 'btn sheet-open-btn', 'aria-controls': 'task-pane', 'aria-expanded': 'false', text: 'Show the task' });
    append(pane,
      h('div', { class: 'pane-head' }, h('h2', { text: 'The task' }), closeBtn),
      taskCard(m, format, length),
      withPlan ? h('div', { class: 'pane-plan' }, h('h3', { text: 'My plan' }), planPeekOpen(m, plan)) : null,
      withPlan && m.indicative ? h('details', { class: 'plan-peek' },
        h('summary', { text: 'Ideas you could use (try writing first)' }),
        h('p', { class: 'muted small', text: 'These are examples of ideas. You do not need to use them, and other good ideas count too.' }),
        h('dl', null, m.bullets.map(function (b, i) { return [h('dt', { text: b }), h('dd', { text: m.indicative[i] || '' })]; }))) : null);

    function setOpen(on) {
      pane.classList.toggle('sheet-on', on);
      openBtn.setAttribute('aria-expanded', String(on));
      openBtn.textContent = on ? 'Hide the task' : 'Show the task';
      if (on) closeBtn.focus({ preventScroll: true }); 
    }
    openBtn.addEventListener('click', function () { setOpen(!pane.classList.contains('sheet-on')); if (!pane.classList.contains('sheet-on')) openBtn.focus(); });
    closeBtn.addEventListener('click', function () { setOpen(false); openBtn.focus(); });
    pane.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pane.classList.contains('sheet-on')) { setOpen(false); openBtn.focus(); } });
    return h('div', { class: 'split' }, pane, h('div', { class: 'work-pane' }, work), openBtn);
  }

  function planPeekOpen(m, plan) {
    var fields = planFields(m).filter(function (f) { return plan[f.key]; });
    if (!fields.length) return h('p', { class: 'muted small' }, 'No plan yet. ', h('a', { href: '#/writing/' + m.id + '/plan', text: 'Make a quick plan' }), ' or just start writing.');
    return h('dl', null, fields.map(function (f) { return [h('dt', { text: f.label }), h('dd', { text: plan[f.key] })]; }));
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
    append(wrap, h('p', { class: 'eyebrow', text: 'Writing · ' + m.topic + ' · ' + LEVELS[level()] }), draftTag(m));
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
    var backBtn = idx > 0 ? h('a', { class: 'btn quiet', href: hrefFor(stepIds[idx - 1]), text: 'Back' }) : h('a', { class: 'btn quiet', href: '#/writing', text: 'Back to writing' });

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
      main.className = 'wide';
      append(wrap, splitLayout(m, format, length, saved.plan, false, [
        h('h1', { text: 'Plan it' }),
        h('p', { class: 'lede', text: 'Jot down a few words for each box. Notes are fine; you do not need full sentences here.' }),
        fields.map(function (f) {
          var fid = 'plan-' + f.key;
          var ta = h('textarea', plain({ id: fid, rows: '3' }));
          ta.value = saved.plan[f.key] || '';
          ta.addEventListener('input', function () { saved.plan[f.key] = ta.value; save(); });
          return h('div', null,
            h('label', { class: 'field', for: fid }, f.label, h('span', { class: 'hint', text: f.hint })),
            ta);
        }),
        h('div', { class: 'actions' }, backBtn, nextBtn)
      ]));
    }

    if (step === 'write') {
      var countEl = h('span', { class: 'word-count' });
      var status = h('span', { class: 'visually-hidden', role: 'status' });
      var box = h('textarea', plain({ id: 'draft', class: 'big' }));
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

      main.className = 'wide';
      append(wrap, splitLayout(m, format, length, saved.plan, true, [
        h('h1', { text: 'Write it' }),
        h('p', { class: 'lede', text: 'Aim for ' + length + ' (a rough guide).' }),
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
      ]));
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
            logDone({ id: id, kind: 'Writing', title: m.title, topic: m.topic, words: words, task: m.task });
            msg.textContent = 'Copied. Paste it into a message to whoever is marking your work.';
          } else {
            out.focus(); out.select();
            msg.textContent = 'Could not copy automatically. The text is selected: press Ctrl+C, or long-press and choose Copy.';
          }
        });
      });
      var live = markingEndpoint();
      append(wrap,
        h('h1', { text: live ? 'Get feedback' : 'Send for marking' }),
        live ? feedbackSection(m, format, draft, words, id) : null,
        live ? h('h2', { text: 'Or copy it to send somewhere else' }) : null,
        h('p', { class: live ? 'muted' : 'lede', text: live
          ? 'This puts the task, a marking guide and your writing together in one block of text.'
          : 'Nothing is sent from this page. It puts the task, a marking guide and your writing into one block of text, and you choose where to send it.' }),
        aiHelp(),
        h('p', { class: 'muted', text: words + ' words. The block does not include your name.' }),
        h('label', { class: 'field', for: 'marking' }, 'Text to copy'),
        out,
        h('div', { class: 'actions' }, copyBtn,
          h('button', { type: 'button', class: 'btn secondary', onclick: function () {
            markDone(id);
            logDone({ id: id, kind: 'Writing', title: m.title, topic: m.topic, words: words, task: m.task });
            msg.textContent = 'Marked as done. You can still come back and change it.';
          }, text: "I'm done with this one" }),
          h('span', { class: 'spacer' }),
          backBtn),
        msg,
        h('p', { class: 'muted small' }, h('a', { href: '#/writing', text: 'Back to writing' }))
      );
    }

    return wrap;
  }

  // Plain steps for getting feedback by pasting into an AI chat.
  function aiHelp() {
    return h('section', { class: 'howto', 'aria-labelledby': 'aihelp-h' },
      h('h2', { id: 'aihelp-h', text: 'How to get feedback from an AI chat' }),
      h('ol', null,
        h('li', { text: 'Press Copy below. It copies the task, a marking guide and your writing.' }),
        h('li', { text: 'Open an AI chat that you or your family trust, and start a new conversation.' }),
        h('li', { text: 'Paste and send. Do not add your name or any personal details.' }),
        h('li', { text: 'Read the reply: marks, two things that worked and one thing to try. Make a change, then paste your new version and ask it to mark again.' })),
      h('p', { class: 'muted small', text: 'Before you use any AI tool, check its privacy settings. Many free tools may keep what you type and use it to improve their systems. If there is a setting to turn that off, switch it off. AI marks are a guide and can be a mark or two out, so show your teacher too.' }),
      h('details', { class: 'plan-peek' },
        h('summary', { text: 'Questions you can ask next' }),
        h('ul', null,
          h('li', { text: 'Show me how to improve my weakest paragraph.' }),
          h('li', { text: 'Which bullet point did I cover least?' }),
          h('li', { text: 'Check only my spelling and punctuation.' }),
          h('li', { text: 'Explain why you gave that SPaG mark, with examples from my writing.' }),
          h('li', { text: 'What would I need to change to reach the top band?' }))));
  }

  // ---------- AI feedback (only when a marking service address is set in js/config.js) ----------

  function markingEndpoint() {
    var c = window.NEXTSTOP_CONFIG;
    var url = c && typeof c.markingEndpoint === 'string' ? c.markingEndpoint.trim() : '';
    return /^https:\/\/[^\s]+$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url) ? url.replace(/\/+$/, '') : '';
  }

  function hashText(t) {
    var n = 0;
    for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) | 0;
    return n;
  }

  function feedbackSection(m, format, draft, words, id) {
    var key = 'feedback:' + id + ':' + level();
    var shown = store.get(key, null);
    var box = h('section', { 'aria-labelledby': 'fb-h' });
    var results = h('div', { 'aria-live': 'polite' });
    var status = h('p', { class: 'status', role: 'status' });
    var btn = h('button', { type: 'button', class: 'btn', text: shown ? 'Get new feedback' : 'Get feedback' });

    function renderResult(saved) {
      var fb = saved.feedback;
      var stale = saved.hash !== hashText(draft);
      var marksBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Show my marks' });
      var marksSlot = h('div');
      marksBtn.addEventListener('click', function () {
        marksBtn.remove();
        marksSlot.appendChild(h('div', { class: 'score-box' },
          h('p', null, h('strong', { text: 'Composition: ' + fb.composition.mark + ' out of ' + fb.composition.max }), ' (' + fb.composition.band + ' band)'),
          h('p', { class: 'muted small', text: fb.composition.description }),
          h('p', null, h('strong', { text: 'Spelling, punctuation and grammar: ' + fb.spag.mark + ' out of ' + fb.spag.max }), ' (' + fb.spag.band + ' band)'),
          h('p', { class: 'muted small', text: fb.spag.description }),
          h('p', { class: 'muted small', text: 'These marks come from an AI using our own plain-English marking guide. They are a guide, not an official mark, and could be a mark or two out either way.' })));
      });
      var card = h('div', { class: 'feedback', tabindex: '-1' },
        stale ? h('p', { class: 'muted small', text: 'You have changed your writing since this feedback was given.' }) : null,
        h('h3', { text: 'Two things that worked' }),
        h('ul', { class: 'worked' }, fb.worked.map(function (w) {
          return h('li', null, w.what, w.quote ? h('blockquote', { text: '\u201c' + w.quote + '\u201d' }) : null);
        })),
        h('h3', { text: 'One thing to try' }),
        h('p', { text: fb.target.what }),
        h('p', { class: 'try-example' }, h('strong', { text: 'For example: ' }), fb.target.example.replace(/^\s*for example[:,]?\s*/i, '')),
        marksBtn, marksSlot);
      results.replaceChildren(card);
      return card;
    }

    if (shown && shown.feedback) renderResult(shown);

    btn.addEventListener('click', function () {
      var format_ = format ? format.name : m.format;
      var payload = {
        level: level(), task: m.task, format: format_, context: m.context, audience: m.audience, purpose: m.purpose,
        instruction: m.instruction, bullets: m.bullets, answer: draft
      };
      if (m.info && m.info.length) payload.info = m.info;
      btn.disabled = true;
      status.textContent = 'Marking your writing. This can take up to a minute.';
      var controller = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 110000);
      fetch(markingEndpoint() + '/mark', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      }).then(function (r) {
        return r.json().then(function (j) { return { status: r.status, body: j }; }, function () { return { status: r.status, body: {} }; });
      }).then(function (res) {
        clearTimeout(timer);
        btn.disabled = false;
        var b = res.body || {};
        if (b.ok && b.feedback && Array.isArray(b.feedback.worked)) {
          var saved = { hash: hashText(draft), date: today(), feedback: b.feedback };
          store.set(key, saved);
          markDone(id);
          logDone({ id: id, kind: 'Writing', title: m.title, topic: m.topic, words: words, task: m.task });
          status.textContent = 'Here is your feedback.';
          btn.textContent = 'Get new feedback';
          var card = renderResult(saved);
          card.focus();
        } else if (b.ok === false && b.reason === 'declined') {
          status.textContent = 'The marking service could not mark this one. Your writing is safe. Please use Copy instead.';
        } else {
          status.textContent = (typeof b.error === 'string' && b.error ? b.error : 'Marking is not available right now.') + ' Your writing is safe.';
        }
      }).catch(function () {
        clearTimeout(timer);
        btn.disabled = false;
        status.textContent = 'Could not reach the marking service. Your writing is safe. Please try again, or use Copy.';
      });
    });

    append(box,
      h('h2', { id: 'fb-h', text: 'Feedback on your writing' }),
      h('p', { text: 'You will get two things that worked and one thing to try. You choose whether to see the marks.' }),
      h('p', { class: 'muted small', text: 'When you press the button, your task and your writing are sent to our marking service, which uses AI (Anthropic\u2019s Claude). Your name is not sent and nothing is kept. AI feedback is a guide, not an official mark.' }),
      h('div', { class: 'actions' }, btn),
      status, results);
    return box;
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
      'Please mark a piece of Functional Skills English writing the way a careful examiner would. The writer is a learner aged about 17. Follow the instructions at the end.',
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
      'Suggested length: ' + length + ' (a suggestion only).',
      m.instruction,
      'The answer should include:',
      m.bullets.map(function (b) { return '- ' + b; }).join('\n'),
      ''
    ];
    if (m.indicative && m.indicative.length) {
      lines.push('=== IDEAS A GOOD ANSWER MIGHT USE (indicative content) ===',
        'These are examples only, not a checklist. Give credit for other relevant ideas.',
        m.bullets.map(function (b, i) { return '- ' + b + ': ' + (m.indicative[i] || ''); }).join('\n'),
        '');
    }
    lines.push(
      '=== MARK SCHEME ===',
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
      '=== HOW TO MARK ===',
      '1. Mark Composition and SPaG separately, using only the mark scheme above.',
      '2. Be fair and slightly cautious. Do not inflate marks. If you are unsure between two marks, choose the lower one.',
      '   (In Pearson\'s own trials, the average learner scored in the middle of the middle band, and grammar, especially verb tenses and articles, was the weakest area. Keep top-band marks for work that is consistently strong.)',
      '3. Check each bullet point in the task and say whether it was covered fully, partly or not at all.',
      '4. Use short exact quotes from the answer as evidence.',
      '',
      '=== PLEASE REPLY IN THIS FORMAT ===',
      'Composition: a mark out of ' + marks.composition + ' and the band.',
      'SPaG: a mark out of ' + marks.spag + ' and the band.',
      'Bullet points: one line for each, saying covered, partly covered or not covered.',
      'Two things that worked: each with a short quote from the answer.',
      'One thing to try next time: with a short example of how to do it.',
      'Keep it short, plain and encouraging. Do not rewrite the whole answer.'
    );
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

  // ---------- Progress and export ----------

  function csvCell(v) {
    var t = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // stop spreadsheets reading text as a formula
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function exportRows(entries, withResults) {
    return entries.map(function (e) {
      var detail = e.kind === 'Writing' ? (e.words ? e.words + ' words written' : '') : e.kind === 'Learn' ? '' : e.kind === 'Toolkit' ? (e.total + ' practice questions' + (withResults && typeof e.matched === 'number' ? ', ' + e.matched + ' matched' : '')) : '';
      if (e.kind === 'Reading' && withResults && typeof e.total === 'number') detail = e.matched + ' of ' + e.total + ' choice answers matched';
      return { date: e.date, kind: e.kind, title: e.title, topic: e.topic, level: LEVELS[e.level] || e.level, detail: detail, words: e.kind === 'Writing' ? (e.words || 0) : '', matched: withResults && e.kind === 'Reading' ? e.matched : '', total: withResults && e.kind === 'Reading' ? e.total : '' };
    });
  }

  function summaryOf(entries) {
    var days = {};
    var words = 0, reading = 0, writing = 0, practice = 0;
    entries.forEach(function (e) {
      days[e.date] = true;
      if (e.kind === 'Writing') { writing++; words += e.words || 0; }
      else if (e.kind === 'Toolkit' || e.kind === 'Learn') practice++;
      else reading++;
    });
    var dates = Object.keys(days).sort();
    return { missions: reading + writing, practice: practice, days: dates.length, words: words, reading: reading, writing: writing, first: dates[0], last: dates[dates.length - 1] };
  }

  function textExport(entries, name, withResults) {
    var sum = summaryOf(entries);
    var lines = ['Next Stop: English practice record'];
    if (name) lines.push('Name: ' + name);
    lines.push('Printed: ' + prettyDate(today()));
    lines.push('');
    lines.push(sum.missions + ' missions done on ' + sum.days + (sum.days === 1 ? ' day' : ' different days') + (sum.first ? ' (' + prettyDate(sum.first) + ' to ' + prettyDate(sum.last) + ')' : '') + '.');
    lines.push(sum.reading + ' reading, ' + sum.writing + ' writing, ' + sum.practice + ' toolkit practice sets, ' + sum.words + ' words written.');
    lines.push('');
    exportRows(entries, withResults).forEach(function (r) {
      lines.push(prettyDate(r.date) + ' | ' + r.kind + ' | ' + r.title + ' (' + r.topic + ', ' + r.level + ')' + (r.detail ? ' | ' + r.detail : ''));
    });
    lines.push('');
    lines.push('Kept by the learner in their own browser. Each line is added when a mission is finished.');
    return lines.join('\n');
  }

  function csvExport(entries, name, withResults) {
    var cols = ['Date', 'Type', 'Mission', 'Topic', 'Level', 'Words written'];
    if (withResults) cols.push('Choice answers matched', 'Choice questions');
    if (name) cols.unshift('Name');
    var out = [cols.map(csvCell).join(',')];
    exportRows(entries, withResults).forEach(function (r) {
      var row = [r.date, r.kind, r.title, r.topic, r.level, r.words];
      if (withResults) row.push(r.matched, r.total);
      if (name) row.unshift(name);
      out.push(row.map(csvCell).join(','));
    });
    return out.join('\r\n') + '\r\n';
  }

  function download(filename, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function progressView() {
    var all = readLog().slice().reverse();
    all.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var state = { name: '', results: false };

    var wrap = h('article', { class: 'mission progress' });
    append(wrap, h('p', { class: 'eyebrow no-print', text: 'Progress' }));
    append(wrap, h('h1', { text: 'My progress' }));

    if (!all.length) {
      append(wrap,
        h('p', { class: 'lede', text: 'Nothing here yet. Each mission you finish is added, with the date.' }),
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/', text: 'Choose something to do' })));
      return wrap;
    }

    var sum = summaryOf(all);
    var printHead = h('p', { class: 'print-only' });
    function setPrintHead() { printHead.textContent = (state.name ? 'Name: ' + state.name + '. ' : '') + 'Printed ' + prettyDate(today()) + '.'; }
    setPrintHead();

    var statsEl = h('dl', { class: 'stats' + (sum.practice ? ' four' : '') },
      stat(sum.missions, sum.missions === 1 ? 'mission done' : 'missions done'),
      stat(sum.days, sum.days === 1 ? 'day practised' : 'days practised'),
      stat(sum.words, 'words written'),
      sum.practice ? stat(sum.practice, sum.practice === 1 ? 'practice set' : 'practice sets') : null);
    function stat(n, label) { return h('div', null, h('dt', { text: label }), h('dd', { text: String(n) })); }

    var tableSlot = h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Finished missions' });
    function drawTable() {
      var rows = exportRows(all, state.results);
      tableSlot.replaceChildren(h('table', { class: 'log-table' },
        h('thead', null, h('tr', null, ['Date', 'Mission', 'Level', 'Details'].map(function (c) { return h('th', { scope: 'col', text: c }); }))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', null,
            h('td', { text: prettyDate(r.date) }),
            h('td', null, r.title, h('span', { class: 'muted small' }, ' · ' + r.kind + ' · ' + r.topic)),
            h('td', { text: r.level }),
            h('td', { text: r.detail }));
        }))));
    }
    drawTable();

    var nameInput = h('input', { type: 'text', id: 'export-name', autocomplete: 'off', maxlength: '60' });
    nameInput.addEventListener('input', function () { state.name = nameInput.value.trim(); setPrintHead(); });
    var resultsBox = h('input', { type: 'checkbox' });
    resultsBox.addEventListener('change', function () { state.results = resultsBox.checked; drawTable(); });

    var msg = h('p', { class: 'status no-print', role: 'status' });
    var area = h('textarea', { class: 'marking-block', readonly: true, rows: '8', 'aria-label': 'Progress as text' });
    area.hidden = true;

    var copyBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Copy as text' });
    copyBtn.addEventListener('click', function () {
      area.hidden = false;
      area.value = textExport(all, state.name, state.results);
      copyText(area).then(function (ok) {
        if (ok) { msg.textContent = 'Copied. Paste it into an email or message.'; area.hidden = true; }
        else { area.focus(); area.select(); msg.textContent = 'Could not copy automatically. The text is selected: press Ctrl+C, or long-press and choose Copy.'; }
      });
    });

    var clearBtn = h('button', { type: 'button', class: 'btn quiet', text: 'Start a fresh record' });
    var armed = false;
    clearBtn.addEventListener('click', function () {
      if (!armed) { armed = true; clearBtn.textContent = 'Really clear it? Click again'; msg.textContent = 'This removes the dates and the done ticks on this device. Drafts stay.'; return; }
      store.remove('log'); store.remove('done');
      render({ keepFocus: true });
    });

    append(wrap,
      h('p', { class: 'lede no-print', text: 'Every finished mission is listed here with its date. You can print this page, save it as a PDF, or send it to your teacher.' }),
      printHead,
      statsEl,
      h('section', { class: 'no-print', 'aria-labelledby': 'exp-h' },
        h('h2', { id: 'exp-h', text: 'Before you export' }),
        h('label', { class: 'field', for: 'export-name' }, 'Your name (optional)', h('span', { class: 'hint', text: 'Only used in the export. It is not saved anywhere.' })),
        nameInput,
        h('p', null, h('label', { class: 'toggle' }, resultsBox, 'Include how many reading choice answers matched'))),
      tableSlot,
      h('div', { class: 'actions no-print' },
        h('button', { type: 'button', class: 'btn', onclick: function () { window.print(); }, text: 'Print or save as PDF' }),
        h('button', { type: 'button', class: 'btn secondary', onclick: function () {
          download('next-stop-progress.csv', csvExport(all, state.name, state.results), 'text/csv;charset=utf-8');
          msg.textContent = 'Downloaded as a spreadsheet file.';
        }, text: 'Download spreadsheet (CSV)' }),
        copyBtn),
      area, msg,
      h('p', { class: 'muted small no-print', text: 'This record lives only in this browser. If you clear your browser data, or use another device, it will not come with you, so export it from time to time.' }),
      h('div', { class: 'actions no-print' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back to the map' }), h('span', { class: 'spacer' }), clearBtn)
    );
    return wrap;
  }

  // ---------- Learn by marking ----------

  function learnTasks() { return content.learn.mark.filter(function (t) { return t.level === level(); }); }

  function learnCounts() {
    var done = 0, total = 0;
    learnTasks().forEach(function (t) { t.samples.forEach(function (s) { total++; if (isDone('learn-' + s.id)) done++; }); });
    content.learn.fix.forEach(function (f) { total++; if (isDone('learn-' + f.id)) done++; });
    return { done: done, total: total };
  }

  function learnIndexView() {
    main.className = 'home';
    return h('div', null,
      sectionIntro('Learn by marking', 'Look at real-looking answers the way an examiner does. Mark sample work, then see what we thought and why. Or fix the mistakes in short sentences.'),
      h('h2', { text: 'Mark sample work' }),
      h('p', { class: 'muted small', text: 'Each task has three answers at different standards. Give each one a mark, then compare.' }),
      h('ul', { class: 'tool-list' }, learnTasks().map(function (t) {
        var n = t.samples.filter(function (s) { return isDone('learn-' + s.id); }).length;
        return h('li', null, h('a', { href: '#/learn/mark/' + t.id },
          h('span', { class: 't-name', text: t.title }),
          n === t.samples.length ? h('span', { class: 't-done', text: 'All marked' }) : null,
          h('span', { class: 't-sum', text: n + ' of ' + t.samples.length + ' answers marked' })));
      })),
      h('h2', { text: 'Fix it' }),
      h('p', { class: 'muted small', text: 'Eight short sentences each. Rewrite them correctly, then check.' }),
      h('ul', { class: 'tool-list' }, content.learn.fix.map(function (f) {
        return h('li', null, h('a', { href: '#/learn/fix/' + f.id },
          h('span', { class: 't-name', text: f.title }),
          isDone('learn-' + f.id) ? h('span', { class: 't-done', text: 'Done' }) : null,
          h('span', { class: 't-sum', text: f.items.length + ' sentences' })));
      })),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  function learnTaskView(id) {
    var t = find(content.learn.mark, id);
    if (!t) return notFound();
    if (t.level !== level()) return h('div', null, h('h1', { text: t.title }),
      h('p', { class: 'notice', text: 'This task is for ' + LEVELS[t.level] + '. Use the switch at the top of the page to change level.' }),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/learn', text: 'Back to Learn' })));
    var raw = find(content.writing.missions, t.missionId);
    var m = missionFor(raw);
    var bandKeys = ['Lowest band', 'Middle band', 'Top band'];
    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: 'Learn · ' + LEVELS[level()] }),
      h('h1', { text: t.title }),
      h('p', { class: 'lede', text: 'Here is a task. Three people answered it. Read the task, then mark each answer.' }),
      taskCard(m, find(content.toolkit.formats, m.format), content.writing.lengthGuide[String(raw.task)][level()]),
      h('details', { class: 'plan-peek' },
        h('summary', { text: 'How the marks work' }),
        h('p', { text: 'Composition (out of ' + content.writing.marks[String(raw.task)].composition + ') is about the ideas, the reader, the layout and the language. SPaG (out of ' + content.writing.marks[String(raw.task)].spag + ') is about spelling, punctuation and grammar.' }),
        h('p', { class: 'muted small', text: content.writing.markGuide.note }),
        h('ul', null, content.writing.markGuide.composition[level()].map(function (x) { return h('li', { text: x }); })),
        h('ul', null, content.writing.markGuide.spag[level()].map(function (x) { return h('li', { text: x }); }))),
      h('h2', { text: 'The answers' }),
      h('ul', { class: 'tool-list' }, t.samples.map(function (s, i) {
        return h('li', null, h('a', { href: '#/learn/mark/' + t.id + '/' + s.id },
          h('span', { class: 't-name', text: 'Answer ' + (i + 1) }),
          isDone('learn-' + s.id) ? h('span', { class: 't-done', text: 'Marked' }) : null,
          h('span', { class: 't-sum', text: wordCount(s.answer) + ' words' })));
      })),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/learn', text: 'Back to Learn' })));
  }

  function numberSelect(idp, max, value) {
    var sel = h('select', { id: idp });
    sel.appendChild(h('option', { value: '', text: 'Choose a mark' }));
    for (var i = 0; i <= max; i++) {
      var o = h('option', { value: String(i), text: String(i) });
      if (value === i) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }

  function learnSampleView(taskId, sampleId) {
    var t = find(content.learn.mark, taskId);
    var s = t && find(t.samples, sampleId);
    if (!s) return notFound();
    if (t.level !== level()) return learnTaskView(taskId);
    var raw = find(content.writing.missions, t.missionId);
    var marks = content.writing.marks[String(raw.task)];
    var idx = t.samples.indexOf(s);
    var key = 'learn:' + s.id;
    var saved = store.get(key, null);
    var out = h('div', { 'aria-live': 'polite' });
    var compSel = numberSelect('pick-comp', marks.composition, saved && saved.comp);
    var spagSel = numberSelect('pick-spag', marks.spag, saved && saved.spag);

    function closeness(mine, ours) {
      var d = Math.abs(mine - ours);
      return d === 0 ? 'the same as ours' : d === 1 ? 'one away from ours' : 'different from ours';
    }

    function reveal() {
      var comp = compSel.value === '' ? null : parseInt(compSel.value, 10);
      var sp = spagSel.value === '' ? null : parseInt(spagSel.value, 10);
      store.set(key, { comp: comp, spag: sp });
      markDone('learn-' + s.id);
      logDone({ id: 'learn-' + s.id, kind: 'Learn', title: t.title + ' (answer ' + (idx + 1) + ')', topic: 'Marking' });
      out.replaceChildren(
        h('section', { class: 'feedback', tabindex: '-1' },
          h('h2', { text: 'What we thought' }),
          h('p', null, h('strong', { text: 'Composition: ' + s.composition + ' out of ' + marks.composition + '. ' }),
            comp === null ? '' : 'You gave ' + comp + ', which is ' + closeness(comp, s.composition) + '. ', s.why_composition),
          h('p', null, h('strong', { text: 'SPaG: ' + s.spag + ' out of ' + marks.spag + '. ' }),
            sp === null ? '' : 'You gave ' + sp + ', which is ' + closeness(sp, s.spag) + '. ', s.why_spag),
          h('p', { class: 'muted small', text: 'Marking is a judgement. Being a mark away is normal. What matters is spotting the same things.' }),
          h('h3', { text: 'What worked' }),
          h('ul', null, s.worked.map(function (w) { return h('li', null, w.what, ' ', h('q', { text: w.quote })); })),
          h('h3', { text: 'One thing to try' }),
          h('p', { text: s.target.what }), h('p', { class: 'muted', text: s.target.example }),
          s.spag_notes.length ? h('div', null,
            h('h3', { text: 'Spelling, punctuation and grammar to notice' }),
            h('ul', null, s.spag_notes.map(function (n) {
              return h('li', null, h('q', { text: n.quote }), ' → ', h('strong', { text: n.fix }), '. ', n.why);
            }))) : h('p', { class: 'muted', text: 'There was nothing worth correcting in the spelling, punctuation or grammar.' })));
      var fb = out.querySelector('.feedback'); if (fb) fb.focus({ preventScroll: false });
    }

    var next = t.samples[idx + 1];
    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: 'Learn · ' + t.title }),
      h('h1', { text: 'Answer ' + (idx + 1) + ' of ' + t.samples.length }),
      h('p', { class: 'muted small', text: 'Read it, then give it a mark. ' + wordCount(s.answer) + ' words.' }),
      h('div', { class: 'sample-text', tabindex: '0', role: 'region', 'aria-label': 'The answer to mark' },
        s.answer.split(/\n\s*\n/).map(function (p) { return h('p', null, p.split('\n').map(function (line, i) { return [i ? h('br') : null, line]; })); })),
      h('div', { class: 'mark-pick' },
        h('div', null, h('label', { for: 'pick-comp', text: 'Composition (out of ' + marks.composition + ')' }), compSel),
        h('div', null, h('label', { for: 'pick-spag', text: 'SPaG (out of ' + marks.spag + ')' }), spagSel)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: reveal, text: 'Show what we thought' }),
        h('a', { class: 'btn quiet', href: '#/learn/mark/' + t.id, text: 'Back to the task' }),
        next ? h('a', { class: 'btn secondary', href: '#/learn/mark/' + t.id + '/' + next.id, text: 'Next answer' }) : null),
      out);
  }

  function learnFixView(id) {
    var f = find(content.learn.fix, id);
    if (!f) return notFound();
    var shown = 0;
    var doneBox = h('div', { 'aria-live': 'polite' });
    function oneItem(it, i) {
      var box = h('div', { class: 'fix-result', 'aria-live': 'polite' });
      var ta = h('textarea', plain({ id: 'fix-' + i, rows: 2, 'aria-label': 'Your corrected version of sentence ' + (i + 1) }));
      var btn = h('button', { type: 'button', class: 'btn secondary', text: 'Check', onclick: function () {
        if (!box.firstChild) shown++;
        box.replaceChildren(h('p', null, h('strong', { text: 'One way to write it: ' }), it.fixed), h('p', { class: 'muted small', text: it.why }));
        if (shown === f.items.length) {
          markDone('learn-' + f.id);
          logDone({ id: 'learn-' + f.id, kind: 'Learn', title: f.title, topic: 'Fix it' });
          doneBox.replaceChildren(h('p', { class: 'notice', text: 'That is the set done. Well done for sticking with it.' }));
        }
      } });
      return h('li', { class: 'fix-item' },
        h('p', { class: 'fix-wrong' }, h('span', { class: 'muted small', text: 'Sentence ' + (i + 1) + ': ' }), h('q', { text: it.wrong })),
        h('label', { for: 'fix-' + i, class: 'muted small', text: 'Rewrite it correctly' }), ta, btn, box);
    }
    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: 'Learn · Fix it' }),
      h('h1', { text: f.title }),
      h('p', { class: 'lede', text: f.intro }),
      h('ol', { class: 'fix-list' }, f.items.map(oneItem)),
      doneBox,
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/learn', text: 'Back to Learn' })));
  }

  // ---------- Toolkit ----------

  function toolkitView() {
    var formats = content.toolkit.formats;
    var spag = forLevel(content.toolkit.spag);
    return h('div', { class: 'mission toolkit' },
      h('p', { class: 'eyebrow', text: 'Toolkit · ' + LEVELS[level()] }),
      h('h1', { text: 'Toolkit' }),
      h('p', { class: 'lede', text: 'Short guides you can dip into at any time. Each one ends with ten practice questions, one at a time, in a different order each time.' }),
      h('h2', { text: 'Kinds of writing' }),
      h('ul', { class: 'tool-list' }, formats.map(function (f) {
        return h('li', null, h('a', { href: '#/toolkit/format/' + f.id },
          h('span', { class: 't-name', text: f.name }), isDone('tool-' + f.id) ? h('span', { class: 't-done', text: 'Practised' }) : null, h('span', { class: 't-sum', text: f.summary })));
      })),
      h('h2', { text: 'Punctuation, spelling and grammar' }),
      h('p', { class: 'muted small', text: level() === 'L2' ? 'Showing everything for Level 2, including inverted commas and apostrophes for missing letters.' : 'Showing the points for Level 1. Switch to Level 2 to see two more.' }),
      h('ul', { class: 'tool-list' }, spag.map(function (s) {
        return h('li', null, h('a', { href: '#/toolkit/spag/' + s.id },
          h('span', { class: 't-name', text: s.name }), isDone('tool-' + s.id) ? h('span', { class: 't-done', text: 'Practised' }) : null, h('span', { class: 't-sum', text: s.explain[0] })));
      }))
    );
  }

  // Ten practice questions, one at a time, in a different order each time.
  function shuffled(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  function drillSection(kind, id, item) {
    var qs = item.questions || [];
    var key = 'drill:' + kind + ':' + id;
    var section = h('section', { class: 'practice', 'aria-labelledby': 'practice-h' });
    var st = store.get(key, null);
    if (!st || !Array.isArray(st.order) || st.order.length !== qs.length) {
      st = { order: shuffled(qs.length), pos: 0, answers: {} };
      store.set(key, st);
    }
    function save() { store.set(key, st); }

    function draw(focus) {
      var n = qs.length;
      var kids = [h('h2', { id: 'practice-h', text: 'Practice' })];
      if (st.pos < n) {
        var qi = st.order[st.pos];
        var src = qs[qi];
        var ans = st.answers[qi] || (st.answers[qi] = {});
        var q = { id: 'tool-' + id + '-' + qi, type: 'choice', prompt: src.prompt, options: src.options, answer: src.answer, why: src.why, labelledBy: 'practice-q' };
        var prompt = h('p', { class: 'question-prompt', id: 'practice-q', tabindex: '-1', text: src.prompt });
        kids.push(
          h('p', { class: 'step-count', text: 'Question ' + (st.pos + 1) + ' of ' + n }),
          prompt,
          closedQuestion(q, ans, save),
          h('div', { class: 'actions' },
            st.pos > 0 ? h('button', { type: 'button', class: 'btn quiet', text: 'Back', onclick: function () { st.pos -= 1; save(); draw(true); } }) : null,
            h('button', { type: 'button', class: 'btn', text: st.pos === n - 1 ? 'Finish' : 'Next question', onclick: function () { st.pos += 1; save(); draw(true); } })));
        section.replaceChildren.apply(section, kids);
        if (focus) prompt.focus();
        return;
      }
      // Finished
      var matched = 0;
      st.order.forEach(function (qi) { var a = st.answers[qi]; if (a && a.checked && a.choice === qs[qi].answer) matched++; });
      markDone('tool-' + id);
      logDone({ id: 'tool-' + id, kind: 'Toolkit', title: item.name + ' practice', topic: 'Toolkit', matched: matched, total: n });
      var scoreSlot = h('div', { 'aria-live': 'polite' });
      var heading = h('h3', { text: 'Practice done', tabindex: '-1' });
      kids.push(
        heading,
        h('p', { class: 'lede', text: 'That is all ' + n + ' questions. Nicely done.' }),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn secondary', text: 'Show how many matched', onclick: function (e) {
            e.currentTarget.disabled = true;
            scoreSlot.replaceChildren(h('div', { class: 'score-box' }, h('p', { text: matched + ' of ' + n + ' matched the answers.' })));
          } }),
          h('button', { type: 'button', class: 'btn', text: 'Practise again', onclick: function () {
            st = { order: shuffled(n), pos: 0, answers: {} }; save(); draw(true);
          } }),
          h('a', { class: 'btn quiet', href: '#/toolkit', text: 'Back to the toolkit' })),
        scoreSlot);
      section.replaceChildren.apply(section, kids);
      if (focus) heading.focus();
    }

    draw(false);
    return section;
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

    append(wrap, drillSection(kind, id, item));
    append(wrap, h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/toolkit', text: 'Back to the toolkit' })));
    return wrap;
  }

  // ---------- Misc ----------

  function find(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function wrongLevel(m) {
    return h('div', null,
      h('h1', { text: m.title }),
      h('p', { class: 'notice', text: 'This mission is for ' + m.levels.map(function (l) { return LEVELS[l]; }).join(' and ') + '. Use the switch at the top of the page to change level.' }),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/', text: 'Back to the map' })));
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
    setupFooter();
    loadJSON('content/index.json').then(function (man) {
      var base = function (f) { return 'content/' + f; };
      return Promise.all([
        Promise.all(man.reading.map(function (f) { return loadJSON(base(f)); })),
        Promise.all(man.writing.map(function (f) { return loadJSON(base(f)); })),
        loadJSON(base(man.toolkit)),
        loadJSON(base(man.learn)),
        loadJSON(base(man.themes)),
        Promise.all((man.packs || []).map(function (f) { return loadJSON(base(f)); }))
      ]);
    }).then(function (res) {
      var reading = [], writing = res[1][0];
      res[0].forEach(function (f) { reading = reading.concat(f.missions); });
      res[1].slice(1).forEach(function (f) { writing.missions = writing.missions.concat(f.missions); });
      res[5].forEach(function (p) { reading = reading.concat(p.reading || []); writing.missions = writing.missions.concat(p.writing || []); });
      content = { reading: { missions: reading }, writing: writing, toolkit: res[2], learn: res[3], themes: res[4].themes };
      window.addEventListener('hashchange', function () { render(); });
      render({ keepFocus: true });
    }).catch(function (err) {
      if (window.console) console.error(err);
      main.replaceChildren(h('div', { class: 'notice' },
        h('h1', { text: 'The missions did not load' }),
        h('p', { text: 'Try refreshing the page. If you opened the file straight from your computer, it needs to be served from a web address instead (for example, GitHub Pages or a local web server).' })));
    });
  }

  start();
})();
