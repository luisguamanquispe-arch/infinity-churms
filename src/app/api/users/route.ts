import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  createManagedUser,
  listManagedUsers,
  userErrorMessage,
} from "@/lib/services/users";

export async function GET() {
  try {
    await requirePermission("users:manage");
    const users = await listManagedUsers();
    return NextResponse.json(users);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("users:manage");
    const body = await request.json();

    const user = await createManagedUser({
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      role: (body.role ?? "COBRANZAS") as UserRole,
    });

    await audit({
      userId: session.userId,
      action: "USER_CREATE",
      entity: "User",
      entityId: user.id,
      detail: `${user.name} · ${user.email} · ${user.role}`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && userErrorMessage(e.message) !== "Error al guardar usuario") {
      return NextResponse.json({ error: userErrorMessage(e.message) }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
