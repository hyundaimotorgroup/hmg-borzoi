import { describe, expect, it } from "vitest";

import {
  createAppUserFormSchema,
  createAppUserSchema,
  updateAppUserFormSchema,
  userClusterAccessSchema,
} from "./app-user";

describe("app user validation", () => {
  it("accepts a valid create payload", () => {
    const result = createAppUserSchema.safeParse({
      name: "john_doe",
      email: "john@example.com",
      password: "password123",
      role: "viewer",
    });

    expect(result.success).toBe(true);
  });

  it("requires matching passwords for create form", () => {
    const result = createAppUserFormSchema.safeParse({
      username: "john_doe",
      email: "john@example.com",
      role: "viewer",
      password: "password123",
      confirmPassword: "password999",
      clusterAccess: [],
    });

    expect(result.success).toBe(false);
  });

  it("allows blank passwords in edit form", () => {
    const result = updateAppUserFormSchema.safeParse({
      username: "john_doe",
      email: "john@example.com",
      role: "viewer",
      password: "",
      confirmPassword: "",
      clusterAccess: [],
    });

    expect(result.success).toBe(true);
  });

  it("validates cluster access payload shape", () => {
    const result = userClusterAccessSchema.safeParse({
      clusterAccess: [{ clusterId: "cluster-a", chUsername: "reader", chPassword: "secret" }],
    });

    expect(result.success).toBe(true);
  });
});
