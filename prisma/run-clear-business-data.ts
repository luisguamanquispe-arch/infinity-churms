import { PrismaClient } from "@prisma/client";
import { clearBusinessData } from "./clear-business-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Eliminando datos de negocio (clientes, bajas, equipos, pagos, auditoría)...");
  const deleted = await clearBusinessData(prisma);
  console.log("Datos eliminados:", deleted);
  console.log("Se conservaron: usuarios, tarifas y configuración del sistema.");
  console.log("Listo para ingresar datos reales.");
}

main()
  .catch((err) => {
    console.error("Error al limpiar datos:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
