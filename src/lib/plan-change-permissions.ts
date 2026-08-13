import type { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";

export function getPlanChangePermissions(role: UserRole) {
  const isAdmin = role === "ADMIN";
  const isSupervisor = role === "SUPERVISOR";
  const canManage = hasPermission(role, "plan-changes:manage");
  const canCreate = hasPermission(role, "plan-changes:create");
  const canApproveDiscount = isAdmin || isSupervisor;
  const canVoid = isAdmin || isSupervisor;
  const canCancel = canManage || canCreate;

  return {
    canList: hasPermission(role, "plan-changes:list"),
    canCreate,
    canConfirm: canCreate,
    canSign: canCreate,
    canSendLink: hasPermission(role, "plan-changes:send-link") || canCreate,
    canViewIdentity: hasPermission(role, "plan-changes:view-identity") || isAdmin || isSupervisor,
    canCancel,
    canVoid,
    canApproveDiscount,
    canViewReports: hasPermission(role, "reports:view"),
  };
}
