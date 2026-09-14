# FASE 6.12 — Diseño: sincronización de cargos adicionales con preliquidación

**Alcance:** arquitectura, flujos, estados, versiones, tokens y pruebas.  
**Sin implementación** (FASE 6.13).  
**Diagnóstico base:** FASE 6.11 (desacople `Cancellation` LIVE vs `CancellationPreliquidacion` SNAPSHOT).

---

## 1. Estado actual

| Capa | Fuente de verdad hoy | Incluye `CancellationCharge` |
|------|----------------------|------------------------------|
| Otros valores / Cargos adicionales (UI) | `CancellationCharge` (DB) | Sí (listado directo) |
| Motor `computeBajaLiquidation()` | Cargos + Cobranzas P1 + equipos | Sí (`row.charges`) |
| Fila `Cancellation` tras `recalculateCancellation` | Totales recalculados del motor | Sí (`otherAmount`, `totalAmount`) |
| Detalle preliquidación / Liquidación contractual / API token / PDF | `CancellationPreliquidacion` + `lineItems` | Solo si estaban al **generar** snapshot |
| `Customer.pendingBalance` | Cobranzas operativas | **No** entra al motor contractual |

**Flujo defectuoso confirmado:**

```text
add_charge → CancellationCharge.create → recalculateCancellation()
  → actualiza Cancellation.otherAmount / totalAmount
  → NO generatePreliquidacion / NO sync snapshot
```

**Caso 1524 (referencia):** solicitud 14/09/2026 (día 14 → sin mensualidad FASE 5); cargo manual esperado en OTRO; preliquidación en **PENDIENTE_APROBACION** con total 0; UI muestra cargo LIVE 22,40 y TOTAL snapshot 0.

---

## 2. Root cause confirmado

**Causa raíz:** ausencia de **sincronización contractual** entre cambios en `CancellationCharge` y el **snapshot inmutable por versión** (`CancellationPreliquidacion` + `PreliquidacionLineItem`).

- El motor **sí** incorpora `CancellationCharge` (regla OTHER + tests OTRO-B/C).
- Las superficies contractuales leen **snapshot**, no `Cancellation.otherAmount`.
- `add_charge`, `delete_charge` y admin `charges[]` solo llaman `recalculateCancellation`.
- Con preliquidación existente en estados **bloqueados para regeneración UI** (`LOCKED_STATUSES`), el operador no puede alinear snapshot sin un flujo explícito de **nueva versión + tokens**.

**Primer punto 22,40 → 0 (vista usuario):** lectura de `activePreliquidacion.lineItems` / totales con snapshot generado **antes** del cargo (o sin regeneración permitida).

---

## 3. Máquina de estados actual (`CancellationPreliquidacion`)

### 3.1 Enum Prisma (`PreliquidacionStatus`)

Estados **reales** en schema:

| Estado | Uso observado en código |
|--------|-------------------------|
| `BORRADOR` | Existe en enum y labels UI; **`generatePreliquidacion` crea con `GENERADA`**, no asigna `BORRADOR` en runtime. |
| `GENERADA` | Versión recién creada / editable en UI (“Editar preliquidación”). |
| `ENVIADA` | Tras `markPreliquidacionLinkSent` (link marcado enviado). |
| `PENDIENTE_APROBACION` | Tras `generatePreliquidacionLink` (generar enlace al cliente). |
| `APROBADA` | Tras aprobación por token (`approvedTotal` fijado). |
| `RECHAZADA` | Tras rechazo por token. |
| `SUPERSEDED` | Versión reemplazada al crear versión posterior (solo si la anterior **no** está en `LOCKED_STATUSES` al regenerar). |

**Nota UI:** la lista “Pendiente” del listado de bajas **no** es un enum; agrupa estados vía `getPreliquidacionListStatus` (p. ej. `PENDIENTE_APROBACION` → etiqueta lista “Enviada”).

### 3.2 Relaciones y vigencia

- **`Cancellation.activePreliquidacionId`** (FK única) → snapshot **vigente** para admin, PDF autenticado y paridad interna.
- **`getActivePreliquidacion`:** usa `activePreliquidacion` o, si falta enlace, el último registro con `status != SUPERSEDED` (mayor `version`).
- **Versionado:** entero `version` por `cancellationId`, único `@@unique([cancellationId, version])`.
- **Tokens:** `PreliquidacionApprovalToken` ligado a **`preliquidacionId` concreto** (versión), no a la baja genérica.

