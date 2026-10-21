// The lessons live on the server. A signed-out or free visitor is sent only the free ones in full, plus
// "locked" stubs (title, theme, size) so the lists still show what Plus adds. Locked text and answers
// are never sent, so there is nothing to find in the page source.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function numberedQuestions(m) {
  // Same count the page shows: 1(a) and 1(b) are one numbered question.
  const out = {};
  for (const lvl of ['L1', 'L2']) {
    const seen = new Set();
    m.questions.filter((q) => !Array.isArray(q.levels) || q.levels.includes(lvl)).forEach((q, i) => seen.add(q.label ? String(q.label).split('(')[0] : 'n' + i));
    out[lvl] = seen.size;
  }
  return out;
}

export function loadContent(contentDir) {
  const man = readJson(path.join(contentDir, 'index.json'));
  const tiers = readJson(path.join(contentDir, 'tiers.json'));
  const themes = readJson(path.join(contentDir, man.themes)).themes;
  const reading = man.reading.flatMap((f) => readJson(path.join(contentDir, f)).missions);
  const writingFiles = man.writing.map((f) => readJson(path.join(contentDir, f)));
  const writingBase = writingFiles[0];
  const writing = writingFiles.flatMap((f) => f.missions);
  const toolkit = readJson(path.join(contentDir, man.toolkit));
  const learn = readJson(path.join(contentDir, man.learn));

  // Which missions are free: the first few per theme, unless a mission says otherwise with "tier".
  const free = new Set();
  const perTheme = { reading: {}, writing: {} };
  for (const m of reading) {
    if (m.status === 'draft') continue;
    if (m.tier) { if (m.tier === 'free') free.add(m.id); continue; }
    const n = perTheme.reading[m.topic] || 0;
    if (m.length !== 'long' && n < tiers.freePerTheme.reading) { free.add(m.id); perTheme.reading[m.topic] = n + 1; }
  }
  for (const m of writing) {
    if (m.status === 'draft') continue;
    if (m.tier) { if (m.tier === 'free') free.add(m.id); continue; }
    const n = perTheme.writing[m.topic] || 0;
    if (m.task === 2 && n < tiers.freePerTheme.writing) { free.add(m.id); perTheme.writing[m.topic] = n + 1; }
  }
  const freeMarkTasks = new Set();
  const perLevel = {};
  // A free marking task needs its writing task to show the brief, so that writing task is free too.
  for (const t of learn.mark) { const n = perLevel[t.level] || 0; if (n < tiers.freeLearnMarkTasksPerLevel) { freeMarkTasks.add(t.id); free.add(t.missionId); perLevel[t.level] = n + 1; } }

  const writingConfig = { ...writingBase }; delete writingConfig.missions;

  function readingStub(m) {
    return { id: m.id, topic: m.topic, title: m.title, length: m.length || 'short', minutes: m.minutes, levels: m.levels, status: m.status, locked: true,
      meta: { texts: m.texts.length, questions: numberedQuestions(m), plain: Object.fromEntries(['L1', 'L2'].map((l) => [l, m.questions.filter((q) => !q.levels || q.levels.includes(l)).length])) } };
  }
  const writingStub = (m) => ({ id: m.id, topic: m.topic, task: m.task, title: m.title, format: m.format, levels: m.levels, status: m.status, locked: true });

  return {
    themes, tiers,
    isFree: (id) => free.has(id),
    counts() { return { reading: reading.length, writing: writing.length, free: free.size }; },
    mission(kind, id) { return (kind === 'reading' ? reading : writing).find((m) => m.id === id) || null; },
    themeOf(id) { const m = reading.find((x) => x.id === id) || writing.find((x) => x.id === id); return m ? m.topic : null; },
    allIds() { return new Set([...reading.map((m) => m.id), ...writing.map((m) => m.id)]); },
    writingConfig, toolkit,
    bundle({ entitled, drafts }) {
      const keep = (m) => drafts || m.status !== 'draft';
      const open = (m, id) => entitled || free.has(id);
      return {
        entitled: Boolean(entitled),
        reading: { missions: reading.filter(keep).map((m) => (open(m, m.id) ? m : readingStub(m))) },
        writing: { ...writingConfig, missions: writing.filter(keep).map((m) => (open(m, m.id) ? m : writingStub(m))) },
        toolkit,
        learn: {
          note: learn.note,
          fix: learn.fix,
          mark: learn.mark.map((t) => (entitled || freeMarkTasks.has(t.id) ? t : { id: t.id, title: t.title, level: t.level, missionId: t.missionId, locked: true, samples: t.samples.map((s) => ({ id: s.id })) })),
        },
        themes,
      };
    },
  };
}
