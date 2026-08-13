import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("admin2010", 10);

  await prisma.user.updateMany({
    where: { email: { notIn: ["admin@infinity.net", "supervisor@infinity.net", "cobranzas@infinity.net"] } },
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

  await prisma.user.upsert({
    where: { email: "cobranzas@infinity.net" },
    update: { password: hash, name: "Agente Cobranzas", role: "COBRANZAS", active: true },
    create: {
      email: "cobranzas@infinity.net",
      password: hash,
      name: "Agente Cobranzas",
      role: "COBRANZAS",
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

  const defaultPlans = [
    { name: "200 MBPS", speedMbps: 200, monthlyUsd: 15, installUsd: 0, sortOrder: 1 },
    { name: "400 MBPS", speedMbps: 400, monthlyUsd: 17, installUsd: 0, sortOrder: 2 },
    { name: "550 MBPS", speedMbps: 550, monthlyUsd: 20, installUsd: 0, sortOrder: 3 },
    { name: "700 MBPS", speedMbps: 700, monthlyUsd: 25, installUsd: 0, sortOrder: 4 },
    { name: "1 GBPS", speedMbps: 1000, monthlyUsd: 30, installUsd: 0, sortOrder: 5 },
  ];

  for (const p of defaultPlans) {
    const existing = await prisma.servicePlan.findFirst({ where: { speedMbps: p.speedMbps } });
    if (!existing) {
      await prisma.servicePlan.create({ data: { ...p, active: true } });
    }
  }

  await prisma.tariffConfig.updateMany({
    data: {
      addendumDeclarationText:
        "El cliente solicita y acepta voluntariamente la modificación de su plan de servicio. " +
        "A partir de la aceptación y firma del presente adendum, se establece un nuevo período de permanencia " +
        "asociado al nuevo plan contratado, manteniéndose vigentes las demás condiciones del contrato original " +
        "que no hayan sido modificadas expresamente por este documento.",
      renewalDeclarationText:
        "El cliente declara que desea continuar utilizando el servicio y acepta las condiciones correspondientes " +
        "al nuevo período contractual de permanencia de 18 meses. Las demás condiciones del contrato original " +
        "que no sean modificadas expresamente deben mantenerse vigentes.",
      renewalMinMonthsCompleted: 18,
      earlyRenewalEnabled: true,
      earlyRenewalDaysBefore: 30,
      renewalAlertDays60: 60,
      renewalAlertDays30: 30,
      renewalAlertDays15: 15,
      whatsappSignatureMessage:
        "Hola [NOMBRE].\n\nInfinity Internet ha preparado el documento correspondiente a su cambio de plan.\n\n" +
        "Para revisar las condiciones, realizar la verificación de identidad y firmar el documento, ingrese al siguiente enlace:\n\n" +
        "[LINK]\n\nEste enlace es temporal y tiene una vigencia limitada.\n\nGracias por confiar en Infinity Internet.",
    },
  });

  console.log("Seed OK — admin@infinity.net, cobranzas@infinity.net, supervisor@infinity.net");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
