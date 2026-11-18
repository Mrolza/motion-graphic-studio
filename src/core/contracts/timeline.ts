import { z } from 'zod';

export const TimelineEventSchema = z.object({
  type: z.enum(['hook', 'scene_cut', 'mg_in', 'stat_count']),
  at: z.number().nonnegative(),
  dur: z.number().nonnegative().optional(),
});

export const TimelineSceneSchema = z.object({
  scene_id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  audio_path: z.string().min(1),
});

export const TimelineBeatSchema = z.object({
  beat_id: z.string().min(1),
  scene_id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

export const TimelineShotSchema = z.object({
  shot_id: z.string().min(1),
  beat_id: z.string().min(1),
  scene_id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  reframe_index: z.number().int().nonnegative(),
});

export const TimelineWordSchema = z.object({
  text: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  scene_id: z.string().min(1),
});

export const TimelineSchema = z.object({
  total_sec: z.number().nonnegative(),
  scenes: z.array(TimelineSceneSchema),
  beats: z.array(TimelineBeatSchema),
  shots: z.array(TimelineShotSchema),
  words: z.array(TimelineWordSchema),
  events: z.array(TimelineEventSchema),
});

export type Timeline = z.infer<typeof TimelineSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
