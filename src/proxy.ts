import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const authRoutes = new Set(["/login", "/register"]);

export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;

  if (!hasSessionCookie && !authRoutes.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSessionCookie && authRoutes.has(pathname)) {
    return NextResponse.redirect(new URL("/closet", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/closet/:path*",
    "/today/:path*",
    "/looks/:path*",
    "/styles/:path*",
    "/you/:path*",
    "/login",
    "/register",
  ],
};
