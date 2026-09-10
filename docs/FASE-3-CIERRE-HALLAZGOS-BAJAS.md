# FASE 3 — CIERRE DE HALLAZGOS BAJAS

**Fecha:** 2026-09-10  
**Branch:** `main` @ `4eef942` (sin commit en esta fase)  
**BD:** `infinity_bajas_test` (localhost:5432)  
**Veredicto:** `READY WITH BROWSER-VISUAL EVIDENCE LIMITATION`

---

## 1. Estado inicial

Tras FASE 2B quedaron dos hallazgos abiertos:

| # | Hallazgo | Estado FASE 2B |
|---|----------|----------------|
| 1 | `test-ui-baja-flow.ts` incompatible con P1–P6 (`pendingBalance` en lugar de `CollectionCharge(CONSUMO_MENSUAL)`) | FAIL en PRELIQUIDACIÓN (`total=0`) |
| 2 | Riesgo de doble contabilización `CollectionCharge(OTRO)` + `CancellationCharge` positivo | Clasificado como riesgo operacional, no bug automático |

Restricciones respetadas: sin producción, deploy, push, commit, migraciones ni cambios al motor P1–P6 / Decisión B / snapshot.

---

## 2. Corrección del test UI

### Diferencia identificada (A1)

| Aspecto | `test-e2e-baja-flow.ts` (correcto) | `test-ui-baja-flow.ts` (antes) |
|---------|--------------------------------------|--------------------------------|
| Mensualidad | `createCollectionCharge(..., CONSUMO_MENSUAL, amount=30)` | `Customer.pendingBalance: 30` |
| Resultado preliq | `total=30` | `total=0` (motor ignora `pendingBalance`) |

### Cambio aplicado (A3)

Archivo modificado: `scripts/test-ui-baja-flow.ts`

- Import de `createCollectionCharge` desde `collection-charges`.
- `pendingBalance: 0` (dato informativo, no fuente de obligación).
- Creación de `CollectionCharge(CONSUMO_MENSUAL, amount=30)` vía servicio existente.
- Cleanup en `finally`: `collectionPayment` + `collectionCharge`.

Sin lógica de negocio duplicada en el test.

---

## 3. Evidencia `test:ui-baja-flow`

```
✓ LOGIN: cobranzas@infinity.net (cookie OK)
✓ CLIENTE: UI-E2E-1789082751308
✓ BAJA: status=SOLICITADA
✓ PRELIQUIDACIÓN: V1 total=30
✓ APROBACIÓN: status=BAJA_AUTORIZADA
✓ PRE-PAGO: status=PENDIENTE_DE_PAGO
✓ GET DETALLE: HTTP 200
✓ SERIALIZACIÓN: sin Decimal
✓ PAGO: HTTP 200 body={"ok":true}
✓ PAGADA: status=PAGADA
✓ LIQUIDACIÓN: HTTP 200 status=LIQUIDACION_FINAL
✓ ACTA/FIRMA: acta firmada remotamente
✓ CIERRE: HTTP 200 status=BAJA_COMPLETADA
✓ CUSTOMER STATUS: status=INACTIVO

UI baja flow (HTTP): PASS — 14 etapas
```

**Nota operativa:** el dev server requiere inyectar `DATABASE_URL`, `JWT_SECRET` y `SEED_DEFAULT_PASSWORD` desde `.env` al proceso antes de `npm run dev` (shell puede sobrescribir `DATABASE_URL`).

---

## 4. Investigación OTRO

### Orígenes mapeados (B2)

| Entidad | Dónde se crea | Campos clave | Alcance |
|---------|---------------|--------------|---------|
| `CollectionCharge` | Cobranzas — `createCollectionCharge()` / API `customers/[id]/charges` | `chargeType`, `amount`, `description`, `periodLabel`, `customerId` | Obligación a nivel cliente |
| `CancellationCharge` | Baja admin — `cancellations.ts` / API `cancellations/[id]` action `add_charge` | `concept`, `amount`, `cancellationId` | Cargo ad-hoc en la baja |

### Schema (Prisma)

- `CollectionCharge`: sin referencia a `Cancellation`.
- `CancellationCharge`: solo `concept` + `amount`; **no existe** `chargeId`, `metadata`, `source` ni referencia al cargo original de Cobranzas.

### Motor (`baja-liquidation.ts`)

- `CollectionCharge(OTRO)` pendiente → línea `OTRO` con `formatChargeDetail(charge)`.
- `CancellationCharge` positivo → línea `OTRO` con `c.concept`.
- Ambas fuentes se suman independientemente; no hay deduplicación.

### ¿Puede el sistema generar duplicados automáticamente?

**No.** No existe flujo que cree el mismo concepto en ambos lugares sin intervención manual. La duplicación requiere doble entrada humana (Cobranzas + Admin Baja).

---

## 5. Matriz OTRO-A/B/C

Pruebas añadidas en `scripts/test-baja-liquidation-p1-p6.ts` (BD test / unit input):

