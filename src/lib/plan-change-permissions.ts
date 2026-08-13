import type { UserRole } from "@prisma/client";
import { hasPermission, isAdminRole } from "./permissions";

export function getPlanChangePermissions(role: UserRole) {
  const isAdmin = isAdminRole(role);
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
    canEdit: hasPermission(role, "plan-changes:edit"),
    canDelete: hasPermission(role, "plan-changes:delete"),
  };
}
