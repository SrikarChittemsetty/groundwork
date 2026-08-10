// `server-only` ships a module that throws on import unless the bundler
// resolves it under React's "react-server" condition. Vitest doesn't, so
// importing a server module under test would fail on the guard rather than on
// anything real. The guard's job is to fail the *build* when a client
// component imports server code; in tests it has nothing to protect.
export {};
