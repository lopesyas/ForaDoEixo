import { z } from 'zod';
import { BeneficiaryProfile } from './profile';

/** JSON que a LLM (ou o extrator por regras) deve devolver. Fora disso, cai no modo de contingência. */
export const Intent = z.object({
  kind: z.enum(['buy', 'health', 'reorder', 'other']),
  category: z.string().optional(),
  maxPriceCents: z.number().int().positive().optional(),
  beneficiary: BeneficiaryProfile.partial().optional(),
  symptoms: z.array(z.string()).default([]),
  urgent: z.boolean().default(false),
  missing: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof Intent>;
