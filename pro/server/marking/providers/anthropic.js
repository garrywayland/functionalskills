// Marking with Claude (Anthropic API). Same call as the original marking service.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { buildSystem, buildUser, Feedback } from '../prompts.js';
import { MarkingError } from '../errors.js';

export function makeAnthropicProvider(cfg, client = new Anthropic({ timeout: cfg.markTimeoutMs }), log = () => {}) {
  async function ask(req) {
    const base = {
      model: cfg.anthropicModel,
      max_tokens: 8000,   // thinking tokens count towards this, so leave plenty of room
      system: buildSystem(),
      messages: [{ role: 'user', content: buildUser(req) }],
      output_config: { effort: cfg.anthropicEffort, format: zodOutputFormat(Feedback) },
    };
    if (cfg.useFallbacks) {
      // If safety systems decline a request, the API re-runs it on a fallback model by itself.
      try { return await client.beta.messages.parse({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }); }
      catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; log('fallbacks were rejected (400); retrying without them'); }
    }
    return client.messages.parse(base);
  }
  return {
    kind: 'anthropic', model: cfg.anthropicModel,
    async mark(req) {
      let r;
      try { r = await ask(req); }
      catch (e) {
        log('model call failed', { provider: 'anthropic', type: e?.constructor?.name, status: e?.status });
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new MarkingError('setup');
        if (e instanceof Anthropic.RateLimitError) throw new MarkingError('busy');
        throw new MarkingError('unavailable');
      }
      const usage = { in: r.usage?.input_tokens, out: r.usage?.output_tokens };
      if (r.stop_reason === 'refusal') return { refused: true, usage };
      if (r.stop_reason === 'max_tokens' || !r.parsed_output) throw new MarkingError('unfinished');
      return { parsed: r.parsed_output, usage };
    },
  };
}
