// The sessionStorage key used to carry a login-page message across a
// round trip through the IdP's RP-Initiated Logout (see AuthContext.tsx's
// logout() and LoginForm.tsx). post_logout_redirect_uri must be the exact,
// pre-registered value with no query string — some providers fall back to
// their own portal page for any unregistered variant, including one that only differs
// by query string — so a message like "idle_timeout" can't ride along on
// that URL and has to be stashed client-side instead.
export const POST_LOGOUT_MESSAGE_KEY = "borzoiPostLogoutMessage";

export function loginErrorMessage(code: string): string {
  switch (code) {
    case "sso_disabled":
      return "SSO 로그인이 비활성화되어 있습니다.";
    case "oidc_denied":
      return "SSO 로그인이 취소되었습니다.";
    case "oidc_session_expired":
      return "로그인 세션이 만료되었습니다. 다시 시도해 주세요.";
    case "oidc_state_mismatch":
      return "로그인 요청 검증에 실패했습니다. 다시 시도해 주세요.";
    case "oidc_claim_missing":
    case "oidc_invalid_identifier":
      return "SSO 계정 정보에서 이메일을 확인할 수 없습니다. 관리자에게 문의하세요.";
    case "oidc_email_unverified":
      return "SSO 계정의 이메일이 인증되지 않았습니다. IdP에서 이메일 인증 후 다시 시도해 주세요.";
    case "idle_timeout":
      return "일정 시간 활동이 없어 자동으로 로그아웃되었습니다. 다시 로그인해 주세요.";
    case "session_revoked":
      return "다른 기기 또는 브라우저에서 로그인되어 현재 세션이 종료되었습니다. 다시 로그인해 주세요.";
    case "oidc_config_error":
    case "oidc_exchange_failed":
    case "oidc_internal_error":
    default:
      return "SSO 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
