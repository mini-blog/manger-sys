import { z } from 'zod';
const sentence = z.string().trim().min(1).max(1500);
const rating = z.number().min(1).max(5).multipleOf(0.5);
export const reportSchema = z
  .object({
    overview: sentence,
    learningProfile: z
      .object({
        summary: sentence,
        strengths: z.array(sentence).max(5),
        needsAttention: z.array(sentence).max(5),
      })
      .strict(),
    teacherEvaluation: z
      .object({
        classroomPerformanceRating: rating,
        overallAbilityRating: rating,
        summary: sentence,
      })
      .strict(),
    followup: z
      .object({
        purchaseIntentRating: rating.nullable(),
        reasons: z.array(z.string()).max(9),
        summary: sentence,
      })
      .strict(),
    observations: z
      .array(z.object({ text: sentence, sourceIds: z.array(z.string()).min(1).max(5) }).strict())
      .max(8),
    questionsToConfirm: z.array(sentence).max(5),
    suggestedNextActions: z.array(sentence).min(1).max(5),
  })
  .strict();
export type Facts = {
  classroomPerformanceRating: number;
  overallAbilityRating: number;
  purchaseIntentRating: number | null;
  reasons: string[];
};
export function validateReport(value: unknown, facts: Facts, ids: string[]) {
  const data = reportSchema.parse(value);
  if (
    data.teacherEvaluation.classroomPerformanceRating !== facts.classroomPerformanceRating ||
    data.teacherEvaluation.overallAbilityRating !== facts.overallAbilityRating ||
    data.followup.purchaseIntentRating !== facts.purchaseIntentRating ||
    JSON.stringify([...data.followup.reasons].sort()) !== JSON.stringify([...facts.reasons].sort())
  )
    throw new Error('Invented facts');
  if (data.observations.some((o) => o.sourceIds.some((id) => !ids.includes(id))))
    throw new Error('Unknown evidence');
  if (/\d\s*[%％]|成交概率|conversion probability/i.test(JSON.stringify(data)))
    throw new Error('Unsupported probability');
  return data;
}

// DashScope strict schema rejects multipleOf; a finite enum expresses the same
// half-star domain without weakening the separate Zod/runtime validation.
export const reportJsonSchema = JSON.parse(
  JSON.stringify(z.toJSONSchema(reportSchema), (key, value) => {
    if (value && typeof value === 'object' && value.multipleOf === 0.5) {
      const { multipleOf, ...rest } = value;
      return { ...rest, enum: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] };
    }
    return value;
  }),
);
