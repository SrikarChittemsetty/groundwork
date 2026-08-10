import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { DEV_AUTOLOGIN } from "@/lib/dev";

// Route protection. Unauthenticated users hitting an app page are redirected to
// /login; authenticated users hitting /login or /signup are sent into the app.
// jose runs on the Edge runtime, so we verify the JWT here directly.

const COOKIE_NAME = "vm_session";
// Readable without an account — you should be able to see how your data would
// be handled BEFORE handing any over.
const PUBLIC_PATHS = ["/login", "/signup", "/privacy", "/shared"];
// Public pages that are pointless once signed in.
const AUTH_PATHS = ["/login", "/signup"];

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "");
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await isAuthed(req);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  // Pages that only make sense when signed OUT — an authenticated user landing
  // here gets sent into the app. /privacy is public but not in this set: it
  // stays readable whether or not you're signed in.
  const isAuthOnly = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic && !isAuthOnly) return NextResponse.next();

  // Escape hatch: ?real=1 opts out of dev auto-login for one request, so the
  // actual sign-in screen can still be seen and tested while DEV_AUTOLOGIN is on.
  const wantsRealAuth = req.nextUrl.searchParams.get("real") === "1";

  // Dev-only: skip the login screen entirely and auto-login on localhost.
  // The dev-login route is under /api (excluded from this matcher), so there's
  // no redirect loop.
  if (!authed && DEV_AUTOLOGIN && !wantsRealAuth) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/auth/dev-login";
    return NextResponse.redirect(url);
  }

  if (!authed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (authed && isAuthOnly) {
    const url = req.nextUrl.clone();
    url.pathname = "/values";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on page routes only. All /api routes enforce auth themselves via
// getUserId() and return JSON 401s, so excluding them here avoids redirecting
// fetch() calls to an HTML login page.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
