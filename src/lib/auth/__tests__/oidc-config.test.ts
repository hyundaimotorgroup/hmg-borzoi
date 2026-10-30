import { describe, it, expect, afterEach } from "vitest";
import {
  getConfiguredAppOrigin,
  getOidcSettings,
  isIdentifierClaimVerified,
  parseAdminEmails,
  resolveIdentifier,
  sanitizeReturnTo,
} from "../oidc-config";

describe("parseAdminEmails", () => {
  it("returns an empty set for undefined or empty input", () => {
    expect(parseAdminEmails(undefined)).toEqual(new Set());
    expect(parseAdminEmails(null)).toEqual(new Set());
    expect(parseAdminEmails("")).toEqual(new Set());
  });

  it("splits, trims and lowercases comma-separated emails", () => {
    expect(parseAdminEmails(" Admin1@Example.com, admin2@example.com ,,")).toEqual(
      new Set(["admin1@example.com", "admin2@example.com"])
    );
  });
});

describe("resolveIdentifier", () => {
  it("returns null when the claim is missing or not a string", () => {
    expect(resolveIdentifier({}, "email", "(.*)")).toBeNull();
    expect(resolveIdentifier({ email: 42 }, "email", "(.*)")).toBeNull();
  });

  it("returns the full value when the regex has no capture group", () => {
    expect(resolveIdentifier({ email: "user@example.com" }, "email", ".*")).toBe("user@example.com");
  });

  it("returns the first capture group when present", () => {
    expect(resolveIdentifier({ email: "user@example.com" }, "email", "^(.*)@example\\.com$")).toBe("user");
  });

  it("returns null when the regex does not match", () => {
    expect(resolveIdentifier({ email: "user@example.com" }, "email", "^nomatch$")).toBeNull();
  });

  it("returns null for an invalid regex instead of throwing", () => {
    expect(resolveIdentifier({ email: "user@example.com" }, "email", "(")).toBeNull();
  });
});

describe("isIdentifierClaimVerified", () => {
  describe('"trust" policy (the default)', () => {
    it("rejects only when email_verified is explicitly false", () => {
      expect(isIdentifierClaimVerified({ email_verified: false }, "email", "trust")).toBe(false);
    });

    it("treats a missing email_verified claim as verified (many IdPs omit it)", () => {
      expect(isIdentifierClaimVerified({}, "email", "trust")).toBe(true);
    });

    it("treats an explicit true as verified", () => {
      expect(isIdentifierClaimVerified({ email_verified: true }, "email", "trust")).toBe(true);
    });
  });

  describe('"require" policy', () => {
    it("requires an explicit true", () => {
      expect(isIdentifierClaimVerified({ email_verified: true }, "email", "require")).toBe(true);
    });

    it("rejects a missing claim, unlike trust", () => {
      expect(isIdentifierClaimVerified({}, "email", "require")).toBe(false);
    });

    it("rejects an explicit false", () => {
      expect(isIdentifierClaimVerified({ email_verified: false }, "email", "require")).toBe(false);
    });
  });

  describe('"ignore" policy', () => {
    it("always passes, even an explicit false", () => {
      // Some enterprise IdPs emit email_verified: false unconditionally for every
      // account (administratively-assigned addresses have no verification step),
      // making the claim meaningless rather than a real signal.
      expect(isIdentifierClaimVerified({ email_verified: false }, "email", "ignore")).toBe(true);
      expect(isIdentifierClaimVerified({}, "email", "ignore")).toBe(true);
    });
  });

  it("does not apply the check when the identifier claim isn't email, under any policy", () => {
    expect(isIdentifierClaimVerified({ email_verified: false }, "preferred_username", "trust")).toBe(true);
    expect(isIdentifierClaimVerified({}, "preferred_username", "require")).toBe(true);
  });
});

describe("getConfiguredAppOrigin", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null when AUTH_OIDC_BASE_URL is unset", () => {
    delete process.env.AUTH_OIDC_BASE_URL;
    expect(getConfiguredAppOrigin()).toBeNull();
  });

  it("returns null for an unparsable URL instead of throwing", () => {
    process.env.AUTH_OIDC_BASE_URL = "not-a-url";
    expect(getConfiguredAppOrigin()).toBeNull();
  });

  it("returns just the origin, dropping any path", () => {
    process.env.AUTH_OIDC_BASE_URL = "https://app.example.com/some/path";
    expect(getConfiguredAppOrigin()).toBe("https://app.example.com");
  });
});

