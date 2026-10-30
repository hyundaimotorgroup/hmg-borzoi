import { z } from "zod";
import { splitSqlStatements } from "./sql";

const CH_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.-]+$/;

const optionalNonEmptyString = z.string().trim().min(1).optional();
const optionalIdentifierString = z
  .string()
  .trim()
  .min(1)
  .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
  .optional();

export const chRoleMutationSchema = z
  .object({
    roleName: optionalIdentifierString,
    profiles: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Profile name is required.")
          .regex(CH_IDENTIFIER_PATTERN, "Only letters, numbers, '_', '.', '-' are allowed.")
      )
      .optional(),
    logicalCluster: optionalIdentifierString,
    sqlQuery: optionalNonEmptyString,
  })
  .superRefine((data, ctx) => {
    if (!data.sqlQuery && !data.roleName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roleName"],
        message: "Role name is required",
      });
    }
  });

export { splitSqlStatements };
