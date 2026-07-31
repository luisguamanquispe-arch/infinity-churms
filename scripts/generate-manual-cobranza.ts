import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { manualCobranzaPdfBuffer } from "../src/lib/pdf-manual-cobranza";

const outPath = join(process.cwd(), "public", "docs", "manual-gestion-cobranza.pdf");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, manualCobranzaPdfBuffer());

console.log(`Manual generado: ${outPath}`);