### 3.3 Constante de bloqueo

```typescript
LOCKED_STATUSES = ["ENVIADA", "PENDIENTE_APROBACION", "APROBADA"]
```

- `regeneratePreliquidacion` → **error `VERSION_LOCKED`** si activo ∈ `LOCKED_STATUSES`.
- `generatePreliquidacion` sin `forceNewVersion` → **`VERSION_LOCKED`** si última versión ∈ `LOCKED_STATUSES`.

### 3.4 Tabla de estados (código actual)

| Estado real | ¿Snapshot modificable in-place? | ¿Puede regenerarse (UI/API actual)? | ¿Requiere nueva versión? | ¿Token actual sigue válido? |
|-------------|--------------------------------:|------------------------------------:|-------------------------:|----------------------------:|
| `BORRADOR` | N/A (no usado al crear) | N/A | — | — |
| `GENERADA` | No (no hay update de líneas; solo recreate) | **Sí** (`regenerate` → supersedes + V+1) | Sí (implementación actual) | No aplica (sin token obligatorio) |
| `ENVIADA` | **No** | **No** (`VERSION_LOCKED`) | Solo si se implementa `forceNewVersion` con supersede | Sí, si no cancelado/expirado |
| `PENDIENTE_APROBACION` | **No** | **No** (`VERSION_LOCKED`) | Igual que ENVIADA | **Sí** (token apunta a V1 obsoleta) |
| `APROBADA` | **No** (P6) | **No** (`ALREADY_APPROVED`) | No retrospectiva | Token completado / inactivo |
| `RECHAZADA` | No in-place | **Sí** (regenerate) | Sí | Tokens previos cancelados al generar nuevo link en **misma** versión |
| `SUPERSEDED` | **No** (histórico) | No (activo es otra fila) | — | **No** (`resolvePreliquidacionToken` → `INVALID_STATE`) |

**Razón técnica:** no existe función que actualice `PreliquidacionLineItem` tras cargos; `generatePreliquidacion` solo **crea** filas nuevas y marca `SUPERSEDED` la anterior **únicamente** si `!LOCKED_STATUSES.includes(latest.status)`. Por tanto **V1 en `PENDIENTE_APROBACION` no se supersede** aunque existiera un camino con `forceNewVersion` (hoy bloqueado antes en `regeneratePreliquidacion`).

---

## 4. Matriz de acciones (comportamiento actual)

Leyenda: **L** = LIVE `Cancellation` (+ cargos); **S** = snapshot activo; **T** = token activo de esa versión; **PDF** = snapshot activo + `totalOverride`.

| Acción | LIVE Cancellation | Snapshot | Token | PDF |
|--------|-------------------|----------|-------|-----|
| `add_charge` | Recalcula totales (**coherente con motor**) | **Sin cambio** | Sin cambio | **Sin cambio** |
| Modificar charge (admin) | Idem si persiste + recalc | **Sin cambio** | Sin cambio | Sin cambio |
| `delete_charge` | Recalc | **Sin cambio** | Sin cambio | Sin cambio |
| Recalcular liquidación (admin) | Recalc | **Sin cambio** | Sin cambio | Sin cambio |
| Generación inicial preliquidación | Copia totales al crear | **Crea S** desde motor | — | — |
| Regenerar (GENERADA/RECHAZADA) | Actualiza al crear | Nueva versión; anterior **SUPERSEDED** si no locked | — | Nueva versión |
| Regenerar (PENDIENTE/ENVIADA) | — | **Bloqueado** | T sigue V antigua | V antigua |
| Aprobar (token) | `BAJA_AUTORIZADA` | **APROBADA** inmutable | COMPLETADO | Aprobada |
| Rechazar (token) | `PRELIQUIDACION_RECHAZADA` | **RECHAZADA** | COMPLETADO | Rechazada |
| Enviar link | `PRELIQUIDACION_PENDIENTE` | → **PENDIENTE_APROBACION** | Crea T; cancela otros activos misma versión | — |
| Marcar enviado | `PRELIQUIDACION_ENVIADA` | → **ENVIADA** | ENVIADO | — |
| PDF autenticado | — | **S** | — | **S** |
| API pública GET token | — | **Versión ligada al token** | Valida `isActive`, expiración, estado S | — |

**Divergencia sistemática:** cualquier mutación de `CancellationCharge` **después** de existir **S** sin flujo de resincronización.

