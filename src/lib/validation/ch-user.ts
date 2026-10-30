import { z } from "zod";

const CH_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const CH_HOST_PATTERN = /^[a-zA-Z0-9_.:%*-]+$/;

const optionalNonEmptyString = z.string().trim().min(1).optional();
const optionalIdentifierString = z
  .string()
  .trim()
  .min(1)
  .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
  .optional();
const optionalHostPatternString = z
  .string()
  .trim()
  .min(1)
  .regex(CH_HOST_PATTERN, "Invalid host pattern.")
  .optional();
const roleNameArraySchema = z.array(
  z
    .string()
    .trim()
    .min(1, "Role name is required.")
    .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
);
const profileNameArraySchema = z.array(
  z
    .string()
    .trim()
    .min(1, "Profile name is required.")
    .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
);

const baseCHUserMutationSchema = z.object({
  username: optionalIdentifierString,
  password: z.string().optional(),
  authType: z
    .enum(["sha256_password", "plaintext_password", "no_password", "ldap"])
    .optional(),
  hostPattern: optionalHostPatternString,
  roles: roleNameArraySchema.optional(),
  defaultRoles: roleNameArraySchema.optional(),
  profiles: profileNameArraySchema.optional(),
  logicalCluster: optionalIdentifierString,
  sqlQuery: optionalNonEmptyString,
});

export const createCHUserSchema = baseCHUserMutationSchema.superRefine((data, ctx) => {
  if (data.sqlQuery) {
    return;
  }

  if (!data.username) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["username"],
      message: "Username is required",
    });
  }

  const requiresPassword =
    data.authType === undefined ||
    data.authType === "sha256_password" ||
    data.authType === "plaintext_password";

  if (requiresPassword && !data.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "Password is required for the selected authentication type",
    });
  }
});

export const updateCHUserSchema = baseCHUserMutationSchema.superRefine((data, ctx) => {
  if (!data.sqlQuery && !data.username) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["username"],
      message: "Username is required",
    });
  }
});
