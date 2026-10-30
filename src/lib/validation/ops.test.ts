import { describe, expect, it } from "vitest";

import {
  cacheConfigureSchema,
  cacheInvalidateSchema,
  createAuditLogSchema,
  executionLogResolveSchema,
} from "./ops";

describe("ops validation", () => {
  it("accepts a valid execution log resolve payload", () => {
    const result = executionLogResolveSchema.safeParse({ resolved: true });

    expect(result.success).toBe(true);
  });

  it("rejects a negative cache ttl", () => {
    const result = cacheConfigureSchema.safeParse({ ttl: -1 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("TTL must be greater than or equal to 0.");
  });

  it("requires clusterId for cluster cache invalidation", () => {
    const result = cacheInvalidateSchema.safeParse({ type: "cluster" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("clusterId is required for cluster invalidation.");
  });

  it("accepts field cache invalidation", () => {
    const result = cacheInvalidateSchema.safeParse({ type: "field", field: "qps" });

    expect(result.success).toBe(true);
  });

  it("requires action and details for audit logs", () => {
    const result = createAuditLogSchema.safeParse({
      action: "",
      resourceType: "cluster",
      details: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("action is required.");
  });
});
