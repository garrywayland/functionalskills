// Marking with Gemini on Google Cloud Vertex AI. It signs in as the Cloud Run service itself, so there is no key
// to store, and the cost goes on the Google Cloud bill (so your prepaid credit pays for it).
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { buildSystem, buildUser, Feedback } from '../prompts.js';
import { MarkingError } from '../errors.js';

export function makeVertexProvider(cfg, ai, log = () => {}) {
  const client = ai || new GoogleGenAI({
    vertexai: true, project: cfg.vertexProject, location: cfg.vertexLocation,
    ...(cfg.vertexBaseUrl ? { httpOptions: { baseUrl: cfg.vertexBaseUrl } } : {}),
  });
  const schema = z.toJSONSchema(Feedback);
  delete schema.$schema;
  return {
    kind: 'vertex', model: cfg.vertexModel,
    async mark(req) {
      let res;
      try {
        res = await client.models.generateContent({
          model: cfg.vertexModel,
          contents: buildUser(req),
          config: { systemInstruction: buildSystem(), responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2, maxOutputTokens: 4000 },
        });
      } catch (e) {
        const status = e?.status || e?.code;
        log('model call failed', { provider: 'vertex', type: e?.constructor?.name, status });
        if (status === 401 || status === 403) throw new MarkingError('setup');
        if (status === 429) throw new MarkingError('busy');
        throw new MarkingError('unavailable');
      }
      const usage = { in: res.usageMetadata?.promptTokenCount, out: res.usageMetadata?.candidatesTokenCount };
      const cand = res.candidates && res.candidates[0];
      if (res.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') return { refused: true, usage };
      if (cand?.finishReason === 'MAX_TOKENS') throw new MarkingError('unfinished');
      let parsed;
      try { parsed = Feedback.parse(JSON.parse(res.text)); } catch { throw new MarkingError('unfinished'); }
      return { parsed, usage };
    },
  };
}