describe("sanitizeReturnTo", () => {
  it("defaults to / for empty or missing values", () => {
    expect(sanitizeReturnTo(null)).toBe("/");
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo("")).toBe("/");
  });

  it("allows a same-origin relative path", () => {
    expect(sanitizeReturnTo("/cluster/5")).toBe("/cluster/5");
  });

  it("rejects protocol-relative and backslash open-redirect attempts", () => {
    expect(sanitizeReturnTo("//evil.com")).toBe("/");
    expect(sanitizeReturnTo("/\\evil.com")).toBe("/");
    expect(sanitizeReturnTo("https://evil.com")).toBe("/");
  });
});

describe("getOidcSettings", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns null when AUTH_OIDC_ENABLED is not "true"', () => {
    delete process.env.AUTH_OIDC_ENABLED;
    expect(getOidcSettings()).toBeNull();

    process.env.AUTH_OIDC_ENABLED = "false";
    expect(getOidcSettings()).toBeNull();
  });

  it("throws when enabled but missing required vars", () => {
    process.env.AUTH_OIDC_ENABLED = "true";
    delete process.env.AUTH_OIDC_ISSUER;
    delete process.env.AUTH_OIDC_CLIENT_ID;
    delete process.env.AUTH_OIDC_CLIENT_SECRET;
    delete process.env.AUTH_OIDC_BASE_URL;

    expect(() => getOidcSettings()).toThrow();
  });

  it("throws when AUTH_OIDC_BASE_URL is not a valid absolute URL", () => {
    process.env.AUTH_OIDC_ENABLED = "true";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    process.env.AUTH_OIDC_BASE_URL = "not-a-url";

    expect(() => getOidcSettings()).toThrow();
  });

  it("applies defaults and parses admin emails when fully configured", () => {
    process.env.AUTH_OIDC_ENABLED = "true";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    process.env.AUTH_OIDC_BASE_URL = "http://localhost:3000";
    process.env.AUTH_OIDC_ADMIN_EMAILS = "Admin@Example.com";
    delete process.env.AUTH_OIDC_SCOPE;
    delete process.env.AUTH_OIDC_USER_NAME_CLAIM;
    delete process.env.AUTH_OIDC_USER_NAME_CLAIM_REGEX;
    delete process.env.AUTH_OIDC_CLIENT_AUTHENTICATION_METHOD;
    delete process.env.AUTH_OIDC_EMAIL_VERIFIED_POLICY;

    expect(getOidcSettings()).toEqual({
      issuer: "https://idp.example.com",
      clientId: "client-id",
      clientSecret: "secret",
      redirectUri: "http://localhost:3000/api/auth/oidc/callback",
      scope: "openid profile email",
      userNameClaim: "email",
      userNameClaimRegex: "(.*)",
      clientAuthMethod: "client_secret_basic",
      adminEmails: new Set(["admin@example.com"]),
      emailVerifiedPolicy: "trust",
    });
  });

  it("only honors ignore/require for AUTH_OIDC_EMAIL_VERIFIED_POLICY, defaulting anything else to trust", () => {
    process.env.AUTH_OIDC_ENABLED = "true";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    process.env.AUTH_OIDC_BASE_URL = "http://localhost:3000";

    process.env.AUTH_OIDC_EMAIL_VERIFIED_POLICY = "require";
    expect(getOidcSettings()?.emailVerifiedPolicy).toBe("require");

    process.env.AUTH_OIDC_EMAIL_VERIFIED_POLICY = "ignore";
    expect(getOidcSettings()?.emailVerifiedPolicy).toBe("ignore");

    process.env.AUTH_OIDC_EMAIL_VERIFIED_POLICY = "bogus";
    expect(getOidcSettings()?.emailVerifiedPolicy).toBe("trust");
  });

  it("derives redirectUri from AUTH_OIDC_BASE_URL regardless of a trailing slash", () => {
    process.env.AUTH_OIDC_ENABLED = "true";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    process.env.AUTH_OIDC_BASE_URL = "https://app.example.com/";

    expect(getOidcSettings()?.redirectUri).toBe("https://app.example.com/api/auth/oidc/callback");
  });

  it("uses client_secret_post only when explicitly configured", () => {
    process.env.AUTH_OIDC_ENABLED = "true";
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "client-id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    process.env.AUTH_OIDC_BASE_URL = "http://localhost:3000";
    process.env.AUTH_OIDC_CLIENT_AUTHENTICATION_METHOD = "client_secret_post";

    expect(getOidcSettings()?.clientAuthMethod).toBe("client_secret_post");
  });
});
