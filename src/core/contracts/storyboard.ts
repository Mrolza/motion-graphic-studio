import { z } from 'zod';

export const StoryboardLaneSchema = z.enum(['code_3d', 'code_2d', 'code_asset']);

export const ShotTypeSchema = z.enum([
  'establishing',
  'closeup',
  'cutaway',
  'cross_section',
  'diagram_overlay',
  'comparison',
  'summary',
]);

export const StoryboardDriverSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  from: z.number(),
  to: z.number(),
});

export const StoryboardInvariantSchema = z.object({
  entity: z.string().min(1),
  state: z.string().min(1),
  when: z.object({
    driver_between: z.tuple([z.number(), z.number()]),
  }),
});

export const StoryboardHudItemSchema = z
  .object({
    hud_id: z.string().min(1).optional(),
    component: z.string().min(1),
    props: z.record(z.unknown()),
    claim_ref: z.string().min(1).optional(),
    claim_refs: z.array(z.string().min(1)).optional(),
    bind_to_driver: z.boolean().optional(),
    quantity: z.string().min(1).optional(),
    display: z.enum(['value', 'qualitative']).optional(),
    illustrative: z.boolean().optional(),
    when: z
      .object({
        driver_between: z.tuple([z.number(), z.number()]),
      })
      .optional(),
  })
  .refine(
    (hud) => {
      const hasNumericProp = Object.values(hud.props).some((v) => typeof v === 'number');
      const isNumericHud =
        hud.component === 'StatCounter' ||
        hud.component === 'DimensionLine' ||
        hasNumericProp;
      if (!isNumericHud) return true;
      return Boolean(
        hud.claim_ref ||
          (hud.claim_refs && hud.claim_refs.length > 0) ||
          hud.bind_to_driver ||
          hud.illustrative
      );
    },
    {
      message:
        'Numeric HUD item must specify claim_ref, bind_to_driver: true, or illustrative: true',
    }
  );

export const StoryboardSceneSchema = z.object({
  id: z.string().min(1),
  lane: StoryboardLaneSchema,
  shot_type: ShotTypeSchema.optional(),
  view: z.enum(['section', 'perspective']).optional(),
  camera_move: z.string().min(1).optional(),
  duration_sec: z.number().positive(),
  sentence_refs: z.array(z.string().min(1)),
  focus_entities: z.array(z.string().min(1)).min(1),
  visible_parts: z.array(z.string().min(1)).optional(),
  driver: StoryboardDriverSchema.optional(),
  invariants: z.array(StoryboardInvariantSchema).optional(),
  hud: z.array(StoryboardHudItemSchema),
  trigger_words: z.array(z.string().min(1)),
});

export const StoryboardSchema = z.object({
  scenes: z.array(StoryboardSceneSchema).min(1),
});

export type StoryboardLane = z.infer<typeof StoryboardLaneSchema>;
export type ShotType = z.infer<typeof ShotTypeSchema>;
export type StoryboardDriver = z.infer<typeof StoryboardDriverSchema>;
export type StoryboardInvariant = z.infer<typeof StoryboardInvariantSchema>;
export type StoryboardHudItem = z.infer<typeof StoryboardHudItemSchema>;

export function getHudClaimRefs(
  hud: Pick<StoryboardHudItem, 'claim_ref' | 'claim_refs'>
): string[] {
  const out: string[] = [];
  if (hud.claim_ref) out.push(hud.claim_ref);
  if (hud.claim_refs) {
    for (const r of hud.claim_refs) {
      if (r && !out.includes(r)) out.push(r);
    }
  }
  return out;
}
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
