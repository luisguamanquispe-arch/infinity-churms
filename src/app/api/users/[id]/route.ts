import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { updateManagedUser, userErrorMessage } from "@/lib/services/users";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("users:manage");
    const { id } = await params;
    const body = await request.json();

    const user = await updateManagedUser(
      id,
      {
        name: body.name !== undefined ? String(body.name) : undefined,
        email: body.email !== undefined ? String(body.email) : undefined,
        role: body.role as UserRole | undefined,
        active: body.active !== undefined ? Boolean(body.active) : undefined,
        password: body.password ? String(body.password) : undefined,
      },
      session.userId
    );

    await audit({
      userId: session.userId,
      action: "USER_UPDATE",
      entity: "User",
      entityId: user.id,
      detail: `${user.name} · activo=${user.active}`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && userErrorMessage(e.message) !== "Error al guardar usuario") {
      return NextResponse.json({ error: userErrorMessage(e.message) }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 });
  }
}
