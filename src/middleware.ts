import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { canAccessRoute } from "@/lib/permissions";

const PUBLIC = ["/login", "/api/auth/login", "/bajas", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (!canAccessRoute(session.role, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|.*\\.svg$).*)"],
};
