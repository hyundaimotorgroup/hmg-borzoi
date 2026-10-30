import { z } from "zod";

export const executionLogResolveSchema = z.object({
  resolved: z.boolean(),
});

export const cacheConfigureSchema = z.object({
  ttl: z
    .number({ error: "TTL must be a number." })
    .int("TTL must be an integer.")
    .min(0, "TTL must be greater than or equal to 0."),
});

export const cacheInvalidateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("all"),
  }),
  z.object({
    type: z.literal("cluster"),
    clusterId: z
      .string({ error: "clusterId is required for cluster invalidation." })
      .trim()
      .min(1, "clusterId is required for cluster invalidation."),
  }),
  z.object({
    type: z.literal("field"),
    field: z
      .string({ error: "field is required for field invalidation." })
      .trim()
      .min(1, "field is required for field invalidation."),
  }),
]);

export const createAuditLogSchema = z.object({
  action: z.string().trim().min(1, "action is required.").max(100, "action must be 100 characters or fewer."),
  resourceType: z
    .string()
    .trim()
    .min(1, "resourceType is required.")
    .max(100, "resourceType must be 100 characters or fewer."),
  resourceId: z.string().trim().max(255, "resourceId must be 255 characters or fewer.").optional(),
  resourceName: z.string().trim().max(255, "resourceName must be 255 characters or fewer.").optional(),
  details: z.string().trim().min(1, "details is required.").max(5000, "details must be 5000 characters or fewer."),
  success: z.boolean().default(true),
  errorMessage: z.string().trim().max(1000, "errorMessage must be 1000 characters or fewer.").optional(),
});
