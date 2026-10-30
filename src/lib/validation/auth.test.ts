import { describe, expect, it } from "vitest";

import { loginSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({
      email: "admin@example.com",
      password: "secret",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "invalid-email",
      password: "secret",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Please enter a valid email address.");
  });
});
