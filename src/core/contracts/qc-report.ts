import { z } from 'zod';

export const QcLayerSchema = z.enum([
  'L0',
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'mechanics',
  'framing',
  'technical',
]);

export const QcSeveritySchema = z.enum(['error', 'warning']);

export const QcIssueSchema = z.object({
  severity: QcSeveritySchema,
  message: z.string().min(1),
  ref: z.string().min(1),
});

export const QcReportSchema = z.object({
  layer: QcLayerSchema,
  issues: z.array(QcIssueSchema),
});

export type QcLayer = z.infer<typeof QcLayerSchema>;
export type QcSeverity = z.infer<typeof QcSeveritySchema>;
export type QcIssue = z.infer<typeof QcIssueSchema>;
export type QcReport = z.infer<typeof QcReportSchema>;
