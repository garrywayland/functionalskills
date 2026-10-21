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
    // Names of saved items that start with a prefix (for the "pick up where you left off" list).
    keys: function (prefix) {
      var out = {};
      Object.keys(memory).forEach(function (k) { if (k.indexOf(prefix) === 0) out[k] = true; });
      try {
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf(PREFIX + prefix) === 0) out[k.slice(PREFIX.length)] = true;
        }
      } catch (e) { /* storage unavailable */ }
      return Object.keys(out);
    },
    // Is the browser really keeping things? (false in some private windows, or if storage is blocked)
    persistent: function () {
      try { window.localStorage.setItem(PREFIX + 'probe', '1'); window.localStorage.removeItem(PREFIX + 'probe'); return true; } catch (e) { return false; }
    },
    // Like set, but tells you whether the browser really kept it (false if storage is full or blocked).
    setStrict: function (key, value) {
      memory[key] = value;
      try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      delete memory[key];
      try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    }
  };

  // Practice answers should be the learner's own: no spell-check, autocorrect, capitals or grammar helpers.
  var NO_HELP = { spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', autocomplete: 'off', 'data-gramm': 'false', 'data-gramm_editor': 'false', 'data-enable-grammarly': 'false' };
  function plain(attrs) { var o = {}; Object.keys(NO_HELP).forEach(function (k) { o[k] = NO_HELP[k]; }); Object.keys(attrs).forEach(function (k) { o[k] = attrs[k]; }); return o; }

  // "Saved on this device as you type", with a little tick after each pause in typing.
  function autosaveNote() {
    var ok = store.persistent();
    var el = h('p', { class: 'saved-note muted small', text: ok ? 'Saved on this device as you type.' : 'This browser is not keeping saved work (private window?), so it will be lost if you leave this page.' });
    var t;
    el.ping = function () {
      if (!ok) return;
      clearTimeout(t);
      t = setTimeout(function () { el.textContent = 'Saved on this device.'; }, 500);
    };
    return el;
  }

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

  // ---------- The service: accounts, plans, sync, marking ----------

  var me = { signedIn: false, features: {} };
  var BRAND = 'Next Stop';
  var PLAN = 'Plus';

  // Talks to our own server only, never anywhere else. The header marks the call as coming from this site.
  function api(method, path, body) {
    var opts = { method: method, headers: { 'X-NS': '1' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j || {} }; });
    }, function () { return { status: 0, body: { error: 'Could not reach the service. Check your connection and try again.' } }; });   // never rejects: offline is just status 0
  }

  function isPlus() { return !!(me.signedIn && me.plan && me.plan.tier === 'plus'); }
  function liveMarking() { return isPlus() && !!(me.features && me.features.marking); }

  // Anything that changes saved work asks for a sync (when signed in).
  var changeListeners = [];
  (function () {
    var raw = { set: store.set, setStrict: store.setStrict, remove: store.remove };
    ['set', 'setStrict', 'remove'].forEach(function (name) {
      store[name] = function (key) {
        var r = raw[name].apply(store, arguments);
        changeListeners.forEach(function (fn) { try { fn(key); } catch (e) { /* ignore */ } });
        return r;
      };
    });
  })();

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
    try {
      if (parts[0] === 'reading' && parts[1]) view = readingView(parts[1], parts[2]);
      else if (parts[0] === 'writing' && parts[1]) view = writingView(parts[1], parts[2]);
      else if (parts[0] === 'toolkit' && parts[1] && parts[2]) view = toolView(parts[1], parts[2]);
      else if (parts[0] === 'toolkit') view = toolkitView();
      else if (parts[0] === 'make') view = makeView();
      else if (parts[0] === 'signin' && parts[1]) view = signinView(parts[1]);
      else if (parts[0] === 'account') view = accountView();
      else if (parts[0] === 'plans') view = plansView();
      else if (parts[0] === 'family' && parts[1]) view = familyView(parts[1]);
      else if (parts[0] === 'work') view = myWorkView();
      else if (parts[0] === 'theme' && parts[1]) view = themeView(parts[1]);
      else if (parts[0] === 'learn' && parts[1] === 'mark' && parts[3]) view = learnSampleView(parts[2], parts[3]);
      else if (parts[0] === 'learn' && parts[1] === 'mark' && parts[2]) view = learnTaskView(parts[2]);
      else if (parts[0] === 'learn' && parts[1] === 'fix' && parts[2]) view = learnFixView(parts[2]);
      else if (parts[0] === 'learn') view = learnIndexView();
      else if (parts[0] === 'progress') view = progressView();
      else if (parts[0] === 'reading') view = readingIndexView();
      else if (parts[0] === 'writing') view = writingIndexView();
      else view = homeView();
    } catch (err) {
      if (window.console) console.error(err);
      view = h('div', { class: 'notice' }, h('h1', { text: 'That page could not be shown' }), h('p', { text: 'Something in it looks wrong. If it is one of your own packs, you can delete it from the Make a pack page.' }), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/', text: 'Back to the front page' })));
    }
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
  function tagFor(m) { return m.locked ? PLAN : m.status === 'draft' ? 'Unchecked' : m.own ? 'Your own' : null; }
  function draftTag(m) { var t = tagFor(m); return t ? h('span', { class: 'draft-tag', text: t }) : null; }

  function themeCounts(t) {
    var r = counts(levelReading().filter(function (m) { return m.topic === t.name; }));
    var w = counts(levelWriting().filter(function (m) { return m.topic === t.name; }));
    return { done: r.done + w.done, total: r.total + w.total };
  }

  // Only an admin account sees unchecked drafts, and only if they choose to.
  function setupFooter() {
    var foot = document.querySelector('.site-footer');
    if (!foot) return;
    var old = foot.querySelector('.admin-switch'); if (old) old.remove();
    if (!me.admin) return;
    var btn = h('button', { type: 'button', class: 'linkish', 'aria-pressed': String(showDrafts()) });
    function label() { btn.textContent = 'Admin: unchecked missions ' + (showDrafts() ? 'shown' : 'hidden'); btn.setAttribute('aria-pressed', String(showDrafts())); }
    btn.addEventListener('click', function () { store.set('drafts', !showDrafts()); label(); loadAll().then(function () { render({ keepFocus: true }); }); });
    label();
    foot.appendChild(h('p', { class: 'small admin-switch' }, btn));
  }

  function counts(list) {
    list = list.filter(function (m) { return !m.locked; });
    return { done: list.filter(function (m) { return isDone(m.id); }).length, total: list.length };
  }

  function levelReading() { return content.reading.missions.filter(inLevel).filter(visible); }
  function levelWriting() { return content.writing.missions.filter(inLevel).filter(visible); }

  // Pick one of these missions at random and go to it.
  function pickFrom(readingList, writingList) {
    readingList = readingList.filter(function (m) { return !m.locked; }); writingList = writingList.filter(function (m) { return !m.locked; });
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
    return { id: m.id, href: '#/reading/' + m.id, title: m.title, minutes: m.minutes, tag: tagFor(m),
      meta: m.locked ? m.meta.texts + (m.meta.texts === 1 ? ' text · ' : ' texts · ') + (m.length === 'long' ? m.meta.questions[level()] : m.meta.plain[level()]) + ' questions'
        : m.length === 'long' ? m.texts.length + ' texts · ' + questionNumbers(m) + ' questions' : forLevel(m.questions).length + ' questions' };
  }
  function readingSub(m) { return m.length === 'long' ? 'Longer missions (about ' + (m.minutes || 35) + ' minutes)' : 'Short missions (about 10 minutes)'; }
  function writingStop(m) {
    var mm = missionFor(m);
    return { id: m.id, href: '#/writing/' + m.id, title: m.title, minutes: m.task === 1 ? 25 : 15, tag: tagFor(m),
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
              s.tag ? h('span', { class: 'draft-tag', text: s.tag }) : null,
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
    var resume = inProgress();

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
          c ? h('span', { class: 'st-count', text: c.done + ' of ' + c.total + ' done' }) : null));
    }

    return h('div', null,
      h('section', { class: 'map-intro' },
        h('h1', { text: 'What are you into?' }),
        h('p', { class: 'lede', text: 'Pick a theme. You will get reading and writing tasks about it. Each takes about ten minutes, or longer if you want a bigger one. You can stop whenever you like.' })),
      resume.length ? h('section', { class: 'resume', 'aria-labelledby': 'resume-h' },
        h('h2', { id: 'resume-h', text: 'Pick up where you left off' }),
        h('ul', { class: 'resume-list' }, resume.slice(0, 3).map(function (x) {
          return h('li', null, h('a', { href: x.href }, h('span', { class: 't-name', text: x.title }), h('span', { class: 't-sum', text: x.kind + ' · ' + x.theme })));
        }))) : null,
      isPlus() ? null : h('p', { class: 'notice plus-notice' }, 'You are on the free taster. ' + PLAN + ' unlocks every mission and feedback on your writing. ', h('a', { href: '#/plans', text: 'See ' + PLAN })),
      shown.length ? h('ul', { class: 'theme-grid' }, shown.map(themeCard)) : h('p', { class: 'notice', text: 'There are no missions at this level yet.' }),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { pickFrom(rAll, wAll); }, text: 'Pick one for me' }),
        h('a', { class: 'btn quiet', href: '#/work', text: 'My work' }),
        h('a', { class: 'btn quiet', href: '#/progress', text: 'My progress' })),
      h('section', { class: 'skills', 'aria-labelledby': 'skills-h' },
        h('h2', { id: 'skills-h', text: 'Skills, any theme' }),
        h('ul', { class: 'skill-grid' },
          skillCard('learn', '#/learn', 'Learn by marking', 'Mark sample work and fix mistakes, like an examiner.', l),
          skillCard('toolkit', '#/toolkit', 'Practise a skill', 'Short drills on writing formats, punctuation, spelling and grammar.', t),
          skillCard('make', '#/make', 'Make your own theme', 'Pick something you are into and get a pack made with an AI chat.', null))),
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
      plusNotice(lockedCount(r) + lockedCount(w)),
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
      plusNotice(lockedCount(levelReading())),
      sectionIntro('Reading', 'Open a theme, then pick a mission. Short ones take about 10 minutes. The longer ones have three texts and 15 questions, like the real paper.'),
      menuSection('reading', 'Reading missions', 'Read the text or texts, then answer questions one at a time.', levelReading(), readingStop, readingSub),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  function writingIndexView() {
    main.className = 'home';
    return h('div', null,
      plusNotice(lockedCount(levelWriting())),
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
          s.tag ? h('span', { class: 'draft-tag', text: s.tag }) : null,
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

  var LETTERS = 'ABCDEFGH';
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
    if (m.locked) return lockedView(m, 'reading');
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
    function save() { saved.t = Date.now(); store.set(key, saved); }

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
      ), h('p', { class: 'muted small' }, 'Your answers are saved as you go. ', h('a', { href: '#/', text: 'Finish later' }), ' and pick it up from the front page.'));

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
        downloadButton(m.title, function () { return readingFileText(m, saved); }, 'Download my answers', 'btn secondary'),
        h('button', { type: 'button', class: 'btn quiet', onclick: function () {
          store.remove(key);
          go(hrefFor(0));
        }, text: 'Do it again (starts a clean copy)' })
      ),
      scoreSlot,
      answersReview(m, saved),
      h('p', { class: 'muted small' }, 'Your written answers are kept under ', h('a', { href: '#/work', text: 'My work' }), '.')
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
      var lab = h('label', { class: 'option' + (ans.checked ? ' locked' : '') }, input, h('span', { class: 'letter', text: LETTERS[i] }), h('span', { text: text }));
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
    var lettered = q.type === 'choice';
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
      var lab = h('label', { class: 'option' + (ans.checked ? ' locked' : '') }, input, lettered ? h('span', { class: 'letter', text: LETTERS[i] }) : null, h('span', { text: text }));
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
        h('p', { class: 'fb-head', text: same ? 'Yes, that matches the answer.' : 'The answer is' + (lettered ? ' ' + LETTERS[right] : '') + ': ' + opts[right] + (/[.?!"\u201d]$/.test(opts[right]) ? '' : '.') }),
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
    var note = autosaveNote();
    ta.addEventListener('input', function () { ans.text = ta.value; save(); note.ping(); });
    box.appendChild(h('label', { class: 'field', for: id }, 'Your answer', h('span', { class: 'hint', text: 'A few sentences is enough. No one else sees this.' })));
    box.appendChild(ta);
    box.appendChild(note);

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

  // ---------- Download her work as a plain text file ----------

  function writingFileText(m, rec) {
    var plan = (rec && rec.plan) || {}, draft = ((rec && rec.draft) || '').trim();
    var fields = planFields(m).filter(function (f) { return plan[f.key] && String(plan[f.key]).trim(); });
    var out = [m.title, LEVELS[level()] + ' · ' + m.topic + ' · ' + (m.task === 1 ? 'longer task' : 'shorter task'), 'Saved ' + prettyDate(today()), '',
      'THE TASK', m.context, 'Who it is for: ' + m.audience, 'Why you are writing: ' + m.purpose, m.instruction, 'Include:'];
    m.bullets.forEach(function (b) { out.push('- ' + b); });
    if (fields.length) { out.push('', 'MY PLAN'); fields.forEach(function (f) { out.push(f.label, plan[f.key], ''); }); }
    out.push('', 'MY WRITING' + (draft ? ' (' + wordCount(draft) + ' words)' : ''), draft || '(nothing written yet)', '');
    return out.join('\n');
  }

  function readingFileText(m, rec) {
    var answers = (rec && rec.answers) || {}, opts, out = [m.title, LEVELS[level()] + ' · ' + m.topic, 'Saved ' + prettyDate(today()), '', 'MY ANSWERS', ''];
    forLevel(m.questions).forEach(function (q) {
      var a = answers[q.id] || {}, mine;
      opts = optionsFor(q);
      if (q.type === 'open') mine = a.text || '(left blank)';
      else if (q.type === 'multi') mine = (a.choices || []).slice().sort().map(function (i) { return LETTERS[i] + '. ' + opts[i]; }).join('; ') || '(no answer)';
      else if (q.type === 'match') mine = q.items.map(function (it, i) { return it.label + ': paragraph ' + (it.given ? it.answer : (a.map && a.map[i]) || '?'); }).join('; ');
      else mine = typeof a.choice === 'number' ? (q.type === 'choice' ? LETTERS[a.choice] + '. ' : '') + opts[a.choice] : '(no answer)';
      out.push((q.label ? 'Question ' + q.label + ': ' : '') + q.prompt, 'My answer: ' + mine);
      if (q.type === 'open' && q.model) out.push('One possible answer: ' + q.model);
      out.push('');
    });
    return out.join('\n');
  }

  function saveTextFile(title, text) {
    download('next-stop-' + (slugOf(title) || 'my-work') + '-' + today() + '.txt', text, 'text/plain;charset=utf-8');
  }

  // A "Download" button. getText runs when it is pressed, so the file always has her latest words.
  function downloadButton(title, getText, label, cls) {
    return h('button', { type: 'button', class: cls || 'btn quiet', text: label || 'Download as a file', onclick: function () { saveTextFile(title, getText()); } });
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
    if (raw.locked) return lockedView(raw, 'writing');
    var m = missionFor(raw);
    var stepIds = WRITING_STEPS.map(function (s) { return s[0]; });
    var key = 'writing:' + id + ':' + level();
    var saved = store.get(key, {});
    if (!saved.plan) saved.plan = {};
    if (!saved.checks) saved.checks = {};
    var step = stepIds.indexOf(stepParam) !== -1 ? stepParam : (saved.step || 'task');
    saved.step = step;
    store.set(key, saved);
    function save() { saved.t = Date.now(); store.set(key, saved); }
    var format = find(content.toolkit.formats, m.format);
    var length = content.writing.lengthGuide[String(m.task)][level()];
    var idx = stepIds.indexOf(step);
    function hrefFor(s) { return '#/writing/' + id + '/' + s; }

    var later = h('p', { class: 'muted small' }, 'Everything is saved as you go. ', h('a', { href: '#/', text: 'Finish later' }), ' and pick it up from the front page.');
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
        h('div', { class: 'actions' }, backBtn, nextBtn), later
      );
    }

    if (step === 'plan') {
      var fields = planFields(m);
      var planNote = autosaveNote();
      main.className = 'wide';
      append(wrap, splitLayout(m, format, length, saved.plan, false, [
        h('h1', { text: 'Plan it' }),
        h('p', { class: 'lede', text: 'Jot down a few words for each box. Notes are fine; you do not need full sentences here.' }),
        fields.map(function (f) {
          var fid = 'plan-' + f.key;
          var ta = h('textarea', plain({ id: fid, rows: '3' }));
          ta.value = saved.plan[f.key] || '';
          ta.addEventListener('input', function () { saved.plan[f.key] = ta.value; save(); planNote.ping(); });
          return h('div', null,
            h('label', { class: 'field', for: fid }, f.label, h('span', { class: 'hint', text: f.hint })),
            ta);
        }),
        planNote,
        h('div', { class: 'actions' }, backBtn, nextBtn), later
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
      var draftNote = autosaveNote();
      box.addEventListener('input', function () { saved.draft = box.value; save(); updateCount(); announce(); draftNote.ping(); });

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
        draftNote,
        h('div', { class: 'actions' }, downloadButton(m.title, function () { return writingFileText(m, saved); }, 'Download my writing')),
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
        h('div', { class: 'actions' }, backBtn, nextBtn), later
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
      var live = liveMarking();
      append(wrap,
        h('h1', { text: live ? 'Get feedback' : 'Send for marking' }),
        live ? feedbackSection(m, format, draft, words, id) : null,
        live ? h('h2', { text: 'Or copy it to send somewhere else' }) : null,
        h('p', { class: live ? 'muted' : 'lede', text: live
          ? 'This puts the task, a marking guide and your writing together in one block of text.'
          : 'Nothing is sent from this page. It puts the task, a marking guide and your writing into one block of text, and you choose where to send it.' }),
        live ? null : markingPromo(),
        aiHelp(),
        h('p', { class: 'muted', text: words + ' words. The block does not include your name.' }),
        h('label', { class: 'field', for: 'marking' }, 'Text to copy'),
        out,
        h('div', { class: 'actions' }, copyBtn,
          downloadButton(m.title, function () { return writingFileText(m, saved); }, 'Download as a file', 'btn secondary'),
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

  // Feedback comes from our own service, and only for a signed-in Plus account. (liveMarking() says if it is on.)
  function markingPromo() {
    if (!me.signedIn) return h('p', { class: 'notice' }, 'Want feedback from an AI on this? ', h('a', { href: '#/account', text: 'Sign in' }), ' and ', h('a', { href: '#/plans', text: 'see ' + PLAN }), '.');
    if (!isPlus()) return h('p', { class: 'notice' }, 'Feedback from an AI is part of ' + PLAN + '. ', h('a', { href: '#/plans', text: 'See ' + PLAN }));
    return null;
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
      fetch('/api/mark', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NS': '1' }, credentials: 'same-origin', body: JSON.stringify(payload),
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
          if (b.quota && me.quota) me.quota = b.quota;
          status.textContent = 'Here is your feedback.' + (b.quota ? ' ' + (b.quota.limit - b.quota.used) + ' left this month.' : '');
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
      h('p', { class: 'muted small' }, 'When you press the button, your task and your writing are sent to an AI service to be marked. We do not keep your writing and we do not send your name. AI feedback is a guide, not an official mark. ', h('a', { href: '/privacy', text: 'How we handle this' })),
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

  // ---------- Sync between devices ----------

  var syncState = 'off';        // off | ok | syncing | offline | error | toobig
  var syncing = false, syncPending = false, applyingRemote = false, syncTimer = null, syncedAt = null;

  function setSyncState(s) {
    syncState = s;
    var link = document.getElementById('account-link');
    if (link) link.setAttribute('data-sync', s);
    var el = document.getElementById('sync-line');
    if (el) el.textContent = syncText();
  }

  function syncText() {
    if (!me.signedIn) return '';
    return { ok: 'Saved to your account' + (syncedAt ? ' at ' + syncedAt : '') + '.', syncing: 'Saving to your account…', offline: 'No connection. Your work is safe on this device and will sync when you are back online.', error: 'Could not sync just now. Your work is safe on this device. We will try again.', toobig: 'You have more saved than we can sync. Download a copy of your work and remove old packs.', off: '' }[syncState] || '';
  }

  function clockNow() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // Sends everything this device has and takes back the merged result, using the same merge as "Restore from a file".
  function syncNow(opts) {
    opts = opts || {};
    if (!me.signedIn || !window.NextStopBackup) return Promise.resolve();
    if (syncing) { syncPending = true; return Promise.resolve(); }
    syncing = true; setSyncState('syncing');
    return api('POST', '/api/sync', { data: collectWork() }).then(function (res) {
      if (res.status === 200) {
        var merged = window.NextStopBackup.merge(collectWork(), res.body.data || {});
        var keys = Object.keys(merged.changes);
        applyingRemote = true;
        try { keys.forEach(function (k) { store.setStrict(k, merged.changes[k]); }); } finally { applyingRemote = false; }
        if (keys.length) applyMyPacks();
        syncedAt = clockNow(); setSyncState('ok');
        if (keys.length && opts.rerender) render({ keepFocus: true });
      } else if (res.status === 0) setSyncState('offline');
      else if (res.status === 401) { me = { signedIn: false, features: me.features }; renderAccountLink(); setSyncState('off'); }
      else if (res.status === 413) setSyncState('toobig');
      else setSyncState('error');
    }).catch(function () { setSyncState('offline'); }).then(function () {
      syncing = false;
      if (syncPending) { syncPending = false; syncSoon(); }
    });
  }

  function syncSoon() {
    if (!me.signedIn) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncNow(); }, 4000);
  }

  function startSync() {
    changeListeners.push(function (key) {
      if (applyingRemote || !me.signedIn || !window.NextStopBackup || !window.NextStopBackup.isBackupKey(key)) return;
      syncSoon();
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncNow({ rerender: false }); });
    window.addEventListener('online', function () { syncNow(); });
    setInterval(function () { if (document.visibilityState === 'visible') syncNow(); }, 5 * 60 * 1000);
    if (me.signedIn) syncNow({ rerender: true });
  }

  // ---------- Save and restore my work (one file; restoring merges, it never replaces) ----------

  var backupNote = null;

  function collectWork() {
    var B = window.NextStopBackup, data = {};
    store.keys('').forEach(function (k) { if (B.isBackupKey(k)) data[k] = store.get(k, undefined); });
    return data;
  }

  function mergeSentence(rep) {
    var bits = [];
    if (rep.added.records) bits.push(rep.added.records + ' new piece' + (rep.added.records === 1 ? '' : 's') + ' of work (answers, writing or practice)');
    if (rep.updated) bits.push(rep.updated + ' ' + (rep.updated === 1 ? 'piece' : 'pieces') + ' of work brought up to date with newer changes');
    if (rep.added.steps) bits.push(rep.added.steps + ' progress entr' + (rep.added.steps === 1 ? 'y' : 'ies'));
    if (rep.added.packs) bits.push(rep.added.packs + ' pack' + (rep.added.packs === 1 ? '' : 's') + ' you made');
    return bits;
  }

  function backupSection() {
    var B = window.NextStopBackup;
    var msg = h('div', { 'aria-live': 'polite' });
    if (backupNote) { msg.appendChild(backupNote); backupNote = null; }
    if (!B) return null;

    var saveBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Save my work to a file' });
    saveBtn.addEventListener('click', function () {
      var file = B.make(collectWork(), today());
      var n = Object.keys(file.data).length;
      if (!n) { msg.replaceChildren(h('p', { class: 'muted', text: 'There is nothing to save yet. Do a mission first, then come back.' })); return; }
      download('next-stop-my-work-' + today() + '.json', JSON.stringify(file), 'application/json');
      msg.replaceChildren(h('p', { class: 'status', text: 'Saved to a file in your downloads. It has your writing in it, so keep it somewhere private.' }));
    });

    var input = h('input', { type: 'file', accept: '.json,application/json', id: 'restore-file', class: 'visually-hidden' });
    var pickBtn = h('label', { class: 'btn secondary', for: 'restore-file', text: 'Restore from a file' });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { msg.replaceChildren(h('p', { class: 'notice', text: 'That file is much bigger than a saved-work file should be.' })); input.value = ''; return; }
      var done = function (text) {
        input.value = '';
        var parsed = B.parse(text);
        if (!parsed.ok) { msg.replaceChildren(h('p', { class: 'notice', text: parsed.error + ' Nothing was changed.' })); return; }
        var m = B.merge(collectWork(), parsed.data), bits = mergeSentence(m.report), keys = Object.keys(m.changes);
        if (!keys.length) { msg.replaceChildren(h('p', { class: 'notice', text: 'Everything in that file is already on this device, so there is nothing to add.' })); return; }
        var go2 = h('button', { type: 'button', class: 'btn', text: 'Merge it in' });
        var cancel = h('button', { type: 'button', class: 'btn quiet', text: 'Cancel', onclick: function () { msg.replaceChildren(); } });
        go2.addEventListener('click', function () {
          var failed = 0;
          keys.forEach(function (k) { if (!store.setStrict(k, m.changes[k])) failed++; });
          applyMyPacks();
          Array.prototype.forEach.call(document.querySelectorAll('input[name="level"]'), function (r) { r.checked = r.value === level(); });
          backupNote = failed
            ? h('p', { class: 'notice', text: 'Some of it could not be kept: this browser says its storage is full or blocked. Try a different browser, or save less.' })
            : h('div', { class: 'notice' }, h('p', { text: 'Merged. Added ' + (bits.join(', ') || 'what was missing') + '.' }), h('p', { class: 'muted small', text: 'Anything you had here that was newer stayed as it was.' }));
          render({ keepFocus: true });
        });
        msg.replaceChildren(h('section', { class: 'feedback' },
          h('h3', { text: 'Ready to merge' }),
          h('p', { text: (parsed.saved ? 'This file was saved on ' + prettyDate(parsed.saved) + '. ' : '') + 'Merging will add ' + (bits.join(', ') || 'what is missing') + '.' }),
          h('p', { class: 'muted small', text: 'Nothing here is deleted or replaced by something older. Where you both have the same thing, the more recently changed copy is kept.' }),
          parsed.skipped ? h('p', { class: 'muted small', text: parsed.skipped + ' item' + (parsed.skipped === 1 ? '' : 's') + ' in the file did not look right and will be skipped.' }) : null),
          h('div', { class: 'actions' }, go2, cancel));
      };
      if (f.text) f.text().then(done, function () { msg.replaceChildren(h('p', { class: 'notice', text: 'That file could not be read.' })); });
      else { var rd = new FileReader(); rd.onload = function () { done(String(rd.result)); }; rd.readAsText(f); }
    });

    return h('section', { class: 'no-print backup', 'aria-labelledby': 'backup-h' },
      h('h2', { id: 'backup-h', text: 'Save and restore my work' }),
      h('p', { class: 'muted', text: 'Keep a copy of everything you have done (answers, writing, plans, practice and any packs you made), or move it to another device. Restoring merges the file into what is already here: nothing is lost.' }),
      h('p', { class: 'muted small', text: 'The file has your writing in it, so keep it private. It does not have a name. This is different from the record above, which is for showing your teacher.' }),
      h('div', { class: 'actions' }, saveBtn, input, pickBtn),
      msg);
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
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/', text: 'Choose something to do' })),
        backupSection());
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
      backupSection(),
      h('p', { class: 'muted small no-print', text: 'This record lives only in this browser. If you clear your browser data, or use another device, it will not come with you, so export it from time to time.' }),
      h('div', { class: 'actions no-print' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back to the map' }), h('span', { class: 'spacer' }), clearBtn)
    );
    return wrap;
  }

  // ---------- Learn by marking ----------

  function learnTasks() { return content.learn.mark.filter(function (t) { return t.level === level(); }); }

  function learnCounts() {
    var done = 0, total = 0;
    learnTasks().forEach(function (t) { if (t.locked) return; t.samples.forEach(function (s) { total++; if (isDone('learn-' + s.id)) done++; }); });
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
          t.locked ? h('span', { class: 'draft-tag', text: PLAN }) : n === t.samples.length ? h('span', { class: 't-done', text: 'All marked' }) : null,
          h('span', { class: 't-sum', text: t.locked ? t.samples.length + ' answers to mark' : n + ' of ' + t.samples.length + ' answers marked' })));
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
    if (t.locked) return lockedView(t, 'learn');
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
    if (t.locked) return lockedView(t, 'learn');
    if (t.level !== level()) return learnTaskView(taskId);
    var raw = find(content.writing.missions, t.missionId);
    var marks = content.writing.marks[String(raw.task)];
    var idx = t.samples.indexOf(s);
    var key = 'learn:' + s.id;
    var saved = store.get(key, null) || {};
    var out = h('div', { 'aria-live': 'polite' });
    var compSel = numberSelect('pick-comp', marks.composition, saved && saved.comp);
    var spagSel = numberSelect('pick-spag', marks.spag, saved && saved.spag);

    function closeness(mine, ours) {
      var d = Math.abs(mine - ours);
      return d === 0 ? 'the same as ours' : d === 1 ? 'one away from ours' : 'different from ours';
    }

    function picks() {
      return { comp: compSel.value === '' ? null : parseInt(compSel.value, 10), spag: spagSel.value === '' ? null : parseInt(spagSel.value, 10) };
    }
    function remember(revealed) { var p = picks(); store.set(key, { comp: p.comp, spag: p.spag, revealed: !!revealed }); }
    compSel.addEventListener('change', function () { remember(saved.revealed); });
    spagSel.addEventListener('change', function () { remember(saved.revealed); });

    function reveal(fromSaved) {
      var p = picks(), comp = p.comp, sp = p.spag;
      if (!fromSaved) {
        saved.revealed = true; remember(true);
        markDone('learn-' + s.id);
        logDone({ id: 'learn-' + s.id, kind: 'Learn', title: t.title + ' (answer ' + (idx + 1) + ')', topic: 'Marking' });
      }
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
      var fb = out.querySelector('.feedback'); if (fb && !fromSaved) fb.focus({ preventScroll: false });
    }

    var next = t.samples[idx + 1];
    if (saved.revealed) reveal(true);
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
        h('button', { type: 'button', class: 'btn', onclick: function () { reveal(false); }, text: 'Show what we thought' }),
        h('a', { class: 'btn quiet', href: '#/learn/mark/' + t.id, text: 'Back to the task' }),
        next ? h('a', { class: 'btn secondary', href: '#/learn/mark/' + t.id + '/' + next.id, text: 'Next answer' }) : null),
      out);
  }

  // ----- Fix it: soft, active checking -----

  function normaliseSentence(t) {
    return String(t || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  }

  // Words (with inner apostrophes and hyphens) and single punctuation marks, with their place in the text.
  function tokenise(t) {
    var out = [], re = /[A-Za-z0-9£%]+(?:['\-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g, m;
    while ((m = re.exec(t))) out.push({ t: m[0], at: m.index, end: m.index + m[0].length });
    return out;
  }

  // Lines the learner's tokens up with ours. Returns the changed stretches and how many there are.
  function compareTokens(a, b) {
    var n = a.length, m = b.length, i, j, dp = [];
    for (i = 0; i <= n; i++) { dp.push([]); for (j = 0; j <= m; j++) dp[i].push(0); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = a[i].t === b[j].t ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var ops = []; i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i].t === b[j].t) { ops.push({ k: 'eq' }); i++; j++; }
      else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push({ k: 'ins', before: i }); j++; }
      else { ops.push({ k: 'del', a: i }); i++; }
    }
    var regions = [], cur = null;
    ops.forEach(function (o) {
      if (o.k === 'eq') { cur = null; return; }
      if (!cur) { cur = { del: [], gapAt: null }; regions.push(cur); }
      if (o.k === 'del') cur.del.push(o.a); else if (cur.gapAt === null) cur.gapAt = o.before;
    });
    return regions;
  }

  function withoutCommas(toks) { return toks.filter(function (x) { return x.t !== ','; }); }

  // Which of our accepted versions is closest to what the learner wrote?
  function closest(text, versions) {
    var mine = tokenise(text), best = null;
    versions.forEach(function (v) {
      var r = compareTokens(mine, tokenise(v));
      if (!best || r.length < best.regions.length) best = { version: v, regions: r };
    });
    return best;
  }

  // The learner's own sentence, with the parts to look at gently shaded. Nothing here says what the fix is.
  function shadedSentence(text, regions) {
    var toks = tokenise(text), marks = {}, gaps = {};
    regions.forEach(function (r) {
      if (r.del.length) r.del.forEach(function (x) { marks[x] = true; });
      else gaps[r.gapAt] = true;
    });
    var nodes = [], pos = 0;
    function gap() { nodes.push(h('span', { class: 'diff-gap', 'aria-label': 'something may be missing here', text: '…' })); }
    toks.forEach(function (tk, i) {
      if (gaps[i]) { nodes.push(text.slice(pos, tk.at)); gap(); pos = tk.at; }
      nodes.push(text.slice(pos, tk.at));
      nodes.push(marks[i] ? h('mark', { class: 'diff-mark', text: tk.t }) : tk.t);
      pos = tk.end;
    });
    nodes.push(text.slice(pos));
    if (gaps[toks.length]) gap();
    return nodes;
  }

  function places(n) { return (n === 1 ? 'one place' : n === 2 ? 'two places' : n === 3 ? 'three places' : n + ' places'); }

  // One sentence at a time. Check gives gentle feedback and she can try again; Next question moves on.
  // The answers all come at the end.
  function learnFixView(id) {
    var f = find(content.learn.fix, id);
    if (!f) return notFound();
    var commasMatter = f.skill === 'Commas';
    var wrap = h('div', { class: 'mission' });
    var state, fixKey = 'learn-fix:' + f.id;

    function save() { store.set(fixKey, state); }
    function reset() { state = { pos: 0, ended: false, items: f.items.map(function () { return { mine: '', status: 'none', tries: 0 }; }) }; save(); }
    function restore() {
      var st = store.get(fixKey, null);
      if (st && Array.isArray(st.items) && st.items.length === f.items.length && typeof st.pos === 'number') { state = st; return true; }
      return false;
    }

    function judge(it, mine) {
      var versions = [it.fixed].concat(it.also || []).map(normaliseSentence);
      var text = normaliseSentence(mine);
      if (!text) return { kind: 'empty' };
      if (text === normaliseSentence(it.wrong)) return { kind: 'same' };
      if (versions.indexOf(text) !== -1) return { kind: 'match' };
      if (!commasMatter && versions.some(function (v) { return compareTokens(withoutCommas(tokenise(text)), withoutCommas(tokenise(v))).length === 0; })) return { kind: 'comma' };
      var best = closest(text, versions);
      return { kind: 'close', regions: best.regions, text: text };
    }

    function drawQuestion() {
      var i = state.pos, it = f.items[i], rec = state.items[i], last = i === f.items.length - 1;
      var box = h('div', { class: 'fix-result', 'aria-live': 'polite' });
      var ta = h('textarea', plain({ id: 'fix-box', rows: 3, 'aria-label': 'Your corrected version of sentence ' + (i + 1) }));
      ta.value = rec.mine;
      if (rec.status === 'matched') { ta.readOnly = true; }
      var fixNote = autosaveNote();
      ta.addEventListener('input', function () { rec.mine = ta.value; save(); fixNote.ping(); });
      var checkBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Check' });
      var nextBtn = h('button', { type: 'button', class: 'btn quiet', text: last ? 'Finish and see the answers' : 'Next question' });

      function lock(quiet) { ta.readOnly = true; checkBtn.hidden = true; nextBtn.className = 'btn'; nextBtn.textContent = last ? 'See the answers' : 'Next question'; if (!quiet) nextBtn.focus(); }
      checkBtn.addEventListener('click', function () {
        rec.mine = ta.value;
        var r = judge(it, ta.value); save();
        if (r.kind === 'empty') { box.replaceChildren(h('p', { class: 'muted', text: 'Type your version first, or move on with Next question.' })); return; }
        if (r.kind === 'same') { box.replaceChildren(h('p', { class: 'muted', text: 'That is the same as the sentence above. What would you change?' })); return; }
        if (r.kind === 'match') { rec.status = 'matched'; save(); box.replaceChildren(h('p', null, h('strong', { text: 'That matches ours. ' }), 'Nicely fixed.')); lock(); return; }
        if (r.kind === 'comma') { rec.status = 'matched'; save(); box.replaceChildren(h('p', null, h('strong', { text: 'That works. ' }), 'Ours differs only by a comma, and either way is fine here.')); lock(); return; }
        rec.tries++; rec.status = 'close'; save();
        box.replaceChildren(
          h('p', null, (rec.tries === 1 ? 'Close. ' : 'Still ') + 'I would write it differently in ' + places(r.regions.length) + '.'),
          h('p', { class: 'fix-yours' }, h('span', { class: 'muted small', text: 'Yours, with the parts to look at shaded: ' }), shadedSentence(r.text, r.regions)),
          h('p', { class: 'muted small', text: 'Have another go and press Check again, or move on. The answers come at the end.' }));
        ta.focus();
      });
      nextBtn.addEventListener('click', function () {
        rec.mine = ta.value;
        if (rec.status === 'none' && normaliseSentence(ta.value)) rec.status = 'close';
        if (rec.status === 'none') rec.status = 'skipped';
        if (last) { state.ended = true; save(); drawEnd(); } else { state.pos++; save(); drawQuestion(); }
      });

      if (rec.status === 'matched') { box.replaceChildren(h('p', null, h('strong', { text: 'That matches ours. ' }), 'Nicely fixed.')); lock(true); }
      wrap.replaceChildren(
        h('p', { class: 'eyebrow', text: 'Learn · Fix it' }),
        h('h1', { text: f.title }),
        h('p', { class: 'lede', text: f.intro }),
        h('p', { class: 'muted small', text: 'Sentence ' + (i + 1) + ' of ' + f.items.length }),
        h('div', { class: 'fix-item' },
          h('p', { class: 'fix-wrong' }, h('q', { text: it.wrong })),
          h('label', { for: 'fix-box', class: 'muted small', text: 'Rewrite it correctly' }), ta, fixNote,
          h('div', { class: 'fix-actions' }, checkBtn, nextBtn), box),
        h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/learn', text: 'Back to Learn' })));
      var h1 = wrap.querySelector('h1'); if (h1 && i > 0) { ta.focus(); }
    }

    function drawEnd() {
      var matched = state.items.filter(function (x) { return x.status === 'matched'; }).length;
      markDone('learn-' + f.id);
      logDone({ id: 'learn-' + f.id, kind: 'Learn', title: f.title, topic: 'Fix it', matched: matched, total: f.items.length });
      var words = { matched: 'Matched ours', close: 'Different from ours (it may still be fine)', skipped: 'Skipped', none: 'Skipped' };
      wrap.replaceChildren(
        h('p', { class: 'eyebrow', text: 'Learn · Fix it' }),
        h('h1', { text: 'The answers' }),
        h('p', { class: 'lede', text: 'You matched ' + matched + ' of ' + f.items.length + ' straight away. Here is one way to write each sentence, and why. If yours is different, check whether it still follows the rule.' }),
        h('ol', { class: 'fix-list' }, f.items.map(function (it, i) {
          var rec = state.items[i];
          return h('li', { class: 'fix-item' },
            h('p', { class: 'fix-wrong' }, h('span', { class: 'muted small', text: 'Sentence ' + (i + 1) + ': ' }), h('q', { text: it.wrong })),
            rec.mine && rec.status !== 'matched' ? h('p', null, h('span', { class: 'muted small', text: 'Yours: ' }), rec.mine) : null,
            h('p', null, h('strong', { text: 'One way to write it: ' }), it.fixed),
            h('p', { class: 'muted small', text: it.why }),
            h('p', { class: 'muted small', text: words[rec.status] }));
        })),
        h('div', { class: 'actions' },
          downloadButton(f.title, function () {
            return [f.title, LEVELS[level()] + ' · Fix it', 'Saved ' + prettyDate(today()), ''].concat(f.items.map(function (it, i) {
              var rec = state.items[i];
              return ['Sentence ' + (i + 1) + ': ' + it.wrong, 'My version: ' + (rec.mine || '(skipped)'), 'One way to write it: ' + it.fixed, it.why, ''].join('\n');
            })).join('\n');
          }, 'Download these answers', 'btn secondary'),
          h('button', { type: 'button', class: 'btn secondary', text: 'Try this set again', onclick: function () { reset(); drawQuestion(); window.scrollTo(0, 0); } }),
          h('a', { class: 'btn', href: '#/learn', text: 'Back to Learn' })));
      var h1 = wrap.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
    }

    if (!restore()) reset();
    if (state.ended) drawEnd(); else drawQuestion();
    return wrap;
  }


  // ---------- Pick up where you left off, and My work ----------

  function readingProgress(m, rec) {
    var answers = (rec && rec.answers) || {}, any = false, typed = false;
    Object.keys(answers).forEach(function (k) {
      var a = answers[k] || {};
      if (typeof a.choice === 'number' || (a.choices && a.choices.length) || a.checked || a.shown || a.text || (a.map && Object.keys(a.map).length)) any = true;
      if (a.text) typed = true;
    });
    return { started: any || (rec && rec.pos > 0), any: any, typed: typed };
  }
  function writingProgress(rec) {
    var plan = (rec && rec.plan) || {};
    var planned = Object.keys(plan).some(function (k) { return plan[k] && String(plan[k]).trim(); });
    var drafted = !!(rec && rec.draft && rec.draft.trim());
    return { started: planned || drafted, planned: planned, drafted: drafted };
  }

  // Missions she has begun at this level but not finished, newest first.
  function inProgress() {
    var lv = ':' + level(), out = [];
    store.keys('reading:').forEach(function (k) {
      if (k.slice(-lv.length) !== lv) return;
      var id = k.slice('reading:'.length, -lv.length), m = find(content.reading.missions, id);
      if (!m || !visible(m) || !inLevel(m) || isDone(id)) return;
      var rec = store.get(k, null);
      if (readingProgress(m, rec).started) out.push({ t: (rec && rec.t) || 0, kind: 'Reading', title: m.title, theme: m.topic, href: '#/reading/' + id });
    });
    store.keys('writing:').forEach(function (k) {
      if (k.slice(-lv.length) !== lv) return;
      var id = k.slice('writing:'.length, -lv.length), m = find(content.writing.missions, id);
      if (!m || !visible(m) || isDone(id)) return;
      var rec = store.get(k, null);
      if (writingProgress(rec).started) out.push({ t: (rec && rec.t) || 0, kind: 'Writing', title: m.title, theme: m.topic, href: '#/writing/' + id + '/' + ((rec && rec.step) || 'task') });
    });
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }

  // A read-only box that shows her words and doubles as the thing to copy from.
  function myWordsBox(text, label) {
    var ta = h('textarea', { class: 'marking-block', readonly: true, rows: String(Math.min(12, Math.max(3, Math.ceil(text.length / 80) + 1))), 'aria-label': label });
    ta.value = text;
    var msg = h('span', { class: 'status', role: 'status' });
    return h('div', null, ta, h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn quiet', text: 'Copy', onclick: function () { copyText(ta).then(function (ok) { msg.textContent = ok ? 'Copied.' : 'Select the text and copy it yourself.'; }); } }), msg));
  }

  function myWorkView() {
    var lv = ':' + level(), writing = [], reading = [];
    store.keys('writing:').forEach(function (k) {
      if (k.slice(-lv.length) !== lv) return;
      var id = k.slice('writing:'.length, -lv.length), m = find(content.writing.missions, id), rec = store.get(k, null);
      if (m && writingProgress(rec).started) writing.push({ m: m, rec: rec, t: rec.t || 0 });
    });
    store.keys('reading:').forEach(function (k) {
      if (k.slice(-lv.length) !== lv) return;
      var id = k.slice('reading:'.length, -lv.length), m = find(content.reading.missions, id), rec = store.get(k, null);
      if (m && readingProgress(m, rec).typed) reading.push({ m: m, rec: rec, t: rec.t || 0 });
    });
    writing.sort(function (a, b) { return b.t - a.t; }); reading.sort(function (a, b) { return b.t - a.t; });

    function writingItem(w) {
      var mm = missionFor(w.m), plan = w.rec.plan || {}, draft = (w.rec.draft || '').trim();
      var fields = planFields(mm).filter(function (f) { return plan[f.key] && String(plan[f.key]).trim(); });
      return h('details', { class: 'work-item' },
        h('summary', null, h('span', { class: 'menu-name', text: w.m.title }), h('span', { class: 'menu-count', text: draft ? wordCount(draft) + ' words' : 'plan only' })),
        fields.length ? h('div', null, h('h3', { text: 'My plan' }), h('dl', { class: 'pane-plan' }, fields.map(function (f) { return [h('dt', { text: f.label }), h('dd', { text: plan[f.key] })]; }))) : null,
        draft ? h('div', null, h('h3', { text: 'My writing' }), myWordsBox(draft, 'My writing for ' + w.m.title)) : null,
        h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/writing/' + w.m.id + '/' + (draft ? 'write' : 'plan'), text: draft ? 'Carry on writing' : 'Carry on planning' }), downloadButton(w.m.title, function () { return writingFileText(mm, w.rec); }, 'Download')));
    }
    function readingItem(r) {
      var qs = forLevel(r.m.questions).filter(function (q) { return q.type === 'open' && r.rec.answers[q.id] && r.rec.answers[q.id].text; });
      return h('details', { class: 'work-item' },
        h('summary', null, h('span', { class: 'menu-name', text: r.m.title }), h('span', { class: 'menu-count', text: qs.length + (qs.length === 1 ? ' written answer' : ' written answers') })),
        qs.map(function (q) {
          return h('div', null, h('h3', { text: (q.label ? 'Question ' + q.label + ': ' : '') + q.prompt }), myWordsBox(r.rec.answers[q.id].text, 'My answer to ' + q.prompt),
            h('p', { class: 'muted small' }, h('strong', { text: 'One possible answer: ' }), q.model));
        }),
        h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/reading/' + r.m.id + '/0', text: 'Open the mission' }), downloadButton(r.m.title, function () { return readingFileText(r.m, r.rec); }, 'Download all my answers')));
    }

    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: 'My work · ' + LEVELS[level()] }),
      h('h1', { text: 'My work' }),
      h('p', { class: 'lede', text: 'Everything you have written, kept on this device. Open one to read it again or copy it.' }),
      !writing.length && !reading.length ? h('p', { class: 'muted', text: 'Nothing written yet at this level. Your plans, writing and written answers will appear here as you go.' }) : null,
      writing.length ? h('section', null, h('h2', { text: 'Writing and plans' }), writing.map(writingItem)) : null,
      reading.length ? h('section', null, h('h2', { text: 'Written answers in reading' }), reading.map(readingItem)) : null,
      h('p', { class: 'muted small', text: 'This stays in this browser. If you clear your browser data or use another device it will not come with you, so copy anything you want to keep.' }),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' }), h('a', { class: 'btn quiet', href: '#/progress', text: 'My progress' })));
  }

  // On the Done page: all her answers in one place.
  function answersReview(m, saved) {
    var qs = forLevel(m.questions);
    return h('details', { class: 'work-item' },
      h('summary', null, h('span', { class: 'menu-name', text: 'Look back at my answers' })),
      h('ol', { class: 'review-list' }, qs.map(function (q) {
        var a = saved.answers[q.id] || {}, opts = optionsFor(q), mine;
        if (q.type === 'open') mine = a.text ? a.text : '(left blank)';
        else if (q.type === 'multi') mine = (a.choices || []).slice().sort().map(function (i) { return LETTERS[i] + '. ' + opts[i]; }).join('; ') || '(no answer)';
        else if (q.type === 'match') mine = q.items.map(function (it, i) { return it.label + ': ' + (it.given ? it.answer : (a.map && a.map[i]) || '?'); }).join('; ');
        else mine = typeof a.choice === 'number' ? (q.type === 'choice' ? LETTERS[a.choice] + '. ' : '') + opts[a.choice] : '(no answer)';
        return h('li', null, h('p', { class: 'fix-wrong', text: (q.label ? q.label + ' ' : '') + q.prompt }), h('p', null, h('span', { class: 'muted small', text: 'Your answer: ' }), mine));
      })));
  }

  // ---------- Make a pack (no server: you copy a prompt to an AI chat, paste the answer back) ----------

  function slugOf(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function myPacks() { var p = store.get('mypacks', []); return Array.isArray(p) ? p.filter(function (x) { return x && x.pack && x.theme; }) : []; }

  // Built-in content plus the packs saved in this browser.
  function applyMyPacks() {
    var b = content.base, reading = b.reading.slice(), writing = b.writing.slice(), themes = b.themes.slice();
    myPacks().forEach(function (p) {
      (p.pack.reading || []).forEach(function (m) { reading.push(m); });
      (p.pack.writing || []).forEach(function (m) { writing.push(m); });
      if (!themes.some(function (t) { return t.name === p.theme.name; })) themes.push({ id: p.theme.id, name: p.theme.name, blurb: p.theme.blurb, custom: true });
    });
    content.reading.missions = reading;
    content.writing.missions = writing;
    content.themes = themes;
  }

  function levelsFor(choice) { return choice === 'L1' ? ['L1'] : choice === 'L2' ? ['L2'] : ['L1', 'L2']; }

  function buildPackPrompt(f) {
    var theme = f.theme.trim();
    var lv = levelsFor(f.level);
    var formats = content.toolkit.formats.map(function (x) { return x.id; }).join(', ');
    var slug = slugOf(theme) || 'my-theme';
    var counts = [];
    if (+f.reading) counts.push(f.reading + ' short reading mission' + (+f.reading === 1 ? '' : 's'));
    if (+f.writingShort) counts.push(f.writingShort + ' shorter writing task' + (+f.writingShort === 1 ? '' : 's') + ' (Task 2, two bullet points)');
    if (+f.writingLong) counts.push(f.writingLong + ' longer writing task' + (+f.writingLong === 1 ? '' : 's') + ' (Task 1, three bullet points)');
    var example = {
      pack: slug + '-1',
      reading: [{
        id: 'r-' + slug + '-1', topic: theme, title: 'A short, friendly title', minutes: 10,
        texts: [{ id: 'A', levels: lv, kind: 'Web page', source: 'An invented website name', title: 'Title of the text', body: [{ p: 'A paragraph of the text.' }, { h: 'A heading' }, { ul: ['A bullet', 'Another bullet'] }, { p: 'Another paragraph.' }] }],
        questions: [
          { id: 'q1', levels: lv, type: 'choice', text: 'A', prompt: 'What is the main purpose of the text?', options: ['One option', 'The right option', 'Another option', 'A fourth option'], answer: 1, why: 'Why this is right, pointing to the text.' },
          { id: 'q2', levels: lv, type: 'tfns', text: 'A', prompt: 'A statement from the text.', answer: 'true', why: 'Quote or point to the text.' },
          { id: 'q3', levels: lv, type: 'factopinion', text: 'A', prompt: '"A sentence quoted from the text."', answer: 'opinion', why: 'Why it is a fact or an opinion.' },
          { id: 'q4', levels: lv, type: 'multi', text: 'A', label: '4', marks: 2, prompt: 'Which TWO of these are facts?', options: ['One', 'Two', 'Three', 'Four'], answer: [0, 2], why: 'Why those two.' },
          { id: 'q5', levels: lv, type: 'open', text: 'A', prompt: 'A question needing a short written answer.', model: 'A model answer.', check: ['I did this.', 'I did that.'] }
        ]
      }],
      writing: [{
        id: 'w-' + slug + '-1', topic: theme, task: 2, title: 'A task title', format: 'forum',
        context: 'A short, made-up situation.', audience: 'Who will read it.', purpose: 'Why it is being written.', instruction: 'Write a post for the forum.',
        bullets: ['first thing to cover', 'second thing to cover'],
        indicative: ['Ideas for the first bullet.', 'Ideas for the second bullet.']
      }]
    };
    var lines = [
      'I\'m building a free practice site for Pearson Edexcel Functional Skills English (Level 1 and Level 2, Reading and Writing) for one 17-year-old learner. Please write a pack of practice missions on the theme "' + theme + '"' + (f.about.trim() ? ' (' + f.about.trim() + ')' : '') + '.',
      '',
      'HOW TO REPLY (please make this easy for me)',
      '- Give me the result as a downloadable FILE called "' + slug + '-pack.json" that I can click to download. Please do not make me copy and paste a long block of text.',
      '- If you cannot make files, put everything in ONE code block (with a copy button) and nothing else, apart from one friendly sentence.',
      '- The file must hold only the JSON object, starting with { and ending with }.',
      '',
      'WHAT TO WRITE: ' + (counts.length ? counts.join(', ') : 'a few missions') + '.',
      'Level: ' + (f.level === 'L1' ? 'Level 1 (a little easier)' : f.level === 'L2' ? 'Level 2 (a little harder: inference, tone, comparing texts)' : 'questions marked for both levels, with a few Level 2 only') + '.',
      '',
      'THE SHAPE',
      '{ "pack": "' + slug + '-1", "reading": [ ...reading missions... ], "writing": [ ...writing tasks... ] }',
      'Every mission has "topic": "' + theme + '" exactly as written, and a unique "id" ending in a number (for example "r-' + slug + '-1", "w-' + slug + '-1").',
      '',
      'ABOUT REAL THINGS',
      '- The theme may be a real club, band, game or brand. Do NOT state facts, scores, statistics, quotes or news about real people, clubs, companies or places, and do not use real players\' or celebrities\' names.',
      '- Invent every person, team, shop, website, town and event. A made-up club or band with a similar feel is fine. Common knowledge that is true and harmless is fine.',
      '- Original writing only. Do not copy any existing text or exam paper.',
      '',
      'READING MISSION (short, about 10 minutes)',
      '- id, topic, title, minutes: 10, texts, questions.',
      '- One or two texts of 150 to 350 words, written as something real people read: web page, newsletter, blog post, advert, leaflet, email, article. Each text has id ("A", "B"), levels, kind, source (invented), title and body.',
      '- body is a list of blocks, each ONE of: {"p": "paragraph"}, {"h": "heading"}, {"ul": ["item"]}, {"ol": ["item"]}, {"box": "text in a box"}, {"table": {"head": ["Col"], "rows": [["cell"]]}}. Use **bold** for bold words.',
      '- 8 to 12 questions. Each has id ("q1", "q2"...), levels (' + JSON.stringify(lv) + ' or one of them), text (which text it is about: "A" or "B"), prompt and type:',
      '  choice: options (exactly 4), answer (index 0 to 3), why.',
      '  tfns: the prompt is a statement; answer is "true", "false" or "notstated"; why.',
      '  factopinion: the prompt is a quotation from the text; answer is "fact" or "opinion"; why.',
      '  multi: label, marks: 2, options (4 or 5), answer (a list of two indexes), why.',
      '  open: model (a model answer) and check (2 or 3 short "I ..." self-check statements).',
      '- Mix the types. Spread correct answers across A, B, C and D. Only one option may be defensible. Wrong options must be plausible but clearly wrong from the text. Every question must be answerable from the text alone. Every "why" must be accurate and, where it helps, quote the text exactly.',
      '',
      'WRITING TASK',
      '- id, topic, task (1 or 2), title, format, context, audience, purpose, instruction, bullets, indicative.',
      '- task 2 = shorter, exactly 2 bullets. task 1 = longer, exactly 3 bullets.',
      '- format must be one of: ' + formats + '.',
      '- context is a short made-up situation. audience and purpose are one line each. indicative has exactly one entry per bullet: ideas a good answer might include.',
      '',
      'STYLE',
      '- UK English. Calm, friendly, never babyish. Something a teenager might actually read or write.',
      '- No exam, test or fail wording. No violence, alcohol, gambling, dating or real-world politics.',
      '',
      'EXAMPLE (shortened: your reading missions need 8 to 12 questions)',
      JSON.stringify(example, null, 2)
    ];
    return lines.join('\n');
  }

  // Finds the JSON in a pasted reply, even if the AI wrapped it in a code fence or added a sentence.
  function parseLoose(text) {
    try { return JSON.parse(text); } catch (e) { /* try the other ways */ }
    var fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    var body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return JSON.parse(body);
  }

  function checkPastedPack(text, themeName) {
    var errs = [], notes = [], data = null;
    var R = window.NextStopRules;
    if (!R) return { errs: ['The checking rules did not load. Try refreshing the page.'], notes: notes };
    if (text.length > 400000) return { errs: ['That is far too long for one pack. Ask the AI for fewer missions.'], notes: notes };
    try { data = parseLoose(text); } catch (e) { return { errs: ['That does not look like a JSON reply (' + e.message + '). Ask the AI to send only the JSON, starting with { and ending with }.'], notes: notes }; }
    var taken = {};
    content.reading.missions.concat(content.writing.missions).forEach(function (m) { taken[m.id] = true; });
    var formats = {};
    content.toolkit.formats.forEach(function (x) { formats[x.id] = true; });
    var takenSet = new Set(Object.keys(taken));
    R.checkPackData(data, 'Your pack', errs, notes, { themeNames: [themeName], taken: takenSet, formats: new Set(Object.keys(formats)) });
    var total = (Array.isArray(data.reading) ? data.reading.length : 0) + (Array.isArray(data.writing) ? data.writing.length : 0);
    if (total > 20) errs.push('Your pack: more than 20 missions in one pack. Ask for smaller packs.');
    return { errs: errs, notes: notes, data: data };
  }

  function uniqueThemeId(name) {
    var base = slugOf(name) || 'theme', id = base, n = 2;
    while (content.themes.some(function (t) { return t.id === id && t.name !== name; })) id = base + '-' + (n++);
    return id;
  }

  function saveMyPack(data, themeName, blurb) {
    var packId = 'my-' + (slugOf(themeName) || 'pack') + '-' + Date.now().toString(36);
    function tidy(list) {
      return (list || []).map(function (m) { var c = JSON.parse(JSON.stringify(m)); delete c.status; c.id = packId + '-' + m.id; c.own = packId; return c; });
    }
    var existing = content.themes.filter(function (t) { return t.name === themeName; })[0];
    var record = { id: packId, made: today(), theme: { id: existing ? existing.id : uniqueThemeId(themeName), name: themeName, blurb: existing ? existing.blurb : (blurb || 'Your own theme.') },
      pack: { reading: tidy(data.reading), writing: tidy(data.writing) } };
    var all = myPacks(); all.push(record);
    var ok = store.setStrict('mypacks', all);
    if (ok) applyMyPacks();
    else { all.pop(); store.set('mypacks', all); }
    return ok ? record : null;
  }

  function makeView() {
    main.className = 'wide-ish';
    var form = Object.assign({ theme: '', about: '', level: 'both', reading: '2', writingShort: '2', writingLong: '1' }, store.get('make:form', {}) || {});
    function saveForm() { store.set('make:form', form); }

    var promptBox = h('textarea', { id: 'make-prompt', class: 'marking-block', readonly: true, rows: '14', 'aria-label': 'The prompt to copy' });
    var copyMsg = h('p', { class: 'status', role: 'status' });
    var copyBtn = h('button', { type: 'button', class: 'btn', text: 'Copy the prompt' });
    function redraw() {
      var ok = form.theme.trim().length > 0;
      promptBox.value = ok ? buildPackPrompt(form) : 'Type a theme above and your prompt will appear here.';
      copyBtn.disabled = !ok;
    }
    copyBtn.addEventListener('click', function () {
      copyText(promptBox).then(function (ok) { copyMsg.textContent = ok ? 'Copied. Now paste it into a chat with an AI.' : 'Could not copy automatically. Select the text and copy it yourself.'; });
    });

    function field(id, label, control, hint) {
      return h('div', { class: 'make-field' }, h('label', { class: 'field', for: id }, label, hint ? h('span', { class: 'hint', text: hint }) : null), control);
    }
    function select(id, key, options) {
      var sel = h('select', { id: id });
      options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (String(form[key]) === String(o[0])) op.selected = true; sel.appendChild(op); });
      sel.addEventListener('change', function () { form[key] = sel.value; saveForm(); redraw(); });
      return sel;
    }
    var theme = h('input', plain({ type: 'text', id: 'make-theme', maxlength: '40' }));
    theme.value = form.theme;
    theme.addEventListener('input', function () { form.theme = theme.value; saveForm(); redraw(); checkOut.replaceChildren(); });
    var about = h('textarea', plain({ id: 'make-about', rows: '2', maxlength: '200' }));
    about.value = form.about;
    about.addEventListener('input', function () { form.about = about.value; saveForm(); redraw(); });
    function nums(max) { var o = []; for (var i = 0; i <= max; i++) o.push([String(i), String(i)]); return o; }

    // Step 2: paste back
    var paste = h('textarea', plain({ id: 'make-paste', rows: '10', 'aria-label': 'Paste the AI reply here' }));
    paste.value = store.get('make:paste', '') || '';
    paste.addEventListener('input', function () { store.set('make:paste', paste.value); });
    var checkOut = h('div', { 'aria-live': 'polite' });
    var checkBtn = h('button', { type: 'button', class: 'btn', text: 'Check it' });
    function runCheck() {
      if (!form.theme.trim()) { checkOut.replaceChildren(h('p', { class: 'notice', text: 'Fill in the theme in step 1 first, so the page knows what to expect.' })); return; }
      if (!paste.value.trim()) { checkOut.replaceChildren(h('p', { class: 'notice', text: 'Paste the AI reply into the box first.' })); return; }
      var r = checkPastedPack(paste.value, form.theme.trim());
      if (r.errs.length) {
        var fix = 'Thanks. Please fix these problems and send the whole JSON again, with nothing before or after it:\n' + r.errs.map(function (e) { return '- ' + e; }).join('\n');
        var fixBox = h('textarea', { class: 'marking-block', readonly: true, rows: '6', 'aria-label': 'A message to send back to the AI' });
        fixBox.value = fix;
        var fixMsg = h('p', { class: 'status', role: 'status' });
        checkOut.replaceChildren(
          h('section', { class: 'feedback' },
            h('h3', { text: 'A few things to fix before it can be saved' }),
            h('ul', null, r.errs.slice(0, 30).map(function (e) { return h('li', { text: e }); })),
            r.errs.length > 30 ? h('p', { class: 'muted small', text: 'And ' + (r.errs.length - 30) + ' more. They are all in the message below.' }) : null),
          h('p', { class: 'muted small', text: 'Copy this message, send it to the AI, then paste the new reply above and check again.' }),
          fixBox,
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn secondary', text: 'Copy the message', onclick: function () { copyText(fixBox).then(function (ok) { fixMsg.textContent = ok ? 'Copied.' : 'Select the text and copy it yourself.'; }); } })),
          fixMsg);
        return;
      }
      var nR = (r.data.reading || []).length, nW = (r.data.writing || []).length;
      var saveMsg = h('p', { class: 'status', role: 'status' });
      var saveBtn = h('button', { type: 'button', class: 'btn', text: 'Save in this browser' });
      saveBtn.addEventListener('click', function () {
        var rec = saveMyPack(r.data, form.theme.trim(), form.about.trim());
        if (!rec) { saveMsg.textContent = 'This browser would not save it (it may be full or in private mode). Download the file instead, below.'; return; }
        store.set('make:paste', ''); paste.value = '';
        saveBtn.remove();
        checkOut.replaceChildren(h('section', { class: 'feedback' },
          h('h3', { text: 'Saved' }),
          h('p', null, 'Find it under ', h('a', { href: '#/theme/' + rec.theme.id, text: rec.theme.name }), ' on the front page. It only lives in this browser.')));
        drawMine();
      });
      checkOut.replaceChildren(h('section', { class: 'feedback' },
        h('h3', { text: 'That looks good' }),
        h('p', { text: nR + ' reading mission' + (nR === 1 ? '' : 's') + ' and ' + nW + ' writing task' + (nW === 1 ? '' : 's') + ' passed the same checks the site uses.' }),
        h('p', { class: 'muted small', text: 'The checks cannot tell whether every answer is right. Have a look at them as you do them. If one seems wrong, trust your own judgement.' })),
        h('div', { class: 'actions' }, saveBtn), saveMsg);
    }
    checkBtn.addEventListener('click', runCheck);
    var fileIn = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', id: 'make-file', class: 'visually-hidden' });
    var fileLabel = h('label', { class: 'btn', for: 'make-file', text: 'Choose the file the AI gave you' });
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      if (f.size > 400000) { checkOut.replaceChildren(h('p', { class: 'notice', text: 'That file is far too long for one pack. Ask the AI for fewer missions.' })); fileIn.value = ''; return; }
      var use = function (text) { fileIn.value = ''; paste.value = text; store.set('make:paste', text); runCheck(); };
      if (f.text) f.text().then(use, function () { checkOut.replaceChildren(h('p', { class: 'notice', text: 'That file could not be read.' })); });
      else { var rd = new FileReader(); rd.onload = function () { use(String(rd.result)); }; rd.readAsText(f); }
    });

    // My packs
    var mine = h('div');
    var confirmId = null;
    function drawMine() {
      var packs = myPacks();
      if (!packs.length) { mine.replaceChildren(h('p', { class: 'muted', text: 'Nothing saved yet.' })); return; }
      mine.replaceChildren(h('ul', { class: 'tool-list' }, packs.map(function (p) {
        var nr = (p.pack.reading || []).length, nw = (p.pack.writing || []).length;
        var del = h('button', { type: 'button', class: 'btn quiet', text: confirmId === p.id ? 'Really delete it' : 'Delete' });
        del.addEventListener('click', function () {
          if (confirmId !== p.id) { confirmId = p.id; drawMine(); return; }
          store.set('mypacks', myPacks().filter(function (x) { return x.id !== p.id; }));
          confirmId = null; applyMyPacks(); drawMine();
        });
        return h('li', { class: 'my-pack' },
          h('span', { class: 't-name', text: p.theme.name }),
          h('span', { class: 't-sum', text: nr + ' reading, ' + nw + ' writing · made ' + prettyDate(p.made) }),
          h('div', { class: 'actions' },
            h('a', { class: 'btn quiet', href: '#/theme/' + p.theme.id, text: 'Open' }),
            h('button', { type: 'button', class: 'btn quiet', text: 'Download', onclick: function () { download('next-stop-pack-' + (slugOf(p.theme.name) || 'pack') + '.json', JSON.stringify({ pack: p.id, reading: p.pack.reading, writing: p.pack.writing }, null, 2), 'application/json'); } }),
            del));
      })));
    }

    redraw(); drawMine();
    return h('div', { class: 'mission make' },
      h('p', { class: 'eyebrow', text: 'Make your own' }),
      h('h1', { text: 'Make a pack' }),
      h('p', { class: 'lede', text: 'Pick something you are into. This page writes a prompt for you. You paste it into an AI chat, paste the answer back here, and the page checks it. It is saved in this browser only.' }),
      h('p', { class: 'muted small', text: 'This page never talks to an AI itself. Nothing you type here leaves your browser unless you copy it yourself. AI can make mistakes and can get facts wrong, so treat what it writes as practice material, not as the truth about real people or clubs.' }),
      h('section', { 'aria-labelledby': 'mk1' },
        h('h2', { id: 'mk1', text: '1. Pick a theme' }),
        field('make-theme', 'Theme', theme, 'For example: a football club, a band, a game, a hobby.'),
        field('make-about', 'Anything else? (optional)', about, 'For example: match days, the stadium, fans, shirts.'),
        h('div', { class: 'make-row' },
          field('make-level', 'Level', select('make-level', 'level', [['both', 'Both levels'], ['L1', 'Level 1'], ['L2', 'Level 2']])),
          field('make-reading', 'Short reading missions', select('make-reading', 'reading', nums(3))),
          field('make-ws', 'Shorter writing tasks', select('make-ws', 'writingShort', nums(4))),
          field('make-wl', 'Longer writing tasks', select('make-wl', 'writingLong', nums(2)))),
        h('h3', { text: 'Your prompt' }),
        promptBox,
        h('div', { class: 'actions' }, copyBtn), copyMsg),
      h('section', { 'aria-labelledby': 'mk2' },
        h('h2', { id: 'mk2', text: '2. Bring the answer back' }),
        h('p', { class: 'muted small', text: 'If the AI gave you a file, choose it here. If it gave you text instead, paste it into the box. Extra words or a code box around the JSON are fine.' }),
        h('div', { class: 'actions' }, fileIn, fileLabel),
        h('label', { class: 'field', for: 'make-paste' }, 'Or paste it here'),
        paste,
        h('div', { class: 'actions' }, checkBtn), checkOut),
      h('section', { 'aria-labelledby': 'mk3' },
        h('h2', { id: 'mk3', text: 'Your packs' }),
        mine),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  // ---------- Header account link, locked missions, plans, account, family ----------

  function renderAccountLink() {
    var a = document.getElementById('account-link');
    if (!a) return;
    a.textContent = me.signedIn ? 'Account' : 'Sign in';
    if (isPlus()) a.appendChild(h('span', { class: 'plan-badge', text: PLAN }));
    a.setAttribute('aria-label', me.signedIn ? 'Your account' + (isPlus() ? ', ' + PLAN : '') : 'Sign in');
    a.setAttribute('data-sync', syncState);
  }

  function applyBrand() {
    BRAND = me.brand || BRAND; PLAN = me.planName || PLAN;
    Array.prototype.forEach.call(document.querySelectorAll('.brand-name'), function (e) { e.textContent = BRAND; });
    var b = document.querySelector('.brand'); if (b) b.setAttribute('aria-label', BRAND + ', back to the map');
  }

  function refreshAll(rerender) {
    return api('GET', '/api/me').then(function (r) { me = r.body; applyBrand(); renderAccountLink(); return loadAll(); }).then(function () { setupFooter(); if (rerender) render({ keepFocus: true }); });
  }

  function lockedView(m, kind) {
    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: (kind === 'reading' ? 'Reading' : kind === 'writing' ? 'Writing' : 'Learn') + ' · ' + (m.topic || '') + ' · ' + LEVELS[level()] }),
      h('h1', { text: m.title }),
      h('div', { class: 'locked-card' },
        h('p', { class: 'lede', text: 'This one is part of ' + PLAN + '.' }),
        h('ul', null,
          h('li', { text: 'Every reading mission and writing task, at both levels.' }),
          h('li', { text: 'Feedback on your writing from an AI: two things that worked and one to try. You choose whether to see marks.' }),
          h('li', { text: 'Your work saved to your account and on every device.' })),
        h('div', { class: 'actions' },
          h('a', { class: 'btn', href: '#/plans', text: 'See ' + PLAN }),
          me.signedIn ? null : h('a', { class: 'btn secondary', href: '#/account', text: 'Sign in' }),
          h('a', { class: 'btn quiet', href: '#/', text: 'Back' }))),
      h('p', { class: 'muted small', text: 'The free taster has a first mission in every theme, all the toolkit and fix-it practice, and the Make-your-own-theme page.' }));
  }

  function lockedCount(list) { return list.filter(function (m) { return m.locked; }).length; }

  function plusNotice(count) {
    if (isPlus() || !count) return null;
    return h('p', { class: 'notice plus-notice' }, count + ' more here with ' + PLAN + '. ', h('a', { href: '#/plans', text: 'See ' + PLAN }));
  }

  function field(id, label, control, hint) {
    return h('div', { class: 'make-field' }, h('label', { class: 'field', for: id }, label, hint ? h('span', { class: 'hint', text: hint }) : null), control);
  }

  function redeemBox() {
    var input = h('input', plain({ type: 'text', id: 'redeem-code', maxlength: '40' }));
    var msg = h('p', { class: 'status', role: 'status' });
    var btn = h('button', { type: 'button', class: 'btn secondary', text: 'Use this code' });
    btn.addEventListener('click', function () {
      if (!me.signedIn) { msg.textContent = 'Sign in first, then use your code.'; return; }
      if (!input.value.trim()) { msg.textContent = 'Type your code first.'; return; }
      btn.disabled = true;
      api('POST', '/api/redeem', { code: input.value }).then(function (r) {
        btn.disabled = false;
        if (r.status === 200) { msg.textContent = 'That worked. ' + PLAN + ' is on.'; refreshAll(true); } else msg.textContent = r.body.error || 'That code did not work.';
      });
    });
    return h('div', { class: 'redeem' }, field('redeem-code', 'Have a code?', input, 'For example from a tutor or a school.'), h('div', { class: 'actions' }, btn), msg);
  }

  function plansView() {
    var msg = h('p', { class: 'status', role: 'status' });
    var buy = h('div', { class: 'actions' });
    api('GET', '/api/billing/plans').then(function (r) {
      var p = r.body || {};
      if (!p.enabled || !(p.plans || []).length) { buy.replaceChildren(h('p', { class: 'muted', text: PLAN + ' is not on sale yet. If you have a code you can use it below.' })); return; }
      buy.replaceChildren.apply(buy, p.plans.map(function (pl) {
        return h('button', { type: 'button', class: 'btn' + (pl.renews ? '' : ' secondary'), text: (pl.label || pl.id) + (pl.renews ? '' : ''), onclick: function () {
          if (!me.signedIn) { location.hash = '#/account'; return; }
          msg.textContent = 'Taking you to our payment partner…';
          api('POST', '/api/billing/checkout', { plan: pl.id }).then(function (res) {
            if (res.status === 200 && res.body.url) window.location.assign(res.body.url); else msg.textContent = res.body.error || 'Could not start that. Please try again.';
          });
        } });
      }));
    });
    function row(name, free, plus) { return h('tr', null, h('th', { scope: 'row', text: name }), h('td', { text: free }), h('td', { text: plus })); }
    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: 'Plans' }),
      h('h1', { text: 'Free, and ' + PLAN }),
      h('p', { class: 'lede', text: 'Start free. Choose ' + PLAN + ' when you want everything, and feedback on your writing.' }),
      isPlus() ? h('p', { class: 'notice', text: 'You have ' + PLAN + (me.plan.until ? ' until ' + prettyDate(me.plan.until.slice(0, 10)) : '') + '. Thank you.' }) : null,
      h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'What each plan includes' }, h('table', { class: 'plan-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: '' }), h('th', { scope: 'col', text: 'Free' }), h('th', { scope: 'col', text: PLAN }))),
        h('tbody', null,
          row('Reading missions', 'A first one in every theme', 'All of them, both levels, including the long ones'),
          row('Writing tasks', 'A first one in every theme', 'All of them, with plan, write and send steps'),
          row('Learn by marking', 'One task each level and all fix-it sets', 'All sample answers to mark'),
          row('Toolkit', 'All of it', 'All of it'),
          row('Feedback on your writing', 'Copy it to any AI yourself', (me.quota && me.quota.limit ? me.quota.limit : 'A set number of') + ' AI feedbacks each month'),
          row('Work saved to your account', 'Saved on one device', 'On every device, automatically'),
          row('Parent or tutor view', '—', 'You choose who sees your progress'),
          row('Make your own theme', 'Yes', 'Yes')))),
      h('p', { class: 'muted small', text: 'AI feedback is a guide, not an official mark. It can be a mark or two out either way.' }),
      h('div', { class: 'plans-buy' }, buy, msg),
      redeemBox(),
      h('p', { class: 'muted small' }, 'Payments are handled by our payment partner on their own page. We never see your card. ', h('a', { href: '/privacy', text: 'Privacy' }), ' · ', h('a', { href: '/terms', text: 'Terms' })),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  function signinView(token) {
    var msg = h('p', { class: 'status', role: 'status' });
    var btn = h('button', { type: 'button', class: 'btn', text: 'Sign in' });
    btn.addEventListener('click', function () {
      btn.disabled = true; msg.textContent = 'Signing you in…';
      api('POST', '/api/auth/verify', { token: token }).then(function (r) {
        if (r.status === 200) {
          me = r.body.me; applyBrand(); renderAccountLink();
          loadAll().then(function () { setupFooter(); return syncNow({ rerender: false }); }).then(function () { location.hash = '#/account'; render(); });
        } else { btn.disabled = false; msg.textContent = r.body.error || 'That did not work.'; msg.appendChild(h('span', null, ' ', h('a', { href: '#/account', text: 'Ask for a new link' }))); }
      }).catch(function () { btn.disabled = false; msg.textContent = 'Could not reach the service. Please try again.'; });
    });
    return h('div', { class: 'mission' },
      h('p', { class: 'eyebrow', text: 'Sign in' }),
      h('h1', { text: 'Press to sign in' }),
      h('p', { class: 'lede', text: 'You asked for a link to ' + BRAND + '. One press and you are in.' }),
      h('div', { class: 'actions' }, btn), msg);
  }

  function downloadMyData() {
    return api('GET', '/api/me/export').then(function (r) {
      if (r.status !== 200) return false;
      download('my-' + BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-data-' + today() + '.json', JSON.stringify(r.body, null, 2), 'application/json');
      return true;
    });
  }

  function accountView() {
    if (!me.signedIn) return signedOutAccount();
    var wrap = h('div', { class: 'mission account' });
    var famBox = h('div'), msgs = h('div', { 'aria-live': 'polite' });

    function note(text, bad) { msgs.replaceChildren(h('p', { class: bad ? 'notice' : 'status', text: text })); }

    function drawFamily() {
      api('GET', '/api/family').then(function (r) {
        if (r.status !== 200) { famBox.replaceChildren(h('p', { class: 'muted', text: r.body.error || 'Could not load this just now.' })); return; }
        var f = r.body;
        var code = h('p', { class: 'invite-code', 'aria-live': 'polite' });
        var inviteBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Make a code to share' });
        inviteBtn.addEventListener('click', function () {
          api('POST', '/api/family/invite').then(function (res) {
            if (res.status === 200) { code.replaceChildren('Give this code to the person: ', h('strong', { class: 'the-code', text: res.body.code }), h('span', { class: 'muted small', text: ' It works once, for ' + res.body.expiresInDays + ' days.' })); }
            else code.textContent = res.body.error || 'Could not make a code.';
          });
        });
        var enter = h('input', plain({ type: 'text', id: 'family-code', maxlength: '20' }));
        var enterMsg = h('p', { class: 'status', role: 'status' });
        var enterBtn = h('button', { type: 'button', class: 'btn secondary', text: 'Link to a learner' });
        enterBtn.addEventListener('click', function () {
          api('POST', '/api/family/accept', { code: enter.value }).then(function (res) {
            if (res.status === 200) { enter.value = ''; enterMsg.textContent = res.body.already ? 'You are already linked.' : 'Linked.'; drawFamily(); } else enterMsg.textContent = res.body.error || 'That did not work.';
          });
        });
        famBox.replaceChildren(
          h('h3', { text: 'People who can see my progress' }),
          h('p', { class: 'muted small', text: 'They see what you have finished and when. Your writing stays private unless you tick the box. You can stop sharing at any time.' }),
          f.asLearner.length ? h('ul', { class: 'tool-list' }, f.asLearner.map(function (l) {
            var cb = h('input', { type: 'checkbox' }); cb.checked = l.shareWriting;
            cb.addEventListener('change', function () { api('PATCH', '/api/family/' + l.id, { shareWriting: cb.checked }).then(function (res) { if (res.status !== 200) { cb.checked = !cb.checked; } }); });
            return h('li', { class: 'family-row' }, h('span', { class: 't-name', text: l.with }),
              h('label', { class: 'toggle' }, cb, 'Also share my writing'),
              h('button', { type: 'button', class: 'btn quiet', text: 'Stop sharing', onclick: function () { api('DELETE', '/api/family/' + l.id).then(drawFamily); } }));
          })) : h('p', { class: 'muted', text: 'Nobody yet.' }),
          h('div', { class: 'actions' }, inviteBtn), code,
          h('h3', { text: 'Learners who share with me' }),
          f.asParent.length ? h('ul', { class: 'tool-list' }, f.asParent.map(function (l) {
            return h('li', { class: 'family-row' }, h('span', { class: 't-name', text: l.learner }), h('span', { class: 't-sum', text: l.lastActive ? 'Last active ' + prettyDate(l.lastActive) : 'Nothing finished yet' }),
              h('a', { class: 'btn quiet', href: '#/family/' + l.id, text: 'See progress' }),
              h('button', { type: 'button', class: 'btn quiet', text: 'Remove', onclick: function () { api('DELETE', '/api/family/' + l.id).then(drawFamily); } }));
          })) : h('p', { class: 'muted', text: 'Nobody yet.' }),
          field('family-code', 'Got a code from a learner?', enter), h('div', { class: 'actions' }, enterBtn), enterMsg);
      });
    }
    drawFamily();

    var del = h('input', plain({ type: 'text', id: 'delete-confirm', maxlength: '10' }));
    var delBtn = h('button', { type: 'button', class: 'btn quiet', text: 'Delete my account' });
    delBtn.addEventListener('click', function () {
      if (del.value !== 'DELETE') { note('Type DELETE in the box to confirm.', true); return; }
      api('DELETE', '/api/me', { confirm: 'DELETE' }).then(function (r) {
        if (r.status === 200) { me = { signedIn: false, features: me.features }; setSyncState('off'); refreshAll(false).then(function () { location.hash = '#/'; render(); }); } else note(r.body.error || 'Could not delete just now.', true);
      });
    });

    var syncLine = h('p', { class: 'muted small', id: 'sync-line', text: syncText() });
    var used = me.quota ? me.quota.used : 0, limit = me.quota ? me.quota.limit : 0;
    append(wrap,
      h('p', { class: 'eyebrow', text: 'Account' }),
      h('h1', { text: 'Your account' }),
      h('p', { class: 'lede' }, 'Signed in as ', h('strong', { text: me.user.email }), '.'),
      location.hash.indexOf('paid=1') !== -1 ? h('p', { class: 'notice', text: 'Thank you. It can take a moment for ' + PLAN + ' to switch on. Refresh in a minute if you do not see it.' }) : null,
      h('section', { 'aria-labelledby': 'acc-plan' },
        h('h2', { id: 'acc-plan', text: 'Your plan' }),
        isPlus()
          ? h('p', null, h('strong', { text: PLAN }), me.plan.until ? ' until ' + prettyDate(me.plan.until.slice(0, 10)) : '', me.plan.renews ? ' (renews automatically)' : '', '.')
          : h('p', null, 'You are on the free taster. ', h('a', { href: '#/plans', text: 'See ' + PLAN })),
        isPlus() && me.features.marking ? h('p', { class: 'muted', text: used + ' of ' + limit + ' AI feedbacks used this month.' }) : null,
        h('div', { class: 'actions' },
          me.canManageBilling ? h('button', { type: 'button', class: 'btn secondary', text: 'Manage billing', onclick: function () { api('POST', '/api/billing/portal').then(function (r) { if (r.status === 200 && r.body.url) window.location.assign(r.body.url); else note(r.body.error || 'Could not open billing.', true); }); } }) : null,
          h('a', { class: 'btn quiet', href: '#/plans', text: 'Plans' })),
        redeemBox()),
      h('section', { 'aria-labelledby': 'acc-sync' }, h('h2', { id: 'acc-sync', text: 'Saved work' }),
        h('p', { class: 'muted', text: 'Your work is saved on this device and also to your account, so you can pick it up on another device.' }), syncLine,
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn secondary', text: 'Sync now', onclick: function () { syncNow({ rerender: true }); } }))),
      h('section', { 'aria-labelledby': 'acc-fam' }, h('h2', { id: 'acc-fam', text: 'Parents and tutors' }), famBox),
      h('section', { 'aria-labelledby': 'acc-data' }, h('h2', { id: 'acc-data', text: 'Your data' }),
        h('p', { class: 'muted', text: 'You can download everything we hold about you, sign out, or delete your account and all your saved work. We keep nothing you write for marking.' }),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn secondary', text: 'Download my data', onclick: function () { downloadMyData().then(function (ok) { note(ok ? 'Downloaded.' : 'Could not download just now.', !ok); }); } }),
          h('button', { type: 'button', class: 'btn quiet', text: 'Sign out', onclick: function () { api('POST', '/api/auth/logout').then(function () { me = { signedIn: false, features: me.features }; setSyncState('off'); refreshAll(false).then(function () { location.hash = '#/'; render(); }); }); } }),
          h('button', { type: 'button', class: 'btn quiet', text: 'Sign out everywhere', onclick: function () { api('POST', '/api/auth/logout-all').then(function () { me = { signedIn: false, features: me.features }; setSyncState('off'); refreshAll(false).then(function () { location.hash = '#/'; render(); }); }); } })),
        field('delete-confirm', 'Delete my account', del, 'Type DELETE to confirm. This removes your account and saved work for good.'),
        h('div', { class: 'actions' }, delBtn),
        h('p', { class: 'muted small' }, h('a', { href: '/privacy', text: 'Privacy' }), ' · ', h('a', { href: '/terms', text: 'Terms' }))),
      msgs);
    return wrap;
  }

  function signedOutAccount() {
    var email = h('input', plain({ type: 'email', id: 'signin-email', maxlength: '254', autocomplete: 'email' }));
    var msg = h('div', { 'aria-live': 'polite' });
    var btn = h('button', { type: 'button', class: 'btn', text: 'Email me a link' });
    function send() {
      if (!email.value.trim()) { msg.replaceChildren(h('p', { class: 'notice', text: 'Type your email address first.' })); return; }
      btn.disabled = true;
      api('POST', '/api/auth/request', { email: email.value }).then(function (r) {
        btn.disabled = false;
        if (r.status === 200) {
          msg.replaceChildren(h('section', { class: 'feedback' }, h('h3', { text: 'Check your email' }),
            h('p', { text: 'We have sent a link to ' + email.value.trim() + '. It works once and lasts 15 minutes. It can take a minute to arrive, and it may be in junk.' }),
            r.body.devLink ? h('p', null, h('a', { class: 'btn secondary', href: r.body.devLink, text: 'Open the link (development only)' })) : null));
        } else msg.replaceChildren(h('p', { class: 'notice', text: r.body.error || 'That did not work. Please try again.' }));
      }).catch(function () { btn.disabled = false; msg.replaceChildren(h('p', { class: 'notice', text: 'Could not reach the service. Please try again.' })); });
    }
    btn.addEventListener('click', send);
    email.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    return h('div', { class: 'mission account' },
      h('p', { class: 'eyebrow', text: 'Account' }),
      h('h1', { text: 'Sign in' }),
      h('p', { class: 'lede', text: 'No password to remember. Type your email and we send you a link.' }),
      field('signin-email', 'Email address', email),
      h('div', { class: 'actions' }, btn), msg,
      h('p', { class: 'muted small', text: 'You do not need an account for the free taster. An account saves your work to every device and lets you use ' + PLAN + '.' }),
      h('p', { class: 'muted small' }, 'We use your email only to sign you in and about your account. ', h('a', { href: '/privacy', text: 'Privacy' }), ' · ', h('a', { href: '/terms', text: 'Terms' })),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/', text: 'Back' })));
  }

  function familyView(id) {
    var wrap = h('div', { class: 'mission' });
    append(wrap, h('p', { class: 'eyebrow', text: 'Progress shared with you' }), h('h1', { text: 'Loading…' }));
    if (!me.signedIn) { location.hash = '#/account'; return wrap; }
    api('GET', '/api/family/' + encodeURIComponent(id) + '/summary').then(function (r) {
      if (r.status !== 200) { wrap.replaceChildren(h('h1', { text: 'Not available' }), h('p', { class: 'notice', text: 'This link is not available any more. The learner may have stopped sharing.' }), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/account', text: 'Back to your account' }))); return; }
      var s = r.body.summary;
      function stat(n, label) { return h('div', null, h('dt', { text: label }), h('dd', { text: String(n) })); }
      var days = []; for (var i = 27; i >= 0; i--) { var d = new Date(Date.now() - i * 86400000); var k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); days.push({ k: k, n: s.perDay[k] || 0 }); }
      wrap.replaceChildren(
        h('p', { class: 'eyebrow', text: 'Progress shared with you' }),
        h('h1', { text: r.body.learner }),
        h('p', { class: 'muted', text: 'Read only. They choose what you can see, and can stop sharing at any time.' }),
        h('dl', { class: 'stats four' }, stat(s.totalFinished, 'things finished'), stat(s.activeDaysLast28, s.activeDaysLast28 === 1 ? 'day active in the last four weeks' : 'days active in the last four weeks'), stat(s.lastActive ? prettyDate(s.lastActive) : '—', 'last active'), stat(Object.keys(s.themes).length, 'themes tried')),
        h('h2', { text: 'The last four weeks' }),
        h('div', { class: 'daystrip', role: 'img', 'aria-label': s.activeDaysLast28 + ' active days in the last 28' }, days.map(function (d) { return h('span', { class: 'day' + (d.n ? ' on' : ''), title: d.k + (d.n ? ': ' + d.n : '') }); })),
        h('h2', { text: 'Finished so far' }),
        h('ul', { class: 'plain-list' }, ['L1', 'L2'].map(function (l) { var b = s.byLevel[l]; return h('li', { text: LEVELS[l] + ': ' + b.reading + ' reading, ' + b.writing + ' writing, ' + b.practice + ' practice sets' }); })),
        Object.keys(s.themes).length ? h('p', { class: 'muted', text: 'Themes: ' + Object.keys(s.themes).map(function (t) { return t + ' (' + s.themes[t] + ')'; }).join(', ') }) : null,
        h('h2', { text: 'Recent' }),
        s.recent.length ? h('ul', { class: 'plain-list' }, s.recent.map(function (e) { return h('li', { text: prettyDate(e.date) + ' · ' + e.kind + ' · ' + e.title }); })) : h('p', { class: 'muted', text: 'Nothing finished yet.' }),
        r.body.shareWriting ? h('div', null, h('h2', { text: 'Writing they chose to share' }),
          s.writing.length ? s.writing.map(function (w) { return h('details', { class: 'work-item' }, h('summary', null, h('span', { class: 'menu-name', text: w.title }), h('span', { class: 'menu-count', text: w.words + ' words · ' + LEVELS[w.level] })), h('p', { class: 'shared-text', text: w.text })); }) : h('p', { class: 'muted', text: 'Nothing written yet.' })) : h('p', { class: 'muted small', text: 'Their writing is private.' }),
        h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/account', text: 'Back to your account' })));
      var h1 = wrap.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); }
    }).catch(function () { wrap.replaceChildren(h('h1', { text: 'Not available' }), h('p', { class: 'notice', text: 'Could not reach the service. Please try again.' })); });
    return wrap;
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

  // Everything the learner may open, from the server. Locked missions arrive as titles only.
  function loadAll() {
    var drafts = me.admin && showDrafts() ? '?drafts=1' : '';
    return api('GET', '/api/content' + drafts).then(function (res) {
      if (res.status !== 200 || !res.body.reading) throw new Error('content ' + res.status);
      var b = res.body;
      content = { reading: b.reading, writing: b.writing, toolkit: b.toolkit, learn: b.learn, themes: b.themes, entitled: b.entitled };
      content.base = { reading: b.reading.missions.slice(), writing: b.writing.missions.slice(), themes: b.themes.slice() };
      applyMyPacks();
    });
  }

  function start() {
    setupLevelSwitch();
    api('GET', '/api/me').then(function (r) { if (r.status === 200) { me = r.body; applyBrand(); renderAccountLink(); } })
      .then(loadAll).then(function () {
        setupFooter();
        window.addEventListener('hashchange', function () { render(); });
        render({ keepFocus: true });
        startSync();
      }).catch(function (err) {
        if (window.console) console.error(err);
        main.replaceChildren(h('div', { class: 'notice' },
          h('h1', { text: 'The missions did not load' }),
          h('p', { text: 'Try refreshing the page. If you are offline, connect and try again.' })));
      });
  }

  start();
})();
