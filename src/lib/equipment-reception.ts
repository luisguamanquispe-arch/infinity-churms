export function isEquipmentReceptionComplete(
  brand?: string | null,
  model?: string | null,
  serial?: string | null
) {
  return Boolean(brand?.trim() && model?.trim() && serial?.trim());
}

export function deliveryStateForEquipment(
  brand?: string | null,
  model?: string | null,
  serial?: string | null
) {
  if (!isEquipmentReceptionComplete(brand, model, serial)) {
    return { delivered: false as const, condition: null };
  }
  return { delivered: true as const, condition: "BUENO" as const };
}
