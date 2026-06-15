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

  if (process.env.CLEAR_BUSINESS_DATA === "1") {
    console.log("CLEAR_BUSINESS_DATA=1 — eliminando datos de prueba...");
    const deleted = await clearBusinessData(prisma);
    console.log("Datos eliminados:", deleted);
  }

  console.log("Pre-deploy migrations OK");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
