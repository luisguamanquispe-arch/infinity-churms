import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

const MANAGED_ROLES: UserRole[] = ["ADMIN", "COBRANZAS", "SUPERVISOR", "TECNICO"];

export function isManagedRole(role: string): role is UserRole {
  return MANAGED_ROLES.includes(role as UserRole);
}

export async function listManagedUsers() {
  return prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: PUBLIC_USER_SELECT,
  });
}

export async function createManagedUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}) {
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  if (!name) throw new Error("NAME_REQUIRED");
  if (!email || !email.includes("@")) throw new Error("EMAIL_INVALID");
  if (!data.password || data.password.length < 6) throw new Error("PASSWORD_WEAK");
  if (!isManagedRole(data.role)) throw new Error("ROLE_INVALID");

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("EMAIL_EXISTS");

  const password = await bcrypt.hash(data.password, 10);
  return prisma.user.create({
    data: { name, email, password, role: data.role, active: true },
    select: PUBLIC_USER_SELECT,
  });
}

export async function updateManagedUser(
  userId: string,
  data: {
    name?: string;
    email?: string;
    role?: UserRole;
    active?: boolean;
    password?: string;
  },
  actorUserId: string
) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("NOT_FOUND");

  if (userId === actorUserId && data.active === false) {
    throw new Error("SELF_DEACTIVATE");
  }
  if (userId === actorUserId && data.role && data.role !== existing.role) {
    throw new Error("SELF_ROLE");
  }

  const name = data.name?.trim();
  const email = data.email?.trim().toLowerCase();
  if (name !== undefined && !name) throw new Error("NAME_REQUIRED");
  if (email !== undefined && (!email || !email.includes("@"))) throw new Error("EMAIL_INVALID");
  if (data.role !== undefined && !isManagedRole(data.role)) throw new Error("ROLE_INVALID");
  if (data.password !== undefined && data.password.length > 0 && data.password.length < 6) {
    throw new Error("PASSWORD_WEAK");
  }

  if (email && email !== existing.email) {
    const duplicate = await prisma.user.findUnique({ where: { email } });
    if (duplicate) throw new Error("EMAIL_EXISTS");
  }

  const updateData: {
    name?: string;
    email?: string;
    role?: UserRole;
    active?: boolean;
    password?: string;
  } = {};

  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.active !== undefined) updateData.active = data.active;
  if (data.password) updateData.password = await bcrypt.hash(data.password, 10);

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: PUBLIC_USER_SELECT,
  });
}

export function userErrorMessage(code: string) {
  switch (code) {
    case "NAME_REQUIRED":
      return "Indique el nombre del usuario";
    case "EMAIL_INVALID":
      return "Indique un correo de usuario válido";
    case "EMAIL_EXISTS":
      return "Ese usuario (correo) ya está registrado";
    case "PASSWORD_WEAK":
      return "La clave debe tener al menos 6 caracteres";
    case "ROLE_INVALID":
      return "Rol no válido";
    case "SELF_DEACTIVATE":
      return "No puede desactivar su propio usuario";
    case "SELF_ROLE":
      return "No puede cambiar su propio rol";
    case "NOT_FOUND":
      return "Usuario no encontrado";
    default:
      return "Error al guardar usuario";
  }
}