---

## 5. Alternativas A / B / C / D

### OPCIÓN A — Regenerar / refrescar snapshot automáticamente cuando sea legal

**Idea:** tras `add_charge` / edit / delete, invocar sync: o bien **reemplazar líneas** de la versión activa (solo estados “borrador contractual”), o **`generatePreliquidacion`** sin bump cuando `GENERADA`.

| Criterio | Evaluación |
|----------|------------|
| Integridad financiera | Alta si sync usa siempre `buildPreliquidacionLines` |
| Trazabilidad | Media-baja si mismo `version` se sobrescribe (auditoría debe registrar refresh) |
| UX | Excelente (automático) |
| P6 | OK si **APROBADA** excluida |
| Token/PDF/API | Riesgo si se muta versión ya ligada a token (**PENDIENTE_APROBACION**) |
| Concurrencia | Requiere transacción única cargo + sync |
| Doble cobro | Bajo (motor único) |
| Snapshot obsoleto | Elimina clase de bug en estados syncables |
| Complejidad | Media |

**Límite:** **no resuelve** caso 1524 sin extender reglas a estados con token emitido (A sola mutaría V1 con T1 activo → incoherencia legal).

### OPCIÓN B — Nueva versión cuando el snapshot ya fue emitido / compartido

**Idea:** estados `ENVIADA`, `PENDIENTE_APROBACION` (y opcionalmente post-envío): **V+1**, supersede V anterior, **cancelar tokens** de V anterior, `activePreliquidacionId` → V nueva, estado `GENERADA` o `PENDIENTE_APROBACION` solo tras nuevo link.

| Criterio | Evaluación |
|----------|------------|
| Integridad financiera | Alta |
| Trazabilidad | **Alta** (historial de versiones) |
| UX | Requiere reenvío de link; mensaje claro |
| P6 | **APROBADA** intacta |
| Token/PDF/API | T1 → `INVALID_STATE` / CANCELADO; T2 nuevo |
| Concurrencia | Encaja con transacción de `generatePreliquidacion` |
| Doble cobro | Bajo si un solo activo |
| Snapshot obsoleto | Eliminado para estados emitidos |
| Complejidad | Media-alta (ajustar supersede de LOCKED no aprobados) |

### OPCIÓN C — Bloquear `CancellationCharge` si snapshot no modificable

**Idea:** rechazar `add_charge` con 409 si `activePreliquidacion.status ∈ { ENVADA, PENDIENTE_APROBACION, APROBADA }`.

| Criterio | Evaluación |
|----------|------------|
| Integridad | Evita divergencia pero **bloquea operación legítima** |
| UX | **Mala** (caso 1524 imposible sin workaround manual) |
| P6 | OK |
| Caso real | **No cumple** requisito 6.12-J |

Descartada como solución principal; válida **solo** para `APROBADA` (complemento).

### OPCIÓN D — UI dual: mostrar LIVE en preliquidación sin tocar snapshot

**Idea:** panel contractual lee motor en vivo si “desincronizado”.

| Criterio | Evaluación |
|----------|------------|
| P6 / paridad API-PDF | **Violación** (fuentes distintas) |
| Regla 15 FASE 6.11 | Prohibido como fix principal |

Descartada.

---

## 6. Opción recomendada

### **Híbrido B + A acotado (una política unificada)**

Denominación: **“Sync contractual por motor, versión según madurez del snapshot”**.

| Clase de snapshot | Estados | Acción tras cambio de cargo |
|-------------------|---------|-----------------------------|
| **Sin snapshot** | — | Solo `recalculateCancellation` (hoy OK) |
| **Editable pre-emisión** | `GENERADA`, `RECHAZADA` | **A:** `syncActivePreliquidacionFromMotor()` — recalcular líneas y totales **misma versión** (o regenerar V+1 si se prefiere trazabilidad estricta; **misma versión** minimiza ruido) |
| **Emitida / en aprobación** | `ENVIADA`, `PENDIENTE_APROBACION` | **B:** nueva versión V+1, **SUPERSEDED** explícito de V anterior, cancelar tokens activos de V anterior, `activePreliquidacionId` → V nueva en `GENERADA`, UI obliga **nuevo enlace** antes de aprobación |
| **Aprobada (P6)** | `APROBADA` | **C parcial:** **rechazar** mutación de cargos que afecten contractual (409 + auditoría) o flujo excepcional fuera de alcance 6.13 |

