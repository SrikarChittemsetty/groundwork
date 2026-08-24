/** @type {import('next').NextConfig} */

// `next build` and `next dev` share `.next` by default, and a build run while
// the dev server is up leaves it serving chunks that no longer exist — pages
// 500 with "Cannot find module './1682.js'", or render unstyled because the
// stylesheet 404s. It looks exactly like an application bug and isn't one; it
// cost three debugging detours before it was named.
//
// So the output directory is settable. `npm run verify` builds into a scratch
// directory to check the app compiles without touching a running dev server,
// while `npm run build` still writes `.next`, which is what deployment expects.
// Response headers.
//
// This app holds people's beliefs and has a delete-everything button, so being
// framed by another site is a real risk rather than a theoretical one: an
// attacker who can iframe /settings can try to trick someone into clicking
// through their own account deletion. frame-ancestors 'none' is the modern
// control and X-Frame-Options covers browsers that predate it.
//
// Deliberately NOT a full Content-Security-Policy. Next.js injects inline
// bootstrap scripts, so a script-src policy needs per-request nonces; adding
// one carelessly breaks the app in production while looking responsible in the
// config. frame-ancestors carries the clickjacking protection on its own and
// cannot break anything.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Stops a browser second-guessing a Content-Type, which is how a file that
  // is served as text ends up executed as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Share links are bearer tokens in the URL. Without this, following any
  // outbound link from a shared page would leak that token in the Referer
  // header to whoever was linked to.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs a camera, a microphone, or a location.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
