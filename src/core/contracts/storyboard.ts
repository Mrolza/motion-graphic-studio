import { z } from 'zod';

export const StoryboardLaneSchema = z.enum(['code_2d', 'code_3d', 'code_asset']);

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
    component: z.string().min(1),
    props: z.record(z.unknown()),
    claim_ref: z.string().min(1).optional(),
    bind_to_driver: z.boolean().optional(),
    illustrative: z.boolean().optional(),
  })
  .refine(
    (hud) => {
      const hasNumericProp = Object.values(hud.props).some((v) => typeof v === 'number');
      const isNumericHud =
        hud.component === 'StatCounter' ||
        hud.component === 'DimensionLine' ||
        hasNumericProp;
      if (!isNumericHud) return true;
      return Boolean(hud.claim_ref || hud.bind_to_driver || hud.illustrative);
    },
    {
      message:
        'Numeric HUD item must specify claim_ref, bind_to_driver: true, or illustrative: true',
    }
  );

export const StoryboardSceneSchema = z.object({
  id: z.string().min(1),
  lane: StoryboardLaneSchema,
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
export type StoryboardDriver = z.infer<typeof StoryboardDriverSchema>;
export type StoryboardInvariant = z.infer<typeof StoryboardInvariantSchema>;
export type StoryboardHudItem = z.infer<typeof StoryboardHudItemSchema>;
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