**Motivo:** cumple caso 1524 (`PENDIENTE_APROBACION`), preserva P6, unifica PDF/API/admin en **un** snapshot vigente, no usa `pendingBalance`, no altera P1–P6 del motor.

---

## 7. Regla definitiva: `PENDIENTE_APROBACION + add_charge`

**Regla propuesta (inequívoca):**

1. Persistir `CancellationCharge` (como hoy).
2. Ejecutar `recalculateCancellation` (como hoy).
3. **Inmediatamente** ejecutar **`supersedeAndCreatePreliquidacionVersion`** (nombre lógico FASE 6.13):
   - Marcar preliquidación activa Vn (`PENDIENTE_APROBACION` o `ENVIADA`) como **`SUPERSEDED`**.
   - Cancelar todos los tokens activos de Vn (`status: CANCELADO`, `isActive: false`).
   - Crear Vn+1 con líneas desde `buildPreliquidacionLines`, estado **`GENERADA`**, nuevo `docNumber` según política de numeración existente.
   - Actualizar `Cancellation.activePreliquidacionId` y totales alineados al snapshot.
   - Auditoría: `PRELIQUIDACION_SUPERSEDED_CHARGE_SYNC`, `ADD_CHARGE`, detalle Vn→Vn+1.
4. UI admin/preliquidación: banner **“La preliquidación cambió; debe generar y enviar un nuevo enlace al cliente.”**
5. **No** permitir aprobación con token de Vn (ya `INVALID_STATE` por `SUPERSEDED`).

**Justificación con código actual:**

- Hoy `add_charge` está permitido (no hay guard).
- `PENDIENTE_APROBACION` ∈ `LOCKED_STATUSES` → no hay sync → divergencia garantizada.
- Token resuelve por **`preliquidacionId` fijo**; la única forma P6-compatible de cambiar montos es **nueva versión + invalidar T1**.

**No** actualizar V1 in-place con T1 activo (rompe trazabilidad de lo que el cliente vio).

---

## 8. Diseño de versionado

### Escenario: V1 total 0, token T1, luego `CancellationCharge` 22,40

| Elemento | Comportamiento diseñado |
|----------|-------------------------|
| V1 | `SUPERSEDED` (no borrar; histórico) |
| V2 | Creada; `otherAmount` y línea OTRO desde motor; `totalAmount` coherente |
| T1 | `CANCELADO`, `isActive: false`; approve/reject → error |
| T2 | Solo tras acción explícita “Generar enlace” sobre **V2** |
| Endpoint público | Token T1 → `INVALID_STATE`; T2 → payload V2 |
| PDF | `activePreliquidacionId` → V2 |
| Auditoría | V1 superseded reason=charge_sync; cargo ADD_CHARGE |

**Un solo vigente:** `Cancellation.activePreliquidacionId` único + última versión no superseded operativa.

**Gap código a cerrar en 6.13:** al supersede, incluir **`PENDIENTE_APROBACION` y `ENVIADA`** en rama que hoy no marca `SUPERSEDED` cuando `latest ∈ LOCKED_STATUSES` (excepto **`APROBADA`**, que nunca se supersede por cargo).

---

## 9. Diseño de tokens

- Tokens **pertenecen a una versión** (`preliquidacionId`); no cambian de versión.
- Al sync tipo B: `updateMany` tokens activos de Vn → `CANCELADO` (patrón ya usado en `generatePreliquidacionLink`).
- `resolvePreliquidacionToken` ya rechaza `preliquidacion.status === SUPERSEDED` → **T1 muerto** sin schema nuevo.
- Aprobación siempre persiste `approvedTotal` de **esa** versión (P6).
- Reenvío WhatsApp: solo sobre versión activa en `GENERADA` / tras regenerar link.

**Sin migración:** reutilizar `PreliquidacionApprovalToken` y estados existentes.

---

## 10. Diseño de concurrencia

### Escenario A: `add_charge` ∥ B: `generatePreliquidacion` ∥ C: `approve`

**Objetivo:** un solo snapshot activo coherente; no aprobar V obsoleta; no perder cargo.

**Reutilizar:**

- Transacciones Prisma ya usadas en `generatePreliquidacion` y `generatePreliquidacionLink`.
- Patrón `approvePreliquidacionViaToken`: valida token + estado preliquidación antes de transacción.

