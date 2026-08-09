// Dev-only convenience: auto-login on localhost so you don't have to sign in
// every time while building/looking at functionality.
//
// HARD-GATED to non-production AND an explicit opt-in env flag. In production
// this is always false, so none of the bypass code paths can run.

export const DEV_USER_EMAIL = "dev@local";

export const DEV_AUTOLOGIN =
  process.env.NODE_ENV !== "production" &&
  process.env.DEV_AUTOLOGIN === "true";
