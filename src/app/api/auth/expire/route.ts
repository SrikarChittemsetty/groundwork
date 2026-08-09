import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// Clears a session whose user no longer exists (e.g. the account was deleted
// from another tab) and sends the browser back to login. A GET handler so a
// server component can redirect here; cookies can't be written during render.
export async function GET(req: Request) {
  destroySession();
  return NextResponse.redirect(new URL("/login", req.url));
}
