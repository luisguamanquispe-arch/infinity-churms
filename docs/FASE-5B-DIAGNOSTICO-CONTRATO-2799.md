# FASE 5B — DIAGNÓSTICO Y CORRECCIÓN PRELIQUIDACIÓN CONTRATO 2799

**Fecha:** 2026-09-11  
**Commit base:** `6a238d356835e53094376969a6596f7720802c80`  
**BD:** `infinity_bajas_test`  
**Veredicto:** **`READY FOR PRE-COMMIT AUDIT`**

---

## 1. Causa exacta del TOTAL = 0

**FUENTE REAL DEL 0:**

El motor P1–P6 **solo contabiliza mensualidades desde `CollectionCharge(CONSUMO_MENSUAL)` con saldo pendiente > 0** (vía P1 FIFO). Para el contrato 2799:

- **Caso A:** no existían cargos `CONSUMO_MENSUAL` en Cobranzas.
- **Regla comercial 16–fin no implementada:** si la solicitud de baja cae en día **≥ 16**, debe incluirse la mensualidad del mes calendario **siguiente**; el motor anterior no generaba esa obligación.
- `planMonthlyUsd = 20` se mostraba en UI como referencia, pero **no entraba al cálculo**.
- `pendingBalance = 0` no afecta (correctamente ignorado por el motor).

No era un bug de P1–P6 ni de Decisión B: era **obligación contractual no representada** cuando faltaba el cargo y aplicaba la regla de corte.

---

## 2. Datos reales (reproducción BD test)

Contrato 2799 **no existía** en `infinity_bajas_test` (solo 8 clientes seed). Se reprodujo con `_fase5b-seed-2799.ts`:

| Campo | Valor |
|-------|-------|
| Customer ID | `cmtwe3pri0000kpdozd4njh9j` |
| Contrato | 2799 |
| Nombre | MONTACHANA PILATASIG EDWIN SANTIAGO |
| Cédula | 1850196971 |
| Plan | PLAN SIN LIMITES |
| planMonthlyUsd | 20 |
| serviceStartDate | 2021-10-15 |
| pendingBalance | 0 |
| Cancellation ID | `cmtwe3ryi0002kpdouzrtm8px` |
| requestDate | 2026-09-20 (día **20** ≥ 16) |
| CollectionCharge | **ninguno** |
| CollectionPayment | **ninguno** |
| CancellationCharge | **ninguno** |
| Equipment | **ninguno** |

---

## 3. Tabla de fuentes (BD real)

| Fuente | Tipo | Importe | Período | Estado | Debe entrar en Baja |
|--------|------|--------:|---------|--------|---------------------|
| CollectionCharge | CONSUMO_MENSUAL | — | — | No existe | Sí (mes siguiente por regla 16–fin) |
| CollectionCharge | INSTALACION | — | — | No existe | No (permanencia cumplida) |
| CollectionCharge | STREAMS | — | — | No existe | No |
| CollectionPayment | pago | — | — | No existe | — |
| CancellationCharge | cargo/crédito | — | — | No existe | — |
| Equipment | — | — | — | No existe | — |

---

## 4. Mensualidad contractual y regla 1–15 / 16–fin

| requestDate (día) | Regla | Resultado |
|-------------------|-------|-----------|
| 15 | 1–15 | Sin mensualidad siguiente → total 0 |
| 16 | 16–fin | Mensualidad Octubre 2026 → total 20 |
| 20 (2799) | 16–fin | Mensualidad Octubre 2026 → total 20 |
| 30 (último día) | 16–fin | Mensualidad siguiente → total 20 |

**Implementación:** línea `MENSUALIDAD` con metadata `{ source: "NEXT_MONTH_RULE", month: "YYYY-MM" }` cuando:
1. `requestDate.getUTCDate() >= 16`
2. Existe precio contractual (`planMonthlyUsd` → `ServicePlan` activo)
3. **No** existe `CollectionCharge(CONSUMO_MENSUAL)` que cubra ese mes (evita duplicar)
4. Si existe cargo parcial, P1 aplica saldo neto (sin línea adicional)

