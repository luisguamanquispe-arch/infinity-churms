-- AUD-027 — Índice UNIQUE parcial en CustomerEquipment.serial
-- NO EJECUTAR en producción hasta resolver duplicados históricos.
--
-- Pre-requisitos:
--   1. npx tsx scripts/audit-equipment-serial-duplicates.ts
--   2. Resolver conflictos reportados (manual, sin borrado automático)
--   3. Opcional: normalizar mayúsculas en serial existente
--
-- Rollback:
--   DROP INDEX IF EXISTS "CustomerEquipment_serial_unique";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CustomerEquipment"
    WHERE "serial" IS NOT NULL AND TRIM("serial") <> ''
    GROUP BY UPPER(TRIM("serial"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'AUD-027: existen seriales duplicados — ejecute audit-equipment-serial-duplicates.ts';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerEquipment_serial_unique"
  ON "CustomerEquipment" ("serial")
  WHERE "serial" IS NOT NULL AND TRIM("serial") <> '';
