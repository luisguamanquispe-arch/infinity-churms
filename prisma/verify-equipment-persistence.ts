import { PrismaClient } from "@prisma/client";
import {
  addCancellationEquipment,
  updateEquipmentItem,
} from "../src/lib/services/cancellations";

const prisma = new PrismaClient();

async function assert(label: string, ok: boolean) {
  if (!ok) throw new Error(`FALLO: ${label}`);
  console.log(`OK: ${label}`);
}

async function main() {
  const cancellation = await prisma.cancellation.findFirst({
    where: { status: { notIn: ["EQUIPOS_RECUPERADOS", "BAJA_COMPLETADA"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  if (!cancellation) {
    console.log("Sin bajas abiertas para probar. Cree una baja y vuelva a ejecutar.");
    return;
  }

  console.log(`Probando persistencia en baja ${cancellation.id} (${cancellation.status})`);

  const created = await addCancellationEquipment(cancellation.id, {
    type: "ONU",
    brand: "TEST-MARCA",
    model: "TEST-MODELO",
    serial: `TEST-SERIE-${Date.now()}`,
  });

  const afterCreate = await prisma.cancellationEquipment.findUnique({
    where: { id: created.id },
    include: { equipment: true },
  });

  await assert("CancellationEquipment.brand guardado", afterCreate?.brand === "TEST-MARCA");
  await assert("CancellationEquipment.model guardado", afterCreate?.model === "TEST-MODELO");
  await assert("CancellationEquipment.serial guardado", Boolean(afterCreate?.serial?.startsWith("TEST-SERIE-")));
  await assert("CancellationEquipment.delivered = true", afterCreate?.delivered === true);
  await assert("CancellationEquipment.condition = BUENO", afterCreate?.condition === "BUENO");
  await assert("CustomerEquipment sincronizado", afterCreate?.equipment?.brand === "TEST-MARCA");

  await updateEquipmentItem(created.id, { brand: "TEST-MARCA-2" });

  const afterUpdate = await prisma.cancellationEquipment.findUnique({
    where: { id: created.id },
    include: { equipment: true },
  });

  await assert("Actualización de marca en CancellationEquipment", afterUpdate?.brand === "TEST-MARCA-2");
  await assert("Actualización de marca en CustomerEquipment", afterUpdate?.equipment?.brand === "TEST-MARCA-2");
  await assert("Sigue entregado tras actualizar marca", afterUpdate?.delivered === true);

  await prisma.cancellationEquipment.delete({ where: { id: created.id } });
  if (afterCreate?.equipmentId) {
    await prisma.customerEquipment.delete({ where: { id: afterCreate.equipmentId } });
  }

  console.log("Limpieza de registro de prueba completada.");
  console.log("Verificación de persistencia en BD: EXITOSA");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
