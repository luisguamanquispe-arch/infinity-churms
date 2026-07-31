import { PrismaClient } from "@prisma/client";
import { clearBusinessData } from "./clear-business-data";

const prisma = new PrismaClient();

async function run(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

async function main() {
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

  console.log("Pre-deploy migrations OK");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
