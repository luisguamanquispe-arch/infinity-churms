import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { clearBusinessData } from "./clear-business-data";
import { databaseHostLabel, getDatabaseUrl } from "../src/lib/database-url";

const databaseUrl = getDatabaseUrl();

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

async function waitForDatabase(maxAttempts = 24, delayMs = 5000) {
  const host = databaseHostLabel(databaseUrl);
  console.log(`Using PostgreSQL at ${host}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (attempt > 1) {
        console.log("Database connection established.");
      }
      return;
    } catch (error) {
      const summary = error instanceof Error ? error.message.split("\n")[0] : String(error);
      if (attempt >= maxAttempts) {
        console.error(
          [
            `Could not connect to PostgreSQL at ${host} after ${maxAttempts} attempts.`,
            "Render checklist:",
            "  1. Open the PostgreSQL service and confirm status is Available (resume if Suspended).",
            "  2. Web service → Environment → DATABASE_URL must be linked to that database.",
            "  3. Web and database should be in the same region.",
            "  4. If internal hostname (*-a) keeps failing, replace DATABASE_URL with the External Database URL from the DB Connections tab.",
          ].join("\n")
        );
        throw error;
      }
      console.warn(`Database not reachable (${attempt}/${maxAttempts}): ${summary}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function run(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

async function main() {
  await waitForDatabase();
  console.log("Running pre-deploy SQL migrations...");

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'code'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'contract'
      ) THEN
        ALTER TABLE "Customer" RENAME COLUMN "code" TO "contract";
        RAISE NOTICE 'Renamed Customer.code -> contract';
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CancellationReason') THEN
        CREATE TYPE "CancellationReason" AS ENUM (
          'FALLAS_CONTINUAS',
          'INCUMPLIMIENTO_CONTRATO',
          'MUDANZA',
          'PROBLEMAS_ATENCION',
          'MEJOR_OFERTA',
          'DECISION_VOLUNTARIA'
        );
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Cancellation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'reason'
      ) THEN
        ALTER TABLE "Cancellation"
        ADD COLUMN "reason" "CancellationReason" NOT NULL DEFAULT 'DECISION_VOLUNTARIA';
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Cancellation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'clientSignature'
      ) THEN
        ALTER TABLE "Cancellation" ADD COLUMN "clientSignature" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'CustomerEquipment'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CustomerEquipment' AND column_name = 'model'
      ) THEN
        ALTER TABLE "CustomerEquipment" ADD COLUMN "model" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'CancellationEquipment'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CancellationEquipment' AND column_name = 'brand'
      ) THEN
        ALTER TABLE "CancellationEquipment" ADD COLUMN "brand" TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'CancellationEquipment'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CancellationEquipment' AND column_name = 'model'
      ) THEN
        ALTER TABLE "CancellationEquipment" ADD COLUMN "model" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'zone'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "zone" TEXT NOT NULL DEFAULT 'CENTRO';
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Cancellation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'actaPhysicalCode'
      ) THEN
        ALTER TABLE "Cancellation" ADD COLUMN "actaPhysicalCode" TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS "Cancellation_actaPhysicalCode_key"
          ON "Cancellation"("actaPhysicalCode");
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'openTechnicalClaim'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "openTechnicalClaim" BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'AuditLog'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'ipAddress'
      ) THEN
        ALTER TABLE "AuditLog" ADD COLUMN "ipAddress" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CollectionManagementType') THEN
        CREATE TYPE "CollectionManagementType" AS ENUM (
          'LLAMADA', 'WHATSAPP', 'VISITA', 'CORREO', 'SMS', 'OTRO'
        );
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CollectionResult') THEN
        CREATE TYPE "CollectionResult" AS ENUM (
          'CONTESTO', 'NO_CONTESTO', 'PROMESA_DE_PAGO', 'PAGO', 'CONVENIO',
          'SE_NIEGA_A_PAGAR', 'CLIENTE_NO_UBICADO'
        );
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CollectionAction" (
      "id" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "actionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "managementType" "CollectionManagementType" NOT NULL,
      "result" "CollectionResult" NOT NULL,
      "notes" TEXT,
      "nextFollowUpDate" TIMESTAMP(3),
      "promiseDate" TIMESTAMP(3),
      "promiseAmount" DECIMAL(10,2),
      "promiseNotes" TEXT,
      "attachmentName" TEXT,
      "attachmentData" TEXT,
      "photoName" TEXT,
      "photoData" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CollectionAction_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionAction_customerId_fkey'
      ) THEN
        ALTER TABLE "CollectionAction"
          ADD CONSTRAINT "CollectionAction_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionAction_userId_fkey'
      ) THEN
        ALTER TABLE "CollectionAction"
          ADD CONSTRAINT "CollectionAction_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  if (process.env.CLEAR_BUSINESS_DATA === "1") {
    console.log("CLEAR_BUSINESS_DATA=1 — eliminando datos de prueba...");
    const deleted = await clearBusinessData(prisma);
    console.log("Datos eliminados:", deleted);
  }

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'overdueSince'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "overdueSince" TIMESTAMP(3);
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'inCollectionWhitelist'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "inCollectionWhitelist" BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CollectionPayment" (
      "id" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "paymentDate" TIMESTAMP(3) NOT NULL,
      "amount" DECIMAL(10,2) NOT NULL,
      "fenixDocument" TEXT NOT NULL,
      "paymentMethod" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CollectionPayment_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionPayment_customerId_fkey'
      ) THEN
        ALTER TABLE "CollectionPayment"
          ADD CONSTRAINT "CollectionPayment_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionPayment_userId_fkey'
      ) THEN
        ALTER TABLE "CollectionPayment"
          ADD CONSTRAINT "CollectionPayment_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CollectionChargeType') THEN
        CREATE TYPE "CollectionChargeType" AS ENUM (
          'CONSUMO_MENSUAL',
          'CAMBIO_DOMICILIO',
          'EXCEDENTE_FIBRA',
          'INSTALACION',
          'STREAMS',
          'RECONEXION',
          'OTRO'
        );
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CollectionCharge" (
      "id" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "chargeType" "CollectionChargeType" NOT NULL,
      "description" TEXT,
      "periodLabel" TEXT,
      "periodFrom" TIMESTAMP(3),
      "periodTo" TIMESTAMP(3),
      "amount" DECIMAL(10,2) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CollectionCharge_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionCharge_customerId_fkey'
      ) THEN
        ALTER TABLE "CollectionCharge"
          ADD CONSTRAINT "CollectionCharge_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionCharge_userId_fkey'
      ) THEN
        ALTER TABLE "CollectionCharge"
          ADD CONSTRAINT "CollectionCharge_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'assignedAgentUserId'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "assignedAgentUserId" TEXT;
        ALTER TABLE "Customer" ADD COLUMN "assignedAgentName" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'CollectionAction'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CollectionAction' AND column_name = 'agentUserId'
      ) THEN
        ALTER TABLE "CollectionAction" ADD COLUMN "agentUserId" TEXT;
        ALTER TABLE "CollectionAction" ADD COLUMN "agentName" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    UPDATE "CollectionAction" ca
    SET "agentUserId" = ca."userId",
        "agentName" = u."name"
    FROM "User" u
    WHERE ca."agentUserId" IS NULL AND u.id = ca."userId";
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CollectionAction' AND column_name = 'agentUserId'
      ) THEN
        ALTER TABLE "CollectionAction" ALTER COLUMN "agentUserId" SET NOT NULL;
        ALTER TABLE "CollectionAction" ALTER COLUMN "agentName" SET NOT NULL;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CollectionAction_agentUserId_fkey'
      ) THEN
        ALTER TABLE "CollectionAction"
          ADD CONSTRAINT "CollectionAction_agentUserId_fkey"
          FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Customer_assignedAgentUserId_fkey'
      ) THEN
        ALTER TABLE "Customer"
          ADD CONSTRAINT "Customer_assignedAgentUserId_fkey"
          FOREIGN KEY ("assignedAgentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    UPDATE "Customer" c
    SET "assignedAgentUserId" = latest."agentUserId",
        "assignedAgentName" = latest."agentName"
    FROM (
      SELECT DISTINCT ON ("customerId") "customerId", "agentUserId", "agentName"
      FROM "CollectionAction"
      ORDER BY "customerId", "actionDate" DESC, "createdAt" DESC
    ) latest
    WHERE c.id = latest."customerId"
      AND (c."assignedAgentUserId" IS NULL OR c."assignedAgentName" IS NULL);
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceTechnology') THEN
        CREATE TYPE "ServiceTechnology" AS ENUM ('FIBRA', 'RADIOENLACE');
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'originTechnology'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "originTechnology" "ServiceTechnology" NOT NULL DEFAULT 'FIBRA';
        ALTER TABLE "Customer" ADD COLUMN "currentTechnology" "ServiceTechnology" NOT NULL DEFAULT 'FIBRA';
        ALTER TABLE "Customer" ADD COLUMN "fiberInstallDate" TIMESTAMP(3);
        ALTER TABLE "Customer" ADD COLUMN "fiberMigrationDate" TIMESTAMP(3);
        ALTER TABLE "Customer" ADD COLUMN "migrationReviewRequired" BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  await run(`
    UPDATE "Customer"
    SET "fiberInstallDate" = "serviceStartDate"
    WHERE "fiberInstallDate" IS NULL
      AND "originTechnology" = 'FIBRA'
      AND "currentTechnology" = 'FIBRA';
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Cancellation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'permanenceStartDate'
      ) THEN
        ALTER TABLE "Cancellation" ADD COLUMN "permanenceStartDate" TIMESTAMP(3);
        ALTER TABLE "Cancellation" ADD COLUMN "originTechnology" "ServiceTechnology";
        ALTER TABLE "Cancellation" ADD COLUMN "currentTechnology" "ServiceTechnology";
        ALTER TABLE "Cancellation" ADD COLUMN "fiberInstallPending" BOOLEAN;
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CustomerTechnologyEvent" (
      "id" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "fromTechnology" "ServiceTechnology" NOT NULL,
      "toTechnology" "ServiceTechnology" NOT NULL,
      "eventDate" TIMESTAMP(3) NOT NULL,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomerTechnologyEvent_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerTechnologyEvent_customerId_fkey'
      ) THEN
        ALTER TABLE "CustomerTechnologyEvent"
          ADD CONSTRAINT "CustomerTechnologyEvent_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerTechnologyEvent_userId_fkey'
      ) THEN
        ALTER TABLE "CustomerTechnologyEvent"
          ADD CONSTRAINT "CustomerTechnologyEvent_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Cancellation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'withdrawalRequestFileName'
      ) THEN
        ALTER TABLE "Cancellation" ADD COLUMN "withdrawalRequestFileName" TEXT;
        ALTER TABLE "Cancellation" ADD COLUMN "withdrawalRequestFileData" TEXT;
        ALTER TABLE "Cancellation" ADD COLUMN "withdrawalRequestUploadedAt" TIMESTAMP(3);
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanChangeStatus') THEN
        CREATE TYPE "PlanChangeStatus" AS ENUM (
          'BORRADOR',
          'PENDIENTE_DE_FIRMA',
          'FIRMADO',
          'ACTIVO',
          'CANCELADO',
          'RECHAZADO',
          'ANULADO'
        );
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "ServicePlan" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "speedMbps" INTEGER NOT NULL,
      "monthlyUsd" DECIMAL(10,2) NOT NULL,
      "installUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'TariffConfig'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'TariffConfig' AND column_name = 'addendumDeclarationText'
      ) THEN
        ALTER TABLE "TariffConfig" ADD COLUMN "addendumDeclarationText" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Customer'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'email'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "email" TEXT;
        ALTER TABLE "Customer" ADD COLUMN "activeServicePlanId" TEXT;
        ALTER TABLE "Customer" ADD COLUMN "planMonthlyUsd" DECIMAL(10,2);
        ALTER TABLE "Customer" ADD COLUMN "planSpeedMbps" INTEGER;
        ALTER TABLE "Customer" ADD COLUMN "contractPermanenceStart" TIMESTAMP(3);
        ALTER TABLE "Customer" ADD COLUMN "contractPermanenceEnd" TIMESTAMP(3);
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "PlanChange" (
      "id" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "addendumNumber" TEXT,
      "status" "PlanChangeStatus" NOT NULL DEFAULT 'BORRADOR',
      "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "confirmedAt" TIMESTAMP(3),
      "signedAt" TIMESTAMP(3),
      "activatedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "voidedAt" TIMESTAMP(3),
      "previousPlanName" TEXT NOT NULL,
      "previousSpeedMbps" INTEGER,
      "previousMonthlyUsd" DECIMAL(10,2) NOT NULL,
      "previousPermanenceStart" TIMESTAMP(3),
      "previousPermanenceEnd" TIMESTAMP(3),
      "newPlanId" TEXT,
      "newPlanName" TEXT NOT NULL,
      "newSpeedMbps" INTEGER NOT NULL,
      "newMonthlyUsd" DECIMAL(10,2) NOT NULL,
      "standardMonthlyUsd" DECIMAL(10,2) NOT NULL,
      "discountReason" TEXT,
      "discountAuthorizedById" TEXT,
      "discountAuthorizedAt" TIMESTAMP(3),
      "newPermanenceStart" TIMESTAMP(3),
      "newPermanenceEnd" TIMESTAMP(3),
      "permanenceMonths" INTEGER NOT NULL DEFAULT 18,
      "originalContractDate" TIMESTAMP(3) NOT NULL,
      "clientSignatureName" TEXT,
      "clientSignatureCedula" TEXT,
      "signatureImageData" TEXT,
      "signatureConsent" BOOLEAN NOT NULL DEFAULT false,
      "signatureIp" TEXT,
      "signedPdfData" TEXT,
      "voidReason" TEXT,
      "voidedById" TEXT,
      "notes" TEXT,
      "previousPlanId" TEXT,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlanChange_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlanChange_addendumNumber_key"
      ON "PlanChange"("addendumNumber");
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChange_customerId_fkey') THEN
        ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChange_newPlanId_fkey') THEN
        ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_newPlanId_fkey"
          FOREIGN KEY ("newPlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChange_previousPlanId_fkey') THEN
        ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_previousPlanId_fkey"
          FOREIGN KEY ("previousPlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChange_createdById_fkey') THEN
        ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChange_discountAuthorizedById_fkey') THEN
        ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_discountAuthorizedById_fkey"
          FOREIGN KEY ("discountAuthorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChange_voidedById_fkey') THEN
        ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_voidedById_fkey"
          FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_activeServicePlanId_fkey') THEN
        ALTER TABLE "Customer" ADD CONSTRAINT "Customer_activeServicePlanId_fkey"
          FOREIGN KEY ("activeServicePlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SignatureLinkStatus') THEN
        CREATE TYPE "SignatureLinkStatus" AS ENUM (
          'GENERADO', 'ENVIADO', 'ABIERTO', 'EN_PROCESO', 'FIRMADO', 'COMPLETADO', 'EXPIRADO', 'CANCELADO'
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanChangeSignatureMode') THEN
        CREATE TYPE "PlanChangeSignatureMode" AS ENUM ('PRESENCIAL', 'REMOTA');
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'signatureMode'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "signatureMode" "PlanChangeSignatureMode" NOT NULL DEFAULT 'PRESENCIAL';
        ALTER TABLE "PlanChange" ADD COLUMN "identitySelfieData" TEXT;
        ALTER TABLE "PlanChange" ADD COLUMN "identitySelfieId" TEXT;
        ALTER TABLE "PlanChange" ADD COLUMN "identitySelfieAt" TIMESTAMP(3);
        ALTER TABLE "PlanChange" ADD COLUMN "dataConfirmedAt" TIMESTAMP(3);
        ALTER TABLE "PlanChange" ADD COLUMN "adendumAcceptedAt" TIMESTAMP(3);
        ALTER TABLE "PlanChange" ADD COLUMN "signatureUserAgent" TEXT;
        ALTER TABLE "PlanChange" ADD COLUMN "signedDigitally" BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TariffConfig'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'TariffConfig' AND column_name = 'signatureLinkExpiryHours'
      ) THEN
        ALTER TABLE "TariffConfig" ADD COLUMN "signatureLinkExpiryHours" INTEGER NOT NULL DEFAULT 24;
        ALTER TABLE "TariffConfig" ADD COLUMN "whatsappSignatureMessage" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "PlanChangeSignatureToken" (
      "id" TEXT NOT NULL,
      "planChangeId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "status" "SignatureLinkStatus" NOT NULL DEFAULT 'GENERADO',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sentAt" TIMESTAMP(3),
      "openedAt" TIMESTAMP(3),
      "processStartedAt" TIMESTAMP(3),
      "signedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "generatedById" TEXT NOT NULL,
      "openIp" TEXT,
      "openUserAgent" TEXT,
      "signIp" TEXT,
      "signUserAgent" TEXT,
      CONSTRAINT "PlanChangeSignatureToken_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PlanChangeSignatureToken_tokenHash_key"
      ON "PlanChangeSignatureToken"("tokenHash");
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChangeSignatureToken_planChangeId_fkey') THEN
        ALTER TABLE "PlanChangeSignatureToken"
          ADD CONSTRAINT "PlanChangeSignatureToken_planChangeId_fkey"
          FOREIGN KEY ("planChangeId") REFERENCES "PlanChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanChangeSignatureToken_generatedById_fkey') THEN
        ALTER TABLE "PlanChangeSignatureToken"
          ADD CONSTRAINT "PlanChangeSignatureToken_generatedById_fkey"
          FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractOperationType') THEN
        CREATE TYPE "ContractOperationType" AS ENUM (
          'CAMBIO_PLAN',
          'RENOVACION',
          'RENOVACION_CAMBIO_PLAN'
        );
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'operationType'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "operationType" "ContractOperationType" NOT NULL DEFAULT 'CAMBIO_PLAN';
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TariffConfig'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'TariffConfig' AND column_name = 'renewalDeclarationText'
      ) THEN
        ALTER TABLE "TariffConfig" ADD COLUMN "renewalDeclarationText" TEXT;
        ALTER TABLE "TariffConfig" ADD COLUMN "renewalMinMonthsCompleted" INTEGER NOT NULL DEFAULT 18;
        ALTER TABLE "TariffConfig" ADD COLUMN "earlyRenewalEnabled" BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE "TariffConfig" ADD COLUMN "earlyRenewalDaysBefore" INTEGER NOT NULL DEFAULT 30;
        ALTER TABLE "TariffConfig" ADD COLUMN "renewalAlertDays60" INTEGER NOT NULL DEFAULT 60;
        ALTER TABLE "TariffConfig" ADD COLUMN "renewalAlertDays30" INTEGER NOT NULL DEFAULT 30;
        ALTER TABLE "TariffConfig" ADD COLUMN "renewalAlertDays15" INTEGER NOT NULL DEFAULT 15;
      END IF;
    END $$;
  `);

  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'identitySelfieData'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "identitySelfieData" TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'identitySelfieId'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "identitySelfieId" TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'identitySelfieAt'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "identitySelfieAt" TIMESTAMP(3);
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'dataConfirmedAt'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "dataConfirmedAt" TIMESTAMP(3);
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'adendumAcceptedAt'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "adendumAcceptedAt" TIMESTAMP(3);
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'signatureMode'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "signatureMode" "PlanChangeSignatureMode" NOT NULL DEFAULT 'PRESENCIAL';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'signatureUserAgent'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "signatureUserAgent" TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlanChange'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PlanChange' AND column_name = 'signedDigitally'
      ) THEN
        ALTER TABLE "PlanChange" ADD COLUMN "signedDigitally" BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  // --- Preliquidación obligatoria de bajas ---
  await run(`
    CREATE TABLE IF NOT EXISTS "DocumentSequence" (
      "key" TEXT NOT NULL,
      "value" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("key")
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PreliquidacionStatus') THEN
        CREATE TYPE "PreliquidacionStatus" AS ENUM (
          'BORRADOR', 'GENERADA', 'ENVIADA', 'PENDIENTE_APROBACION',
          'APROBADA', 'RECHAZADA', 'SUPERSEDED'
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PreliquidacionLineCategory') THEN
        CREATE TYPE "PreliquidacionLineCategory" AS ENUM (
          'PERMANENCIA', 'MENSUALIDAD', 'EQUIPO', 'TV', 'OTRO', 'CREDITO'
        );
      END IF;
    END $$;
  `);

  const newCancellationStatuses = [
    'PRELIQUIDACION_EN_PROCESO',
    'PRELIQUIDACION_GENERADA',
    'PRELIQUIDACION_ENVIADA',
    'PRELIQUIDACION_PENDIENTE',
    'PRELIQUIDACION_RECHAZADA',
    'PRELIQUIDACION_APROBADA',
    'BAJA_AUTORIZADA',
    'EN_DEVOLUCION_EQUIPOS',
    'LIQUIDACION_FINAL',
    'CANCELADA',
  ];
  for (const val of newCancellationStatuses) {
    await run(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CancellationStatus') AND NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'CancellationStatus' AND e.enumlabel = '${val}'
        ) THEN
          ALTER TYPE "CancellationStatus" ADD VALUE '${val}';
        END IF;
      END $$;
    `);
  }

  await run(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Cancellation')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'activePreliquidacionId') THEN
        ALTER TABLE "Cancellation" ADD COLUMN "activePreliquidacionId" TEXT;
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CancellationPreliquidacion" (
      "id" TEXT NOT NULL,
      "cancellationId" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "status" "PreliquidacionStatus" NOT NULL DEFAULT 'GENERADA',
      "docNumber" TEXT,
      "permanenceAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "tvAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "monthlyAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "equipmentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "otherAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "creditsAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "rejectionReason" TEXT,
      "rejectedAt" TIMESTAMP(3),
      "rejectedIp" TEXT,
      "rejectedUserAgent" TEXT,
      "approvedAt" TIMESTAMP(3),
      "approvedIp" TEXT,
      "approvedUserAgent" TEXT,
      "approvedTotal" DECIMAL(10,2),
      "sentAt" TIMESTAMP(3),
      "notes" TEXT,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CancellationPreliquidacion_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "PreliquidacionLineItem" (
      "id" TEXT NOT NULL,
      "preliquidacionId" TEXT NOT NULL,
      "category" "PreliquidacionLineCategory" NOT NULL,
      "concept" TEXT NOT NULL,
      "amount" DECIMAL(10,2) NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "metadata" TEXT,
      CONSTRAINT "PreliquidacionLineItem_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "PreliquidacionApprovalToken" (
      "id" TEXT NOT NULL,
      "preliquidacionId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "status" "SignatureLinkStatus" NOT NULL DEFAULT 'GENERADO',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sentAt" TIMESTAMP(3),
      "openedAt" TIMESTAMP(3),
      "approvedAt" TIMESTAMP(3),
      "rejectedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "generatedById" TEXT NOT NULL,
      "openIp" TEXT,
      "openUserAgent" TEXT,
      "approveIp" TEXT,
      "approveUserAgent" TEXT,
      "rejectIp" TEXT,
      "rejectUserAgent" TEXT,
      "rejectionReason" TEXT,
      CONSTRAINT "PreliquidacionApprovalToken_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CancellationFinalLiquidation" (
      "id" TEXT NOT NULL,
      "cancellationId" TEXT NOT NULL,
      "preliquidacionId" TEXT NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1,
      "preliquidacionTotal" DECIMAL(10,2) NOT NULL,
      "equipmentAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "otherAdjustments" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "totalAmount" DECIMAL(10,2) NOT NULL,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "clientSignature" TEXT,
      "signedAt" TIMESTAMP(3),
      "signIp" TEXT,
      "signUserAgent" TEXT,
      CONSTRAINT "CancellationFinalLiquidation_pkey" PRIMARY KEY ("id")
    );
  `);

  // Prisma db push creates @unique as indexes (pg_indexes), not pg_constraint entries.
  // CREATE UNIQUE INDEX IF NOT EXISTS is idempotent for both constraint- and index-backed uniques.
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CancellationPreliquidacion_cancellationId_version_key"
      ON "CancellationPreliquidacion"("cancellationId", "version");
  `);
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PreliquidacionApprovalToken_tokenHash_key"
      ON "PreliquidacionApprovalToken"("tokenHash");
  `);
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Cancellation_activePreliquidacionId_key"
      ON "Cancellation"("activePreliquidacionId");
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationPreliquidacion_cancellationId_fkey') THEN
        ALTER TABLE "CancellationPreliquidacion" ADD CONSTRAINT "CancellationPreliquidacion_cancellationId_fkey"
          FOREIGN KEY ("cancellationId") REFERENCES "Cancellation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationPreliquidacion_createdById_fkey') THEN
        ALTER TABLE "CancellationPreliquidacion" ADD CONSTRAINT "CancellationPreliquidacion_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PreliquidacionLineItem_preliquidacionId_fkey') THEN
        ALTER TABLE "PreliquidacionLineItem" ADD CONSTRAINT "PreliquidacionLineItem_preliquidacionId_fkey"
          FOREIGN KEY ("preliquidacionId") REFERENCES "CancellationPreliquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PreliquidacionApprovalToken_preliquidacionId_fkey') THEN
        ALTER TABLE "PreliquidacionApprovalToken" ADD CONSTRAINT "PreliquidacionApprovalToken_preliquidacionId_fkey"
          FOREIGN KEY ("preliquidacionId") REFERENCES "CancellationPreliquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PreliquidacionApprovalToken_generatedById_fkey') THEN
        ALTER TABLE "PreliquidacionApprovalToken" ADD CONSTRAINT "PreliquidacionApprovalToken_generatedById_fkey"
          FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationFinalLiquidation_cancellationId_fkey') THEN
        ALTER TABLE "CancellationFinalLiquidation" ADD CONSTRAINT "CancellationFinalLiquidation_cancellationId_fkey"
          FOREIGN KEY ("cancellationId") REFERENCES "Cancellation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationFinalLiquidation_preliquidacionId_fkey') THEN
        ALTER TABLE "CancellationFinalLiquidation" ADD CONSTRAINT "CancellationFinalLiquidation_preliquidacionId_fkey"
          FOREIGN KEY ("preliquidacionId") REFERENCES "CancellationPreliquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cancellation_activePreliquidacionId_fkey') THEN
        ALTER TABLE "Cancellation" ADD CONSTRAINT "Cancellation_activePreliquidacionId_fkey"
          FOREIGN KEY ("activePreliquidacionId") REFERENCES "CancellationPreliquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  // Pre-aprobar preliquidaciones sintéticas para bajas ya en flujo de pago
  await run(`
    INSERT INTO "CancellationPreliquidacion" (
      "id", "cancellationId", "version", "status", "permanenceAmount", "tvAmount",
      "monthlyAmount", "equipmentAmount", "otherAmount", "creditsAmount", "subtotal",
      "totalAmount", "approvedAt", "approvedTotal", "createdById", "createdAt"
    )
    SELECT
      'legacy_' || c."id",
      c."id",
      1,
      'APROBADA'::"PreliquidacionStatus",
      c."permanenceAmount",
      c."tvAmount",
      c."monthlyAmount",
      c."equipmentAmount",
      c."otherAmount",
      0,
      c."totalAmount",
      c."totalAmount",
      COALESCE(c."updatedAt", c."createdAt"),
      c."totalAmount",
      c."createdById",
      c."createdAt"
    FROM "Cancellation" c
    WHERE c."status" IN ('PENDIENTE_DE_PAGO', 'PAGADA', 'EQUIPOS_RECUPERADOS', 'BAJA_COMPLETADA')
      AND NOT EXISTS (
        SELECT 1 FROM "CancellationPreliquidacion" p WHERE p."cancellationId" = c."id"
      );
  `);

  await run(`
    UPDATE "Cancellation" c
    SET "activePreliquidacionId" = 'legacy_' || c."id"
    WHERE c."status" IN ('PENDIENTE_DE_PAGO', 'PAGADA', 'EQUIPOS_RECUPERADOS', 'BAJA_COMPLETADA')
      AND c."activePreliquidacionId" IS NULL
      AND EXISTS (SELECT 1 FROM "CancellationPreliquidacion" p WHERE p."id" = 'legacy_' || c."id");
  `);

  // --- Firma remota acta final post-liquidación ---
  await run(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'CancellationFinalLiquidation')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CancellationFinalLiquidation' AND column_name = 'signatureImageData') THEN
        ALTER TABLE "CancellationFinalLiquidation" ADD COLUMN "signatureImageData" TEXT;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'CancellationFinalLiquidation')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CancellationFinalLiquidation' AND column_name = 'actaAcceptedAt') THEN
        ALTER TABLE "CancellationFinalLiquidation" ADD COLUMN "actaAcceptedAt" TIMESTAMP(3);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'CancellationFinalLiquidation')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CancellationFinalLiquidation' AND column_name = 'signatureMode') THEN
        ALTER TABLE "CancellationFinalLiquidation" ADD COLUMN "signatureMode" TEXT DEFAULT 'PRESENCIAL';
      END IF;
    END $$;
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS "CancellationActaSignatureToken" (
      "id" TEXT NOT NULL,
      "cancellationId" TEXT NOT NULL,
      "finalLiquidationId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "status" "SignatureLinkStatus" NOT NULL DEFAULT 'GENERADO',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sentAt" TIMESTAMP(3),
      "openedAt" TIMESTAMP(3),
      "signedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "generatedById" TEXT NOT NULL,
      "openIp" TEXT,
      "openUserAgent" TEXT,
      "signIp" TEXT,
      "signUserAgent" TEXT,
      CONSTRAINT "CancellationActaSignatureToken_pkey" PRIMARY KEY ("id")
    );
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CancellationActaSignatureToken_tokenHash_key"
      ON "CancellationActaSignatureToken"("tokenHash");
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationActaSignatureToken_cancellationId_fkey') THEN
        ALTER TABLE "CancellationActaSignatureToken" ADD CONSTRAINT "CancellationActaSignatureToken_cancellationId_fkey"
          FOREIGN KEY ("cancellationId") REFERENCES "Cancellation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationActaSignatureToken_finalLiquidationId_fkey') THEN
        ALTER TABLE "CancellationActaSignatureToken" ADD CONSTRAINT "CancellationActaSignatureToken_finalLiquidationId_fkey"
          FOREIGN KEY ("finalLiquidationId") REFERENCES "CancellationFinalLiquidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationActaSignatureToken_generatedById_fkey') THEN
        ALTER TABLE "CancellationActaSignatureToken" ADD CONSTRAINT "CancellationActaSignatureToken_generatedById_fkey"
          FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await run(`
    UPDATE "Cancellation" c
    SET "activePreliquidacionId" = latest."id"
    FROM (
      SELECT DISTINCT ON ("cancellationId") "id", "cancellationId"
      FROM "CancellationPreliquidacion"
      WHERE "status" <> 'SUPERSEDED'
      ORDER BY "cancellationId", "version" DESC
    ) latest
    WHERE c."id" = latest."cancellationId"
      AND c."activePreliquidacionId" IS NULL;
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Customer' AND column_name = 'offeredPlanName'
      ) THEN
        ALTER TABLE "Customer" ADD COLUMN "offeredPlanName" TEXT;
        ALTER TABLE "Customer" ADD COLUMN "offeredPlanSpeedMbps" INTEGER;
        ALTER TABLE "Customer" ADD COLUMN "offeredPlanMonthlyUsd" DECIMAL(10,2);
      END IF;
    END $$;
  `);

  // --- AUD-003/005: snapshot de permanencia + una baja activa por cliente ---
  await run(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Cancellation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cancellation' AND column_name = 'permanenceMonthsSnapshot'
      ) THEN
        ALTER TABLE "Cancellation" ADD COLUMN "permanenceMonthsSnapshot" INTEGER;
        ALTER TABLE "Cancellation" ADD COLUMN "installCostUsdSnapshot" DECIMAL(10,2);
        ALTER TABLE "Cancellation" ADD COLUMN "tvMonthlyUsdSnapshot" DECIMAL(10,2);
        ALTER TABLE "Cancellation" ADD COLUMN "permanenceConfigSource" TEXT;
        ALTER TABLE "Cancellation" ADD COLUMN "planChangeIdSnapshot" TEXT;
      END IF;
    END $$;
  `);

  // Resolver duplicados históricos antes del índice único parcial (AUD-005).
  await run(`
    UPDATE "Cancellation" c
    SET "status" = 'CANCELADA', "updatedAt" = NOW()
    WHERE c."id" IN (
      SELECT "id"
      FROM (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "customerId"
            ORDER BY "createdAt" DESC, "id" DESC
          ) AS rn
        FROM "Cancellation"
        WHERE "status" NOT IN ('BAJA_COMPLETADA', 'CANCELADA')
      ) ranked
      WHERE rn > 1
    );
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Cancellation_customerId_active_key"
      ON "Cancellation"("customerId")
      WHERE "status" NOT IN ('BAJA_COMPLETADA', 'CANCELADA');
  `);

  console.log("Pre-deploy migrations OK");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