**Diseño mínimo FASE 6.13 (sin nuevo mecanismo si basta):**

1. Encapsular **cargo + sync snapshot** en **una transacción** `$transaction` por `cancellationId`.
2. Al inicio de sync/generate/approve: leer `activePreliquidacion` con **`SELECT … FOR UPDATE`** vía `$queryRaw` **solo si** en 6.13 se detectan carreras en pruebas; preferir primero **serialización lógica**:
   - `approve`: revalidar `preliquidacion.status === PENDIENTE_APROBACION | ENVIADA` y `preliquidacionId === cancellation.activePreliquidacionId`.
   - `generate`: si `activePreliquidacionId` cambió mid-flight, abortar con conflicto.
3. Orden recomendado de prioridad: **approve gana solo si versión sigue activa**; **add_charge** que supersede invalida approve posterior de token viejo.

**Riesgos mitigados:**

| Riesgo | Mitigación |
|--------|------------|
| Snapshot incompleto | Líneas siempre desde `buildPreliquidacionLines` post-commit cargo |
| Doble generación | Idempotencia: segunda sync misma versión GENERADA → overwrite líneas o skip si hash líneas igual |
| Dos activos | FK única `activePreliquidacionId` |
| Aprobar obsoleto | Token atado a V superseded → `INVALID_STATE` |
| Token incorrecto | Cancelación explícita al supersede |

---

## 11. Flujo objetivo

### Caso 1 — Cargo antes de generar snapshot

```text
Crear baja → add_charge 22,40 → generar preliquidación
→ OTRO = 22,40, TOTAL = 22,40 (motor; día 14 sin mensualidad siguiente)
```

### Caso 2 — Snapshot 0, luego cargo, estado modificable (`GENERADA`)

```text
Generar V1 (0) → add_charge 22,40
→ sync (A): V1 actualizada, TOTAL 22,40
→ UI contractual = Otros valores (coherente)
```

### Caso 3 — Preliquidación `APROBADA`, add_charge

```text
→ HTTP 409 CHARGE_LOCKED_APPROVED_SNAPSHOT
→ Snapshot aprobado sin cambios
→ Auditoría intento bloqueado
→ Flujo alterno: nota operativa / nueva solicitud (fuera de 6.13)
```

### Caso 4 — Cargo eliminado / modificado

- **GENERADA/RECHAZADA:** sync (A) → totales reflejan ausencia/cambio.
- **PENDIENTE_APROBACION/ENVIADA:** sync (B) → V+1 sin línea o monto actualizado.
- **APROBADA:** bloqueo.

### Caso 1524 (target post-fix)

```text
V1 PENDIENTE_APROBACION (0) + T1
→ add_charge MES DE SEPTIEMBRE 22,40
→ V1 SUPERSEDED, T1 CANCELADO, V2 GENERADA (OTRO 22,40, TOTAL 22,40)
→ operador genera T2 → cliente ve 22,40
```

---

## 12. Impacto Admin / API / Público / PDF (conceptual)

| Superficie | Cambio conceptual |
|------------|-------------------|
| **Otros valores** | Tras guardar, mostrar estado sync (“Preliquidación actualizada Vn+1” o error si aprobada) |
| **Liquidación contractual** | Sigue leyendo snapshot **activo** (ya alineado) |
| **TOTAL** | = `activePreliquidacion.totalAmount` |
| **PATCH cargos** | Orquestar sync post-recalc |
| **POST preliquidación** | Sin cambio de contrato; puede coexistir con auto-sync |
| **API token pública** | Sin cambio de shape; datos = versión del token |
| **Aprobación** | Solo versión no superseded |
| **PDF** | Sigue `lineItems` + `totalOverride` del activo |

**No** recalcular solo PDF/API sin tocar snapshot.

---

## 13. Auditoría

Eventos a registrar (FASE 6.13):

| Evento | Cuándo |
|--------|--------|
| `ADD_CHARGE` / `DELETE_CHARGE` | Ya parcialmente |
| `PRELIQUIDACION_SYNCED` | Refresh misma versión (A) |
| `PRELIQUIDACION_SUPERSEDED_CHARGE_SYNC` | V→V+1 por cargo (B) |
| `PRELIQUIDACION_TOKEN_CANCELLED` | Tokens V anterior |
| `CHARGE_CHANGE_BLOCKED_APPROVED` | Intento sobre APROBADA |

