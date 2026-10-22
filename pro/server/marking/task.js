// The marking task is built here from our own copy of the lesson, never from text sent by the browser.
// A learner's request names the task (and the level) and carries her answer; everything else comes from the server.
export function taskRequest(content, missionId, level, answer) {
  const raw = content.mission('writing', missionId);
  if (!raw || (level !== 'L1' && level !== 'L2')) return null;
  const m = { ...raw, ...((raw.levels && raw.levels[level]) || {}) };   // some tasks change their bullet points at Level 2
  const format = (content.toolkit.formats || []).find((f) => f.id === m.format);
  return {
    level, task: m.task, format: format ? format.name : m.format,
    context: m.context, audience: m.audience, purpose: m.purpose, instruction: m.instruction, bullets: m.bullets,
    ...(m.info && m.info.length ? { info: m.info } : {}),
    answer,
  };
}
