import type { UserRole } from "@prisma/client";

export type Permission =
  | "dashboard:view"
  | "cancellations:list"
  | "cancellations:create"
  | "cancellations:preliquidate"
  | "cancellations:preliquidate_edit"
  | "cancellations:preliquidate_send"
  | "cancellations:preliquidate_view"
  | "cancellations:liquidate"
  | "cancellations:acta_send"
  | "cancellations:cancel"
  | "cancellations:charges"
  | "cancellations:payment"
  | "cancellations:equipment"
  | "cancellations:advance_equipment"
  | "cancellations:close"
  | "cancellations:edit"
  | "cancellations:delete"
  | "customers:manage"
  | "customers:edit"
  | "plan-changes:list"
  | "plan-changes:create"
  | "plan-changes:manage"
  | "plan-changes:edit"
  | "plan-changes:delete"
  | "plan-changes:send-link"
  | "plan-changes:view-identity"
  | "reports:view"
  | "config:manage"
  | "users:manage";

const ALL: Permission[] = [
  "dashboard:view",
  "cancellations:list",
  "cancellations:create",
  "cancellations:preliquidate",
  "cancellations:preliquidate_edit",
  "cancellations:preliquidate_send",
  "cancellations:preliquidate_view",
  "cancellations:liquidate",
  "cancellations:acta_send",
  "cancellations:cancel",
  "cancellations:charges",
  "cancellations:payment",
  "cancellations:equipment",
  "cancellations:advance_equipment",
  "cancellations:close",
  "cancellations:edit",
  "cancellations:delete",
  "customers:manage",
  "customers:edit",
  "plan-changes:list",
  "plan-changes:create",
  "plan-changes:manage",
  "plan-changes:edit",
  "plan-changes:delete",
  "plan-changes:send-link",
  "plan-changes:view-identity",
  "reports:view",
  "config:manage",
  "users:manage",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL,
  SUPERVISOR: ALL.filter(
    (p) =>
      p !== "config:manage" &&
      p !== "reports:view" &&
      p !== "cancellations:edit" &&
      p !== "cancellations:delete" &&
      p !== "plan-changes:delete"
  ),
  COBRANZAS: [
    "dashboard:view",
    "cancellations:list",
    "cancellations:create",
    "cancellations:preliquidate",
    "cancellations:preliquidate_edit",
    "cancellations:preliquidate_send",
    "cancellations:preliquidate_view",
    "cancellations:liquidate",
    "cancellations:acta_send",
    "cancellations:charges",
    "cancellations:payment",
    "cancellations:equipment",
    "customers:manage",
    "plan-changes:list",
    "plan-changes:create",
    "plan-changes:send-link",
    "reports:view",
  ],
  TECNICO: [
    "dashboard:view",
    "cancellations:list",
    "cancellations:equipment",
    "cancellations:advance_equipment",
    "customers:edit",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canEditCustomer(role: UserRole): boolean {
  return hasPermission(role, "customers:edit") || hasPermission(role, "customers:manage");
}

export function canManageCustomerCollections(role: UserRole): boolean {
  return hasPermission(role, "customers:manage");
}

export function isAdminRole(role: UserRole): boolean {
  return role === "ADMIN";
}

export function canAccessRoute(role: UserRole, pathname: string, method?: string): boolean {
  if (
    method === "DELETE" &&
    /^\/api\/cancellations\/[^/]+$/.test(pathname)
  ) {
    return isAdminRole(role);
  }
  if (
    method === "DELETE" &&
    /^\/api\/plan-changes\/[^/]+$/.test(pathname)
  ) {
    return isAdminRole(role);
  }
  if (
    method === "DELETE" &&
    /^\/api\/customers\/[^/]+$/.test(pathname)
  ) {
    return isAdminRole(role);
  }
  if (pathname === "/" || pathname.startsWith("/api/dashboard")) {
    return hasPermission(role, "dashboard:view");
  }
  if (pathname === "/bajas" || pathname.startsWith("/bajas/")) {
    if (pathname === "/bajas/nueva") return hasPermission(role, "cancellations:create");
    return hasPermission(role, "cancellations:list");
  }
  if (pathname === "/cambio-plan" || pathname.startsWith("/cambio-plan/")) {
    if (pathname === "/cambio-plan/nuevo") return hasPermission(role, "plan-changes:create");
    return hasPermission(role, "plan-changes:list");
  }
  if (pathname.startsWith("/api/plan-changes") || pathname.startsWith("/api/service-plans")) {
    if (/\/identity/.test(pathname)) {
      return hasPermission(role, "plan-changes:view-identity");
    }
    if (/\/signature-link/.test(pathname)) {
      return hasPermission(role, "plan-changes:send-link") || hasPermission(role, "plan-changes:create");
    }
    if (pathname === "/api/plan-changes" && pathname.endsWith("/plan-changes")) {
      return hasPermission(role, "plan-changes:list");
    }
    if (pathname.includes("/nuevo") || pathname.endsWith("/plan-changes")) {
      // handled below
    }
    if (pathname.startsWith("/api/service-plans")) {
      return (
        hasPermission(role, "config:manage") ||
        hasPermission(role, "plan-changes:create") ||
        canEditCustomer(role)
      );
    }
    return hasPermission(role, "plan-changes:list") || hasPermission(role, "plan-changes:create");
  }
  if (pathname.startsWith("/api/customers") && /\/contract-history/.test(pathname)) {
    return hasPermission(role, "customers:manage") || hasPermission(role, "plan-changes:list");
  }
  if (pathname.startsWith("/api/customers") && /\/plan-context/.test(pathname)) {
    return hasPermission(role, "plan-changes:create");
  }
  if (pathname.startsWith("/api/reports/plan-changes")) {
    return hasPermission(role, "reports:view");
  }
  if (pathname.startsWith("/api/reports/renewals")) {
    return hasPermission(role, "reports:view");
  }
  if (pathname.startsWith("/api/contractual")) {
    return hasPermission(role, "plan-changes:list");
  }
  if (pathname.startsWith("/api/customers") && /\/(collections|charges|payments|aviso-prelegal|comunicado-al-dia|migrate-fiber)/.test(pathname)) {
    return hasPermission(role, "customers:manage");
  }
  if (pathname.startsWith("/api/users/collection-agents")) {
    return hasPermission(role, "customers:manage");
  }
  if (pathname === "/clientes" || pathname.startsWith("/clientes/") || pathname.startsWith("/api/customers")) {
    if (/\/api\/customers\/[^/]+\/permanence-preview/.test(pathname)) {
      return hasPermission(role, "cancellations:create");
    }
    return canEditCustomer(role);
  }
  if (pathname === "/reportes" || pathname.startsWith("/api/reports")) {
    return hasPermission(role, "reports:view");
  }
  if (pathname.startsWith("/api/config/tariffs/summary")) {
    return hasPermission(role, "cancellations:create");
  }
  if (pathname === "/configuracion" || pathname.startsWith("/api/config")) {
    return hasPermission(role, "config:manage");
  }
  if (pathname.startsWith("/api/users")) {
    return hasPermission(role, "users:manage");
  }
  return true;
}

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", permission: "dashboard:view" as Permission },
  { href: "/bajas", label: "Bajas", permission: "cancellations:list" as Permission },
  { href: "/clientes", label: "Clientes · Cobranza", permission: "customers:edit" as Permission },
  { href: "/cambio-plan", label: "Gestión Contractual", permission: "plan-changes:list" as Permission },
  { href: "/reportes", label: "Reportes", permission: "reports:view" as Permission },
  { href: "/configuracion", label: "Configuración", permission: "config:manage" as Permission },
];
