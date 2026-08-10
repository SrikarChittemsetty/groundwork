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
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