| Caso | CollectionCharge(OTRO) | CancellationCharge | Expected OTHER | Resultado |
|------|------------------------|--------------------|----------------|-----------|
| OTRO-A | 15 | 0 | 15 (1 línea) | PASS |
| OTRO-B | 0 | 15 | 15 (1 línea) | PASS |
| OTRO-C | 15 | 15 | 30 (2 líneas) | PASS |

---

## 6. Regla de negocio determinada

**OPCIÓN 2 — RIESGO OPERACIONAL CONTROLABLE**

- OTRO-A y OTRO-B confirman que cada origen contribuye correctamente por separado.
- OTRO-C demuestra que, **sin identificador de origen compartido**, el motor trata ambos cargos como obligaciones independientes → `OTHER = 30` es **correcto** según el modelo actual.
- No es seguro deduplicar por importe ni por concepto textual similar.
- **No se modificó el motor** (correcto: no hay bug de fórmula ni generación automática).

### Recomendaciones futuras (sin implementar en FASE 3)

1. Validación UI al agregar `CancellationCharge`: advertir si existe `CollectionCharge(OTRO)` pendiente similar.
2. Campo opcional `sourceCollectionChargeId` en `CancellationCharge` para vinculación explícita.
3. Auditoría de cargos duplicados en panel admin.

---

## 7. ¿Existe bug real?

**No.** Clasificación: **OPCIÓN 2**, no OPCIÓN 3.

No hay doble contabilización automática. El riesgo es operacional por doble entrada manual.

---

## 8. Decisión sobre deduplicación

| Decisión | Detalle |
|----------|---------|
| Motor | Sin cambios |
| Deduplicación automática | **Rechazada** — falta identificador inequívico |
| Criterio rechazado | `amount A == amount B` nunca es suficiente |

---

## 9. Regresión completa

| Comando | Resultado |
|---------|-----------|
| `npm run test:baja-liquidation-p1-p6` | PASS (52 assertions incl. OTRO-A/B/C) |
| `npm run test:p1-closure` | PASS |
| `npm run test:db-connection` | PASS |
| `npm run test:e2e-baja-liquidation` | PASS |
| `npm run test:e2e-baja-flow` | PASS |
| `npm run test:ui-baja-flow` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |

---

## 10. Decisión B

Escenario validado en suite P1–P6 (sin cambios en FASE 3):

```
CONSUMO = 40, PAGO = 30, STREAMS = 30
INSTALACION pending = 50, install = 0
→ monthly = 10, installation = 0, permanence = 0
→ streams = 30, total = 40
```

Assertions PASS: `Decisión B total=40`, `installationNet=0`, sin línea INSTALACION/PERMANENCIA.

---

## 11. Paridad

| Capa | Evidencia |
|------|-----------|
| Motor | `test:baja-liquidation-p1-p6` + Decisión B |
| Snapshot | `test:e2e-baja-liquidation` — breakdown=75, snapshot=75, inmutabilidad post-aprobación |
| API / token público | E2E integral — paridad línea por línea pre-aprobación |
| HTTP flujo completo | `test:ui-baja-flow` + `test:e2e-baja-flow` |
| ADMIN snapshot | `test:p1-closure` AUD-019 |
| Móvil | Cubierto por E2E integral (token/API) |
| Browser visual manual | **No ejecutado** — herramienta MCP browser no disponible en sesión |

Paridad numérica TOTAL=40 y TOTAL=75: validada en FASE 2B (HTTP) y reconfirmada por suites unit/E2E sin alteración del motor.

---

## 12. TypeScript

`npx tsc --noEmit` — **PASS** (sin errores).

---

## 13. Build

`npm run build` — **PASS** (Prisma generate + Next.js 16.2.9 compile + TS check).

---

## 14. Git

```
## main...origin/main
 M scripts/test-baja-liquidation-p1-p6.ts
 M scripts/test-ui-baja-flow.ts
?? scripts/audit-p1-p6-formulas.ts
?? docs/FASE-3-CIERRE-HALLAZGOS-BAJAS.md
```

- **Sin commit**
- **Sin push**
- **Sin deploy**
- **Sin migraciones**
- **Sin cambios en producción**
- Cambios funcionales limitados a tests (+ este informe)

---

## 15. Estado final

| Criterio | Estado |
|----------|--------|
| `test-ui-baja-flow` PASS | ✓ |
| OTRO clasificado (OPCIÓN 2) | ✓ |
| Sin doble contabilización automática | ✓ |
| P1–P6 PASS | ✓ |
| Decisión B PASS | ✓ |
| Snapshot / inmutabilidad PASS | ✓ |
| Paridad motor/API/E2E PASS | ✓ |
| tsc + build PASS | ✓ |
| Browser visual manual | Limitación conocida |

### Veredicto

```
READY WITH BROWSER-VISUAL EVIDENCE LIMITATION
```

Funcionalmente listo para sign-off; queda pendiente evidencia visual en browser real (fuera del alcance automatizado de esta sesión).
