import { z } from 'zod';

export const ScriptSentenceSchema = z
  .object({
    text: z.string().min(1),
    spoken_text: z.string().min(1).optional(),
    claim_refs: z.array(z.string().min(1)),
    emphasis_words: z.array(z.string().min(1)),
    non_factual: z.boolean().optional(),
  })
  .refine(
    (s) => s.claim_refs.length > 0 || s.non_factual === true,
    {
      message: 'Factual sentence must have at least one claim_ref unless non_factual is true',
      path: ['claim_refs'],
    }
  );

export const ScriptSceneSchema = z.object({
  id: z.string().min(1),
  sentences: z.array(ScriptSentenceSchema).min(1),
});

export const ScriptSchema = z.object({
  scenes: z.array(ScriptSceneSchema).min(1),
});

export type ScriptSentence = z.infer<typeof ScriptSentenceSchema>;
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;
export type Script = z.infer<typeof ScriptSchema>;
