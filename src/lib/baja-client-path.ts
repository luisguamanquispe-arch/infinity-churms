export type BajaClientPath = "MIGRATED" | "FIBRA_ORIGINAL" | "RADIO_ONLY";

export const BAJA_CLIENT_PATH_OPTIONS: {
  value: BajaClientPath;
  label: string;
  description: string;
}[] = [
  {
    value: "MIGRATED",
    label: "Migrado de radioenlace a fibra",
    description:
      "El cliente inició en radio y fue migrado a fibra. Permanencia desde fecha de migración.",
  },
  {
    value: "FIBRA_ORIGINAL",
    label: "Cliente original de fibra",
    description: "Contrató fibra desde el inicio. Permanencia desde fecha de instalación de fibra.",
  },
  {
    value: "RADIO_ONLY",
    label: "Solo radioenlace (sin fibra)",
    description: "No tiene servicio de fibra. Permanencia desde fecha de alta del servicio.",
  },
];

export function inferBajaClientPath(customer: {
  originTechnology: string;
  currentTechnology: string;
}): BajaClientPath {
  if (
    customer.originTechnology === "RADIOENLACE" &&
    customer.currentTechnology === "FIBRA"
  ) {
    return "MIGRATED";
  }
  if (customer.originTechnology === "FIBRA" && customer.currentTechnology === "FIBRA") {
    return "FIBRA_ORIGINAL";
  }
  return "RADIO_ONLY";
}

export function needsMigrationForm(
  path: BajaClientPath,
  customer: {
    fiberMigrationDate: string | null;
    originTechnology: string;
    currentTechnology: string;
  }
): boolean {
  if (path !== "MIGRATED") return false;
  if (customer.fiberMigrationDate) return false;
  if (customer.originTechnology === "FIBRA" && customer.currentTechnology === "FIBRA") {
    return false;
  }
  return true;
}

export function pathLabel(path: BajaClientPath): string {
  return BAJA_CLIENT_PATH_OPTIONS.find((o) => o.value === path)?.label ?? path;
}