Detalle: `cancellationId`, versiones, montos before/after, userId.

---

## 14. Casos de prueba (futura implementación)

| ID | Descripción | Assert clave |
|----|-------------|--------------|
| **TEST 1** | Caso 1524: `requestDate` 2026-09-14, charge 22.40, preliq pendiente | TOTAL 22.40; sin mensualidad siguiente |
| **TEST 2** | Charge antes de generar | Snapshot OTHER 22.40 |
| **TEST 3** | V1 0 GENERADA → add charge | Sync A; TOTAL 22.40 misma versión o V2 según implementación acordada |
| **TEST 4** | APROBADA 0 → add charge | 409; snapshot 0 |
| **TEST 5** | PDF | Igual snapshot activo |
| **TEST 6** | API token vigente | JSON = activo |
| **TEST 7** | Token V1 tras V2 | approve T1 falla; GET T1 `INVALID_STATE` |
| **TEST 8** | OTRO-B | OTHER 15 |
| **TEST 9** | OTRO-C | OTHER 30, 2 líneas |
| **TEST 10** | Add 22.40 → delete | Snapshot coherente con 0 |
| **TEST 11** | Paralelo add_charge + approve | No aprobar total obsoleto |
| **TEST 12** | FASE 5: 15 vs 16 sept | 15 sin next month; 16 con regla existente |

Implementación sugerida: extender `test-baja-liquidation-p1-p6.ts` (unit) + E2E API en `scripts/` o test de integración con DB efímera.

---

## 15. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Cliente aprueba enlace viejo | SUPERSEDED + token cancelado |
| Confusión operativa V1/V2 | Banner + auditoría |
| Numeración doc | Política clara: nuevo docNumber en V+1 (B) |
| Regresión P1–P6 | TEST 8–9–12; no tocar motor salvo orquestación |
| Supersede incorrecto de APROBADA | Guard explícito |
| Carreras | Transacción + revalidación active id en approve |

---

## 16. Plan exacto FASE 6.13 — IMPLEMENTACIÓN

1. **Servicio central** `syncPreliquidacionAfterChargeChange(cancellationId, userId, reason)` en `preliquidaciones.ts`:
   - Leer activo; ramificar A vs B vs block (APROBADA).
   - B: supersede + cancel tokens + create V+1 (extraer de `generatePreliquidacion` con flag `supersedeLocked: true`).
   - A: transaction replace `lineItems` + summary fields on active id.
2. **Wire:** `add_charge`, `delete_charge`, `updateCancellationAdmin` (charges) → llamar sync si existe activo.
3. **API errors:** `CHARGE_SYNC_VERSION_LOCKED`, `CHARGE_SYNC_APPROVED` con mensajes UI.
4. **UI:** `preliquidacion-panel` + admin banner; deshabilitar “Enviar” hasta V coherente post-sync.
5. **Tests TEST 1–12** automatizados.
6. **Docs:** actualizar FASE-3/regresión si aplica.
7. **No** schema migration salvo que auditoría requiera campo opcional (preferir audit log existente).

**Archivos previstos (6.13):**

- `src/lib/services/preliquidaciones.ts` (core)
- `src/app/api/cancellations/[id]/route.ts`
- `src/lib/services/cancellations.ts` (admin charges)
- Componentes bajas (mensajes)
- `scripts/test-baja-liquidation-p1-p6.ts` o nuevo script E2E

---

## 17. Criterio de aceptación (6.12-J) — checklist diseño

| Requisito | Cubierto por diseño |
|-----------|---------------------|
| CancellationCharge → motor | Sí (sin cambio motor) |
| Preliquidación no obsoleta | Sync A/B |
| P6 intacto | APROBADA bloqueada |
| Un snapshot activo | FK + supersede |
| Tokens no obsoletos | Cancel + INVALID_STATE |
| PDF/API/Admin misma fuente | Snapshot activo |
| No pendingBalance | Sí |
| No regla fija 22.40 | Sí |
| No duplicar obligaciones | Motor OTRO-C intacto |
| FASE 5 día 1–15 / 16+ | Sin cambio |
| Trazabilidad | Auditoría |
| E2E | TEST 1–7 |

---

## VEREDICTO FASE 6.12

```text
READY FOR FASE 6.13 IMPLEMENTATION
```

---

*Documento generado en FASE 6.12 — solo diseño; sin cambios de código de aplicación fuera de este markdown.*
