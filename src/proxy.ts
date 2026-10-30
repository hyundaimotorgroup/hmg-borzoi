import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Builds a per-request CSP using a fresh nonce for script-src, replacing the
// previous static 'unsafe-inline' script policy. Style-src keeps 'unsafe-inline'
// since Tailwind/inline `style=` attributes and chart libraries rely on it and
// nonces don't cover the style attribute (only <style> elements/<link>).
function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' blob:`, // 'unsafe-eval' required by the Monaco editor's runtime (JSON/tokenizer workers use Function-based eval internally)
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static resource caching (performance optimization)
  // Apply 1-year cache to all static resources (JS, CSS, fonts, images, etc.)
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.match(/\.(js|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico|map)$/)
  ) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const cspHeaderValue = buildCspHeader(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Also propagate the CSP onto the request headers (not just the response).
  // Next's App Router reads this on the request to auto-apply the nonce to
  // its own framework-injected scripts (hydration/bootstrap/RSC payload) —
  // without it, those scripts have no nonce and 'strict-dynamic' silently
  // blocks them.
  requestHeaders.set('Content-Security-Policy', cspHeaderValue);

  // Wraps a response so downstream Server Components see `x-nonce` (via headers())
  // and the browser receives the matching CSP for this request.
  const next = (init?: Parameters<typeof NextResponse.next>[0]) => {
    const response = NextResponse.next({ ...init, request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', cspHeaderValue);
    return response;
  };
  const withCsp = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', cspHeaderValue);
    return response;
  };

  // Check session cookie. The Edge runtime cannot query the database, so this
  // is only a presence check — actual session validity/role is verified
  // server-side via getSession() in Server Components and API route handlers.
  //
  // Because this is presence-only, it must never be used to redirect *away*
  // from /login: a cookie that's present but stale (revoked/expired in the
  // DB — idle timeout, single-session policy, etc.) would make this look
  // "authenticated" while getSession() correctly says otherwise, and if this
  // middleware then bounced that request from "/login" to "/", the page's own
  // getSession() would just bounce it straight back — an infinite redirect
  // loop between "/" and "/login" that never renders the login form. So the
  // only redirect this file performs is the safe direction (send genuinely
  // cookie-less requests to /login); sending an *authenticated* user away
  // from /login is left entirely to /login's own Server Component, which
  // checks the real, DB-verified session before deciding to redirect.
  const sessionToken = request.cookies.get('app_session')?.value;
  const isAuthenticated = !!sessionToken;

  // Authentication page path
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/api/auth/login');

  // Public API paths (accessible without authentication)
  const isPublicApi =
    pathname === '/api/auth/session' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/register' ||
    // Both legs of the OIDC handshake run before app_session exists: start
    // redirects the unauthenticated browser to the IdP, and callback is the
    // IdP redirecting back with a code to exchange for that same cookie.
    pathname === '/api/auth/oidc/start' ||
    pathname === '/api/auth/oidc/callback' ||
    pathname === '/api/health'; // Health check for Kubernetes probes

  // Unauthenticated user
  if (!isAuthenticated) {
    // API request
    if (pathname.startsWith('/api/')) {
      if (isPublicApi) {
        return next();
      }
      return withCsp(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    // Page request
    if (!isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return withCsp(NextResponse.redirect(url));
    }

    return next();
  }

  // Role-based page access control is enforced in each page's Server
  // Component via getSession() (DB-verified), not here — the `user` cookie
  // was forgeable and cannot be trusted at the Edge.
  return next();
}

export const config = {
  matcher: [
    /*
     * Apply to all paths except the following:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
