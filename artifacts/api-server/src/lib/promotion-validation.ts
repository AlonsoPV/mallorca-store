import { z } from "zod/v4";

export const promotionInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["fixed", "percentage", "amount"]),
  value: z.number().min(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  branchIds: z.array(z.number().int()),
}).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) {
    ctx.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "endsAt must be after startsAt",
    });
  }
  if (value.type === "percentage" && value.value > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Percentage cannot exceed 100",
    });
  }
});

export const promotionsInputSchema = z.array(promotionInputSchema).optional();

export type PromotionInputData = z.infer<typeof promotionInputSchema>;

export function promotionValidationError(error: z.ZodError): string {
  const hasInvalidDateRange = error.issues.some(
    (issue) =>
      issue.path.at(-1) === "endsAt" &&
      issue.message === "endsAt must be after startsAt",
  );
  if (hasInvalidDateRange) {
    return "Invalid promotion date range: endsAt must be after startsAt";
  }
  return error.message;
}