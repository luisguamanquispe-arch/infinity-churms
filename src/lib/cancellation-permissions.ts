import type { UserRole } from "@prisma/client";
import { hasPermission } from "./permissions";

export function getCancellationPermissions(role: UserRole) {
  return {
    charges: hasPermission(role, "cancellations:charges"),
    payment: hasPermission(role, "cancellations:payment"),
    equipment: hasPermission(role, "cancellations:equipment"),
    advanceEquipment: hasPermission(role, "cancellations:advance_equipment"),
    close: hasPermission(role, "cancellations:close"),
  };
}
