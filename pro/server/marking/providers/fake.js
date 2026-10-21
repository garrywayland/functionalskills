// A stand-in marker for tests and local development. It costs nothing and gives the same answer every time.
import { MarkingError } from '../errors.js';

export function makeFakeProvider() {
  return {
    kind: 'fake', model: 'fake',
    async mark(req) {
      const a = req.answer;
      if (a.includes('TRIGGER_REFUSAL')) return { refused: true, usage: { in: 0, out: 0 } };
      if (a.includes('TRIGGER_BUSY')) throw new MarkingError('busy');
      if (a.includes('TRIGGER_DOWN')) throw new MarkingError('unavailable');
      const words = a.trim().split(/\s+/).length;
      const maxComp = req.task === 1 ? 12 : 9; const maxSpag = req.task === 1 ? 9 : 6;
      const per = req.task === 1 ? 20 : 17;
      const comp = Math.max(0, Math.min(maxComp, Math.round(words / per)));
      const spag = Math.max(0, Math.min(maxSpag, Math.round(comp * maxSpag / maxComp)));
      const sentences = a.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      const quote = (s) => (s ? s.split(/\s+/).slice(0, 8).join(' ') : '');
      return {
        parsed: {
          composition_mark: comp, spag_mark: spag,
          worked: [
            { what: 'You began by getting straight to the point.', quote: quote(sentences[0]) },
            { what: 'You kept going with a clear voice.', quote: quote(sentences[sentences.length - 1]) },
          ],
          try_next: { what: 'Add one more detail or example to your strongest point.', example: 'For example: "I remember the first time I went."' },
        },
        usage: { in: 1000, out: 200 },
      };
    },
  };
}
