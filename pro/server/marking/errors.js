// Why marking failed, in terms that matter to the learner (never the AI provider's own messages).
export class MarkingError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }   // setup | busy | unavailable | unfinished
}
