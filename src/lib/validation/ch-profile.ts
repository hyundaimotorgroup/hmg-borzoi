import { z } from "zod";

const scalarSettingValueSchema = z.union([z.string(), z.number()]);

export const chProfileSettingModeSchema = z.enum([
  "READONLY",
  "WRITABLE",
  "CONST",
  "CHANGEABLE_IN_READONLY",
]);

export const chProfileSettingSchema = z
  .object({
    name: z.string().trim().min(1, "Setting name is required."),
    value: scalarSettingValueSchema.optional(),
    min: scalarSettingValueSchema.optional(),
    max: scalarSettingValueSchema.optional(),
    mode: chProfileSettingModeSchema.optional(),
  })
  .refine(
    (setting) =>
      setting.value !== undefined ||
      setting.min !== undefined ||
      setting.max !== undefined ||
      setting.mode !== undefined,
    {
      message: "Setting value, range, or mode is required.",
    }
  );

export const chProfileSettingsInputSchema = z.union([
  z.array(chProfileSettingSchema),
  z.record(z.string(), scalarSettingValueSchema),
]);

const CH_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.-]+$/;

const optionalNonEmptyString = z.string().trim().min(1).optional();
const optionalIdentifierString = z
  .string()
  .trim()
  .min(1)
  .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
  .optional();

const baseCHProfileMutationSchema = z.object({
  profileName: optionalIdentifierString,
  settings: chProfileSettingsInputSchema.optional(),
  originalSettings: chProfileSettingsInputSchema.optional(),
  inheritProfiles: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Inherited profile name is required.")
        .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
    )
    .optional(),
  logicalCluster: optionalIdentifierString,
  sqlQuery: optionalNonEmptyString,
});

export const createCHProfileSchema = baseCHProfileMutationSchema.superRefine((data, ctx) => {
  if (!data.sqlQuery && !data.profileName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["profileName"],
      message: "Profile name is required",
    });
  }
});

export const updateCHProfileSchema = baseCHProfileMutationSchema.superRefine((data, ctx) => {
  if (!data.sqlQuery && !data.profileName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["profileName"],
      message: "Profile name is required",
    });
  }
});

export type CHProfileSettingsInput = z.infer<typeof chProfileSettingsInputSchema>;
