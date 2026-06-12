import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { hasPermission, type Permission } from "./permissions";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me"
);

export const AUTH_COOKIE = "infinity-auth";

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function createToken(payload: Session): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  if (!hasPermission(session.role, permission)) throw new Error("FORBIDDEN");
  return session;
}