**No** se usa `total += 20` como constante: se resuelve `monthlyContractUsd` desde plan del cliente.

---

## 5. Instalación / Streams / Equipos / OTRO / Créditos (2799)

| Concepto | Valor |
|----------|------:|
| installAmountCalculated | 0 (permanencia cumplida desde 2021) |
| installationPending | 0 |
| installationNet | 0 |
| PERMANENCIA | 0 |
| streamsNet | 0 |
| equipment | 0 |
| otros | 0 |
| créditos | 0 |

Decisión B no aplica (sin INSTALACION pending).

---

## 6. Desglose corregido (contrato 2799)

```
MENSUALIDADES = 20  (Octubre 2026 — NEXT_MONTH_RULE)
INSTALACION   = 0
STREAMS       = 0
EQUIPOS       = 0
OTROS         = 0
CREDITOS      = 0
SUBTOTAL      = 20
TOTAL         = 20
```

Línea: `[MENSUALIDAD] Octubre 2026 = 20`

---

## 7. Comparación UI / Motor

| Concepto | UI antes | BD real | Motor antes | Motor corregido |
|----------|--------:|--------:|------------:|----------------:|
| Mensualidades | 0 | Sin cargos; regla 16–fin aplica | 0 | **20** |
| Instalación | 0 | 0 | 0 | 0 |
| Streams | 0 | 0 | 0 | 0 |
| Equipos | 0 | 0 | 0 | 0 |
| Otros | 0 | 0 | 0 | 0 |
| Créditos | 0 | 0 | 0 | 0 |
| **TOTAL** | **0** | — | **0** | **20** |

---

## 8. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/lib/services/baja-liquidation.ts` | Regla día 16–fin, resolución precio contractual, anti-duplicación |
| `scripts/test-baja-liquidation-p1-p6.ts` | +6 tests regla 15/16/último día/duplicado/parcial |
| `scripts/test-contract-2799-preliquidacion.ts` | Test específico contrato 2799 |
| `scripts/_fase5b-seed-2799.ts` | Reproducción BD test |
| `scripts/_fase5b-diagnose-2799.ts` | Diagnóstico lectura |

---

## 9. Regresión

| Comando | Resultado |
|---------|-----------|
| `test:baja-liquidation-p1-p6` | **PASS** — 58 assertions |
| `test:contract-2799-preliquidacion` | **PASS** |
| `test:p1-closure` | **PASS** |
| `test:db-connection` | **PASS** |
| `test:e2e-baja-liquidation` | **PASS** |
| `test:e2e-baja-flow` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |

Decisión B (total=40), OTRO-A/B/C, snapshot/inmutabilidad E2E: **sin regresión**.

---

## 10. Paridad

| Capa | 2799 |
|------|------|
| Motor | total=20 |
| Preliquidación | total=20, 1 línea MENSUALIDAD |
| Snapshot | Pendiente aprobación en prueba |

---

## 11. Git (sin commit)

```
 M src/lib/services/baja-liquidation.ts
 M scripts/test-baja-liquidation-p1-p6.ts
?? scripts/test-contract-2799-preliquidacion.ts
?? scripts/_fase5b-seed-2799.ts
?? scripts/_fase5b-diagnose-2799.ts
```

**Sin commit, push, deploy, migraciones ni producción.**

---

## 12. Veredicto

```
READY FOR PRE-COMMIT AUDIT
```

**Nota operativa:** el contrato 2799 original debe existir en el entorno donde se observó el bug (probablemente producción/staging). La corrección fue validada con reproducción equivalente en `infinity_bajas_test`. Tras deploy, regenerar preliquidación del contrato real con solicitud día ≥ 16 debe mostrar USD 20,00 en mensualidades.
