import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken, AUTH_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.active) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await audit({ userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });

    const res = NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
