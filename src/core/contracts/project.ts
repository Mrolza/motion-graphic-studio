import { z } from 'zod';

export const VideoFormatSchema = z.enum([
  'how_it_works',
  'how_its_made',
  'technical',
  'what_if',
  'today_in_history',
]);

export const VisualStyleSchema = z.enum(['blueprint', 'isometric', 'map_archive']);

export const DeviceProfileNameSchema = z.enum(['hemat', 'standar', 'penuh']);

export const StageIdSchema = z.enum([
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
]);

export const StageStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'needs_review',
]);

export const ProjectSchema = z.object({
  id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }).or(z.string().min(1)),
  topic: z.string().min(1),
  format: VideoFormatSchema,
  style: VisualStyleSchema,
  palette: z.string().min(1),
  target_duration_sec: z.number().int().positive().max(180),
  device_profile: DeviceProfileNameSchema,
  stages: z.record(StageIdSchema, StageStatusSchema),
  llm_calls: z.record(StageIdSchema, z.number().int().nonnegative()),
});

export type VideoFormat = z.infer<typeof VideoFormatSchema>;
export type VisualStyle = z.infer<typeof VisualStyleSchema>;
export type DeviceProfileName = z.infer<typeof DeviceProfileNameSchema>;
export type StageId = z.infer<typeof StageIdSchema>;
export type StageStatus = z.infer<typeof StageStatusSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export const ALL_STAGES: StageId[] = [
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12',
];
