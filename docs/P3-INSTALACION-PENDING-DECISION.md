# P3 / INSTALACION con installAmountCalculated = 0

## Decisión aprobada

**DECISIÓN B — APROBADA**

Cuando:

```text
installAmountCalculated = 0
y
existe CollectionCharge(INSTALACION) pendiente > 0
```

la deuda `INSTALACION` **NO** forma parte del total de Baja.

No genera `PERMANENCIA` ni línea dentro de la preliquidación de Baja.

La obligación debe ser gestionada mediante Cobranzas.

Esta regla es una **decisión de negocio aprobada** y no un comportamiento accidental del código.

**Fecha de autorización:** 2026-09-10

---

## Regla implementada

```text
installationNet =
  max(0, installAmountCalculated - INSTALACION_pending_P1)

PERMANENCIA = installationNet   (solo si installationNet > 0)
```

Con Decisión B, cuando `installAmountCalculated = 0`:

```text
installationNet = max(0, 0 - INSTALACION_pending_P1) = 0
PERMANENCIA = 0
```

Aunque `INSTALACION_pending_P1 > 0`, ese saldo:

- **no** crea línea `PERMANENCIA`
- **no** crea línea `INSTALACION` en la preliquidación
- **no** se convierte en `OTRO` (INSTALACION no está en `OTHER_COLLECTION_CHARGE_TYPES`)
- **no** incrementa `subtotal` ni `totalAmount` de Baja

---

## Ejemplo obligatorio (Decisión B)

```text
CONSUMO_MENSUAL = 40
INSTALACION pending = 50
STREAMS = 30
PAGO = 30
installAmountCalculated = 0
```

Atribución P1:

```text
PAGO 30 → CONSUMO_MENSUAL
CONSUMO neto = 10
INSTALACION pending = 50  (fuera de Baja)
STREAMS = 30
```

Resultado en preliquidación de Baja:

```text
installationNet = 0
PERMANENCIA = 0
sin línea INSTALACION
TOTAL = 10 + 30 = 40
```

**No** 90, **no** 50, **no** 10 (solo consumo).

---

## P3 A–D (sin cambio)

| Caso | installAmount | INSTALACION pending P1 | PERMANENCIA |
|------|---------------|------------------------|-------------|
| A | 100 | 0 | 100 |
| B | 100 | 30 | 70 |
| C | 100 | 100 | 0 |
| D | 100 | 120 | 0 |
| E (Decisión B) | 0 | 50 | 0 |

---

## Separación funcional Baja vs Cobranzas

```text
Baja = liquidación de obligaciones que corresponden al cierre de Baja.

Cobranzas = gestión de obligaciones INSTALACION que no generan
            installAmountCalculated dentro de Baja.
```

En el sistema, la deuda `INSTALACION` pendiente se gestiona en el módulo de Cobranzas del cliente:

- Menú: **Clientes · Cobranza**
- Pantalla: ficha del cliente → pestaña **Gestión de Cobranza**
- Componentes: `CollectionChargesPanel` (cargos `CollectionCharge`, incluido tipo `INSTALACION`) y `CollectionPaymentsPanel` (pagos que P1 atribuye por prioridad)

No se inventan procesos adicionales: la obligación permanece registrada como `CollectionCharge(INSTALACION)` en Cobranzas hasta su cobro o regularización fuera del flujo de preliquidación de Baja.

---

## Tratamiento de pagos

P1 sigue atribuyendo pagos a `INSTALACION` en prioridad 3. Eso reduce el saldo pendiente de Cobranzas, pero **no** genera línea ni monto en Baja cuando `installAmountCalculated = 0`.

---

## Tratamiento de instalación / permanencia

Solo cuando `installationNet > 0` se crea la línea contractual `PERMANENCIA` con monto `installationNet`.

Con Decisión B y `installAmountCalculated = 0`, `installationNet` siempre es 0 independientemente del saldo `INSTALACION` en Cobranzas.

---

## Prevención de doble contabilización

- `INSTALACION_pending_P1` se descuenta de `installAmountCalculated` para calcular `installationNet`; no se expone como línea separada.
- Con `installAmountCalculated = 0`, no hay PERMANENCIA ni línea OTRO derivada de INSTALACION.
- Un mismo saldo **no** puede aparecer simultáneamente como INSTALACION + PERMANENCIA + OTRO en la preliquidación de Baja.

---

## Impacto sobre P3

P3 estricta se mantiene intacta. Decisión B es la consecuencia directa de:

```text
installationNet = max(0, 0 - INSTALACION_pending) = 0
```

No se reintroduce `permanenceLineAmount` ni penalización independiente (P4).

---

## Fórmula general del total (sin cambio)

```text
TOTAL =
  max(
    0,
    mensualidadesNet
    + installationNet
    + streamsNet
    + equipos
    + otros
    - créditos
  )
```

Prohibido usar como shortcut: `22.40`, `pendingBalance`, `planMonthlyUsd`, `Cancellation.monthlyAmount`.
