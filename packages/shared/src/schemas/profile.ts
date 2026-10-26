import { z } from 'zod';

/** Quem vai usar o produto. Só preenchido com consentimento. */
export const BeneficiaryProfile = z.object({
  relation: z.enum(['self', 'father', 'mother', 'other']).default('self'),
  ageRange: z.enum(['under12', '12-17', '18-49', '50-64', '65plus']).optional(),
  conditions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  medsInUse: z.array(z.string()).default([]),
});
export type BeneficiaryProfile = z.infer<typeof BeneficiaryProfile>;
