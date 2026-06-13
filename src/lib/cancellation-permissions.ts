import type { UserRole } from "@prisma/client";
import { hasPermission } from "./permissions";

export function getCancellationPermissions(role: UserRole) {
  const equipment = hasPermission(role, "cancellations:equipment");
  const charges = hasPermission(role, "cancellations:charges");
  const create = hasPermission(role, "cancellations:create");
  return {
    charges,
    payment: hasPermission(role, "cancellations:payment"),
    equipment,
    advanceEquipment: hasPermission(role, "cancellations:advance_equipment"),
    close: hasPermission(role, "cancellations:close"),
    manageEquipment: equipment || charges || create,
  };
}
