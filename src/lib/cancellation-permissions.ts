import type { UserRole } from "@prisma/client";
import { hasPermission, isAdminRole } from "./permissions";

export function getCancellationPermissions(role: UserRole) {
  const equipment = hasPermission(role, "cancellations:equipment");
  const charges = hasPermission(role, "cancellations:charges");
  const create = hasPermission(role, "cancellations:create");
  const adminOnly = isAdminRole(role);
  return {
    charges,
    payment: hasPermission(role, "cancellations:payment"),
    equipment,
    advanceEquipment: hasPermission(role, "cancellations:advance_equipment"),
    close: hasPermission(role, "cancellations:close"),
    manageEquipment: equipment || charges || create,
    edit: adminOnly,
    delete: adminOnly,
    preliquidate: hasPermission(role, "cancellations:preliquidate"),
    preliquidateEdit: hasPermission(role, "cancellations:preliquidate_edit"),
    preliquidateSend: hasPermission(role, "cancellations:preliquidate_send"),
    preliquidateView: hasPermission(role, "cancellations:preliquidate_view"),
    liquidate: hasPermission(role, "cancellations:liquidate"),
    actaSend: hasPermission(role, "cancellations:acta_send"),
    canViewPreliquidacion: hasPermission(role, "cancellations:list"),
  };
}
