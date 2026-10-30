import * as client from "openid-client";
import { OidcSettings } from "./oidc-config";

let cachedConfiguration: Promise<client.Configuration> | null = null;
let cachedForKey: string | null = null;

function settingsKey(settings: OidcSettings): string {
  return [settings.issuer, settings.clientId, settings.clientSecret, settings.clientAuthMethod].join("|");
}

/**
 * Discovers (and caches, at module scope) the Authorization Server metadata.
 * Cached per Node process, not per request, so a healthy IdP is only queried
 * once. A failed discovery is never cached, so the next request retries.
 */
export function getOidcConfiguration(settings: OidcSettings): Promise<client.Configuration> {
  const key = settingsKey(settings);

  if (cachedConfiguration && cachedForKey === key) {
    return cachedConfiguration;
  }

  cachedForKey = key;
  cachedConfiguration = client
    .discovery(
      new URL(settings.issuer),
      settings.clientId,
      settings.clientSecret,
      settings.clientAuthMethod === "client_secret_post"
        ? client.ClientSecretPost()
        : client.ClientSecretBasic()
    )
    .catch((error: unknown) => {
      cachedConfiguration = null;
      cachedForKey = null;
      throw error;
    });

  return cachedConfiguration;
}

export interface OidcAuthRequestSecrets {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
}

export async function createAuthRequestSecrets(): Promise<OidcAuthRequestSecrets> {
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    state: client.randomState(),
    nonce: client.randomNonce(),
  };
}

export function buildAuthorizationUrl(
  configuration: client.Configuration,
  params: { redirectUri: string; scope: string; state: string; nonce: string; codeChallenge: string }
): URL {
  return client.buildAuthorizationUrl(configuration, {
    redirect_uri: params.redirectUri,
    scope: params.scope,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
}

/**
 * Builds the IdP's RP-Initiated Logout URL (openid-client's buildEndSessionUrl),
 * so a local app logout can also end the IdP-side SSO session — without this,
 * clicking "logout" only clears our own cookie and the next "SSO sign-in" click
 * would silently re-authenticate via the still-live IdP session. Returns null
 * when the IdP doesn't advertise end_session_endpoint (not all do).
 *
 * idTokenHint is optional (per spec, RECOMMENDED not REQUIRED), but some
 * providers require it for their end-session endpoint. It's the raw ID token JWT
 * from the session that was created at login (see oidc/callback route.ts and
 * session-store.ts), not derived here.
 */
export function buildEndSessionUrl(
  configuration: client.Configuration,
  params: { postLogoutRedirectUri: string; idTokenHint?: string | null }
): URL | null {
  if (!configuration.serverMetadata().end_session_endpoint) {
    return null;
  }
  return client.buildEndSessionUrl(configuration, {
    post_logout_redirect_uri: params.postLogoutRedirectUri,
    ...(params.idTokenHint ? { id_token_hint: params.idTokenHint } : {}),
  });
}

/**
 * Exchanges the authorization code for tokens. `redirectUri` is forced to the
 * exact configured value (rather than letting openid-client derive it from the
 * incoming request URL) so it byte-for-byte matches what was sent to the
 * authorization endpoint, regardless of proxy Host-header handling.
 */
export async function exchangeAuthorizationCode(
  configuration: client.Configuration,
  params: {
    redirectUri: string;
    incomingSearchParams: URLSearchParams;
    codeVerifier: string;
    state: string;
    nonce: string;
  }
) {
  const callbackUrl = new URL(params.redirectUri);
  callbackUrl.search = params.incomingSearchParams.toString();

  return client.authorizationCodeGrant(configuration, callbackUrl, {
    pkceCodeVerifier: params.codeVerifier,
    expectedState: params.state,
    expectedNonce: params.nonce,
  });
}
