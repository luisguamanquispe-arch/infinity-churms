import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("admin2010", 10);

  await prisma.user.deleteMany({
    where: { email: { notIn: ["admin@infinity.net", "supervisor@infinity.net"] } },
  });

  await prisma.user.upsert({
    where: { email: "admin@infinity.net" },
    update: { password: hash, name: "Administrador", role: "ADMIN", active: true },
    create: {
      email: "admin@infinity.net",
      password: hash,
      name: "Administrador",
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "supervisor@infinity.net" },
    update: { password: hash, name: "Supervisor", role: "SUPERVISOR", active: true },
    create: {
      email: "supervisor@infinity.net",
      password: hash,
      name: "Supervisor",
      role: "SUPERVISOR",
    },
  });

  await prisma.tariffConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      permanenceMonths: 18,
      installCostUsd: 200,
      tvMonthlyUsd: 2,
    },
  });

  const tariffs = [
    { type: "ONU" as const, damagedUsd: 35, notReturnedUsd: 50 },
    { type: "ROUTER" as const, damagedUsd: 20, notReturnedUsd: 30 },
    { type: "STB" as const, damagedUsd: 25, notReturnedUsd: 40 },
    { type: "ANTENA" as const, damagedUsd: 15, notReturnedUsd: 25 },
    { type: "OTRO" as const, damagedUsd: 10, notReturnedUsd: 20 },
  ];

  for (const t of tariffs) {
    await prisma.equipmentTariff.upsert({
      where: { type: t.type },
      update: { damagedUsd: t.damagedUsd, notReturnedUsd: t.notReturnedUsd },
      create: t,
    });
  }

  const customer = await prisma.customer.upsert({
    where: { contract: "CTR-1001" },
    update: {
      name: "Juan Pérez García",
      planName: "Fibra 100 Mbps",
      hasTvStreaming: true,
      pendingBalance: 60,
    },
    create: {
      contract: "CTR-1001",
      name: "Juan Pérez García",
      cedula: "V-12345678",
      address: "Av. Principal #45, Sector Norte",
      phone: "0414-5551234",
      serviceStartDate: new Date(Date.now() - 8 * 30 * 24 * 60 * 60 * 1000),
      planName: "Fibra 100 Mbps",
      hasTvStreaming: true,
      tvStreamingSince: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
      pendingBalance: 60,
    },
  });

  const equip = [
    { type: "ONU" as const, serial: "HWTC12345678", brand: "Huawei", model: "HG8546M" },
    { type: "ROUTER" as const, serial: "TPL98765432", brand: "TP-Link", model: "Archer C6" },
    { type: "STB" as const, serial: "STB44556677", brand: "Infomir", model: "MAG322" },
  ];

  for (const e of equip) {
    const exists = await prisma.customerEquipment.findFirst({
      where: { customerId: customer.id, serial: e.serial },
    });
    if (!exists) {
      await prisma.customerEquipment.create({
        data: { customerId: customer.id, ...e },
      });
    }
  }

  console.log("Seed OK — usuarios: admin@infinity.net, supervisor@infinity.net");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
