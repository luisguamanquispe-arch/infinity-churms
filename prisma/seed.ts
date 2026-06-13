import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("admin2010", 10);

  await prisma.user.updateMany({
    where: { email: { notIn: ["admin@infinity.net", "supervisor@infinity.net"] } },
    data: { active: false },
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

  console.log("Seed OK — usuarios: admin@infinity.net, supervisor@infinity.net");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
