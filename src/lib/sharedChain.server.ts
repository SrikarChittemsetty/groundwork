import "server-only";
import { safeDecrypt } from "@/lib/crypto";
import { normalizeNodes, type SharedNode } from "@/lib/sharedChain";

// Reading a shared argument out of the database.
//
// Separate from sharedChain.ts because this needs the encryption key and
// `node:crypto`, and the circle page that renders arguments is a client
// component. The `server-only` import turns "a client component imported this"
// from a confusing webpack error about node: URIs into a clear one.

export function parseChain(encrypted: string | null): SharedNode[] {
  if (!encrypted) return [];
  try {
    return normalizeNodes(JSON.parse(safeDecrypt(encrypted)));
  } catch {
    // Undecryptable or not JSON at all. An unreadable argument shows as no
    // argument rather than taking the page down.
    return [];
  }
}
