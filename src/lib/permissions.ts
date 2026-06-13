import type { UserRole } from "@prisma/client";

export type Permission =
  | "dashboard:view"
  | "cancellations:list"
  | "cancellations:create"
  | "cancellations:charges"
  | "cancellations:payment"
  | "cancellations:equipment"
  | "cancellations:advance_equipment"
  | "cancellations:close"
  | "customers:manage"
  | "reports:view"
  | "config:manage";

const ALL: Permission[] = [
  "dashboard:view",
  "cancellations:list",
  "cancellations:create",
  "cancellations:charges",
  "cancellations:payment",
  "cancellations:equipment",
  "cancellations:advance_equipment",
  "cancellations:close",
  "customers:manage",
  "reports:view",
  "config:manage",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL,
  SUPERVISOR: ALL.filter((p) => p !== "config:manage"),
  COBRANZAS: [
    "dashboard:view",
    "cancellations:list",
    "cancellations:create",
    "cancellations:charges",
    "cancellations:payment",
    "cancellations:equipment",
    "customers:manage",
    "reports:view",
  ],
  TECNICO: [
    "dashboard:view",
    "cancellations:list",
    "cancellations:equipment",
    "cancellations:advance_equipment",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/api/dashboard")) {
    return hasPermission(role, "dashboard:view");
  }
  if (pathname === "/bajas" || pathname.startsWith("/bajas/")) {
    if (pathname === "/bajas/nueva") return hasPermission(role, "cancellations:create");
    return hasPermission(role, "cancellations:list");
  }
  if (pathname === "/clientes" || pathname.startsWith("/api/customers")) {
    return hasPermission(role, "customers:manage");
  }
  if (pathname === "/reportes" || pathname.startsWith("/api/reports")) {
    return hasPermission(role, "reports:view");
  }
  if (pathname === "/configuracion" || pathname.startsWith("/api/config")) {
    return hasPermission(role, "config:manage");
  }
  return true;
}

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", permission: "dashboard:view" as Permission },
  { href: "/bajas", label: "Bajas", permission: "cancellations:list" as Permission },
  { href: "/clientes", label: "Clientes", permission: "customers:manage" as Permission },
  { href: "/reportes", label: "Reportes", permission: "reports:view" as Permission },
  { href: "/configuracion", label: "Configuración", permission: "config:manage" as Permission },
];
