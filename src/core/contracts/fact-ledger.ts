import { z } from 'zod';

export const ClaimSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  quote: z.string().min(1),
  retrieved_at: z.string().min(1),
});

export const ClaimKindSchema = z.enum([
  'fact',
  'estimate',
  'hypothetical',
  'interpretation',
]);

export const ClaimStatusSchema = z.enum(['verified', 'unverified', 'disputed']);

export const FactClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  value: z.number().optional(),
  unit: z.string().min(1).optional(),
  step_id: z.string().min(1).optional(),
  kind: ClaimKindSchema,
  status: ClaimStatusSchema,
  status_reason: z.string().optional(),
  sources: z.array(ClaimSourceSchema).min(1),
});

export const FactLedgerSchema = z.object({
  claims: z.array(FactClaimSchema),
});

export type ClaimSource = z.infer<typeof ClaimSourceSchema>;
export type ClaimKind = z.infer<typeof ClaimKindSchema>;
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;
export type FactClaim = z.infer<typeof FactClaimSchema>;
export type FactLedger = z.infer<typeof FactLedgerSchema>;
