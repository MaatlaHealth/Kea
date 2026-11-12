import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard.
 *
 * This only checks that a session cookie is present, so an unauthenticated
 * visitor is redirected to sign in rather than shown an error page. It is a
 * convenience, not a security control: every page and action resolves the
 * session against the database and checks permissions on the server.
 */

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "kea_session";
const PATIENT_COOKIE = "kea_patient_session";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/app")) {
    if (!request.cookies.has(SESSION_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/portal") && pathname !== "/portal/sign-in") {
    if (!request.cookies.has(PATIENT_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/sign-in";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/portal/:path*"],
};
