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
    fiberMigrationDate?: Date | string | null;
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

export type BajaClientPathCustomer = {
  originTechnology: string;
  currentTechnology: string;
  fiberMigrationDate?: Date | string | null;
};

/** Valida que el tipo seleccionado coincida con los datos del cliente en BD. */
export function validateClientPath(
  path: BajaClientPath,
  customer: BajaClientPathCustomer
): { ok: boolean; message: string | null } {
  if (path === "FIBRA_ORIGINAL") {
    if (customer.currentTechnology === "RADIOENLACE") {
      return {
        ok: false,
        message:
          "Este cliente es solo radioenlace. Seleccione «Solo radioenlace (sin fibra)» o registre migración a fibra.",
      };
    }
    if (
      customer.originTechnology === "RADIOENLACE" &&
      customer.currentTechnology === "FIBRA"
    ) {
      return {
        ok: false,
        message:
          "Este cliente migró de radio a fibra. Seleccione «Migrado de radioenlace a fibra».",
      };
    }
    return { ok: true, message: null };
  }

  if (path === "RADIO_ONLY") {
    if (customer.currentTechnology === "FIBRA") {
      return {
        ok: false,
        message:
          "Este cliente tiene servicio de fibra. No puede usar el flujo solo radioenlace.",
      };
    }
    return { ok: true, message: null };
  }

  if (path === "MIGRATED") {
    if (
      customer.originTechnology === "FIBRA" &&
      customer.currentTechnology === "FIBRA"
    ) {
      return {
        ok: false,
        message:
          "Este cliente es fibra original. Seleccione «Cliente original de fibra».",
      };
    }
    return { ok: true, message: null };
  }

  return { ok: true, message: null };
}

export function isClientPathCompatible(
  path: BajaClientPath,
  customer: BajaClientPathCustomer
): boolean {
  return validateClientPath(path, customer).ok;
}
