// Save and restore her work as one file, and merge a saved file into what is already in the browser.
// Pure functions on plain objects ({ storageKey: value }), so they run in the page and in Node tests.
// Merging never throws away anything she has: it adds what is missing, and where both sides have the same
// thing, the most recently changed copy wins (filling any gaps from the other copy).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NextStopBackup = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP = 'next-stop', VERSION = 1, MAX_BYTES = 5 * 1024 * 1024;

  function isPlain(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function empty(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // Which stored things belong in a backup. Menus, the teacher-view switch and half-pasted packs do not.
  function family(key) {
    if (key === 'done' || key === 'log' || key === 'mypacks' || key === 'level') return key;
    if (/^(reading|writing|feedback):[A-Za-z0-9_-]+:(L1|L2)$/.test(key)) return 'record';
    if (/^drill:(format|spag):[A-Za-z0-9_-]+$/.test(key)) return 'drill';
    if (/^learn-fix:[A-Za-z0-9_-]+$/.test(key)) return 'learnfix';
    if (/^learn:[A-Za-z0-9_-]+$/.test(key)) return 'learn';
    return null;
  }
  function isBackupKey(key) { return family(key) !== null; }

  function shapeOk(key, v) {
    var f = family(key);
    if (f === 'done') return isPlain(v);
    if (f === 'log') return Array.isArray(v) && v.length <= 20000 && v.every(function (e) { return isPlain(e) && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.kind === 'string'; });
    if (f === 'mypacks') return Array.isArray(v) && v.length <= 200 && v.every(function (p) { return isPlain(p) && typeof p.id === 'string' && isPlain(p.theme) && typeof p.theme.name === 'string' && typeof p.theme.id === 'string' && isPlain(p.pack) && (p.pack.reading === undefined || Array.isArray(p.pack.reading)) && (p.pack.writing === undefined || Array.isArray(p.pack.writing)); });
    if (f === 'level') return v === 'L1' || v === 'L2';
    return isPlain(v);
  }

  // data: everything stored under the nextstop: prefix, as { key: value }
  function make(data, today) {
    var out = {};
    Object.keys(data).sort().forEach(function (k) { if (isBackupKey(k) && shapeOk(k, data[k])) out[k] = data[k]; });
    return { app: APP, version: VERSION, saved: today, data: out };
  }

  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'That file is empty.' };
    if (text.length > MAX_BYTES) return { ok: false, error: 'That file is much bigger than a saved-work file should be.' };
    var o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'That does not look like a saved-work file from this site.' }; }
    if (!isPlain(o) || o.app !== APP || !isPlain(o.data)) return { ok: false, error: 'That does not look like a saved-work file from this site.' };
    if (typeof o.version !== 'number' || o.version > VERSION) return { ok: false, error: 'That file was made by a newer version of the site. Refresh the page and try again.' };
    var data = {}, skipped = 0;
    Object.keys(o.data).forEach(function (k) {
      if (isBackupKey(k) && shapeOk(k, o.data[k])) data[k] = o.data[k]; else skipped++;
    });
    return { ok: true, data: data, saved: typeof o.saved === 'string' ? o.saved : '', skipped: skipped };
  }

  // Copies anything the winner is missing from the loser (objects are filled in depth).
  function fill(winner, loser) {
    if (isPlain(winner) && isPlain(loser)) {
      var out = clone(winner);
      Object.keys(loser).forEach(function (k) {
        if (empty(out[k])) { if (!empty(loser[k])) out[k] = clone(loser[k]); }
        else if (isPlain(out[k]) && isPlain(loser[k])) out[k] = fill(out[k], loser[k]);
      });
      return out;
    }
    return empty(winner) && !empty(loser) ? clone(loser) : clone(winner);
  }

  function newest(mine, theirs) {
    var tm = mine.t || 0, tt = theirs.t || 0;
    var res = tt > tm ? fill(theirs, mine) : fill(mine, theirs);
    if (tm || tt) res.t = Math.max(tm, tt);
    return res;
  }

  function drillScore(o) { var n = 0; if (isPlain(o.answers)) Object.keys(o.answers).forEach(function (k) { var a = o.answers[k]; if (a && (a.checked || typeof a.choice === 'number')) n++; }); return n * 2 + (o.pos || 0); }
  function fixScore(o) { var n = 0; (o.items || []).forEach(function (x) { if (x && x.status && x.status !== 'none') n++; }); return (o.ended ? 1000 : 0) + n * 2 + (o.pos || 0); }

  // existing and incoming are { key: value }. Returns the keys to write, and what happened.
  function merge(existing, incoming) {
    var changes = {}, report = { added: { records: 0, packs: 0, steps: 0, done: 0 }, updated: 0, unchanged: 0 };
    Object.keys(incoming).forEach(function (key) {
      var f = family(key), inc = incoming[key], have = existing[key], next;
      if (!isBackupKey(key) || !shapeOk(key, inc)) return;
      if (have === undefined) {
        next = clone(inc);
        if (f === 'record' || f === 'drill' || f === 'learn' || f === 'learnfix') report.added.records++;
        if (f === 'mypacks') report.added.packs += inc.length;
        if (f === 'log') report.added.steps += inc.length;
        if (f === 'done') Object.keys(inc).forEach(function (l) { report.added.done += isPlain(inc[l]) ? Object.keys(inc[l]).length : 0; });
        changes[key] = next; return;
      }
      if (f === 'level') { report.unchanged++; return; }
      if (f === 'done') {
        next = clone(have);
        Object.keys(inc).forEach(function (l) {
          if (!isPlain(inc[l])) return;
          if (!isPlain(next[l])) next[l] = {};
          Object.keys(inc[l]).forEach(function (id) { if (!next[l][id]) { next[l][id] = inc[l][id]; report.added.done++; } });
        });
      } else if (f === 'log') {
        next = clone(have); var seen = {};
        next.forEach(function (e) { seen[e.id + '|' + e.level + '|' + e.date] = true; });
        inc.forEach(function (e) { var k = e.id + '|' + e.level + '|' + e.date; if (!seen[k]) { seen[k] = true; next.push(clone(e)); report.added.steps++; } });
        next.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      } else if (f === 'mypacks') {
        next = clone(have); var ids = {};
        next.forEach(function (p) { ids[p.id] = true; });
        inc.forEach(function (p) { if (!ids[p.id]) { ids[p.id] = true; next.push(clone(p)); report.added.packs++; } });
      } else if (f === 'record') {
        next = newest(have, inc);
        if (same(Object.assign({}, next, { t: have.t }), have)) next = have;   // nothing new, so do not touch the timestamp
      } else if (f === 'learn') {
        var first = inc.revealed && !have.revealed ? inc : have, second = first === inc ? have : inc;
        next = fill(first, second);
      } else if (f === 'drill') {
        next = drillScore(inc) > drillScore(have) ? fill(inc, have) : fill(have, inc);
      } else if (f === 'learnfix') {
        next = fixScore(inc) > fixScore(have) ? fill(inc, have) : fill(have, inc);
      }
      if (same(next, have)) report.unchanged++;
      else { changes[key] = next; if (f === 'record' || f === 'drill' || f === 'learn' || f === 'learnfix') report.updated++; }
    });
    return { changes: changes, report: report };
  }

  return { APP: APP, VERSION: VERSION, isBackupKey: isBackupKey, make: make, parse: parse, merge: merge, fill: fill };
});
