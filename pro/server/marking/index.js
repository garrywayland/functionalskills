import { HttpError } from '../util.js';
import { MarkRequest, finish } from './prompts.js';
import { MarkingError } from './errors.js';
import { makeAnthropicProvider } from './providers/anthropic.js';
import { makeVertexProvider } from './providers/vertex.js';
import { makeFakeProvider } from './providers/fake.js';

export { MarkRequest };

// Picks the AI named in MARKING_PROVIDER. Tests can pass ready-made clients instead.
export function makeProvider(cfg, deps = {}, log = () => {}) {
  if (cfg.markingProvider === 'anthropic') return makeAnthropicProvider(cfg, deps.anthropicClient, log);
  if (cfg.markingProvider === 'vertex') return makeVertexProvider(cfg, deps.genai, log);
  if (cfg.markingProvider === 'fake') return makeFakeProvider();
  return null;
}

export function makeMarker(provider) {
  return {
    available: Boolean(provider),
    kind: provider ? provider.kind : 'off',
    // Returns { ok:true, feedback, usage } or { ok:false, reason:'declined' }; throws HttpError for problems.
    async mark(input) {
      if (!provider) throw new HttpError(503, 'Marking is not switched on yet. You can use Copy instead.');
      let r;
      try { r = await provider.mark(input); }
      catch (e) {
        if (!(e instanceof MarkingError)) throw new HttpError(502, 'Marking is not available right now. Please try again, or use Copy.');
        if (e.kind === 'setup') throw new HttpError(500, 'Marking is not set up properly yet.');
        if (e.kind === 'busy') throw new HttpError(503, 'Marking is very busy. Please try again in a minute.');
        if (e.kind === 'unfinished') throw new HttpError(502, 'Marking did not finish. Please try again.');
        throw new HttpError(502, 'Marking is not available right now. Please try again, or use Copy.');
      }
      if (r.refused) return { ok: false, reason: 'declined', usage: r.usage };
      return { ok: true, feedback: finish(input, r.parsed), usage: r.usage };
    },
  };
}
