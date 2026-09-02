# Pruebas de integración (Infinity Bajas)

Las pruebas que requieren PostgreSQL **no usan producción**. Configure una BD local exclusiva:

```env
DATABASE_URL="postgresql://postgres:SU_PASSWORD@localhost:5432/infinity_bajas_test"
JWT_SECRET="local-test-jwt-secret-min-32-characters"
SEED_DEFAULT_PASSWORD="solo-desarrollo-local"
```

**NO** usar URLs de Render, Neon, Supabase ni producción.

## Bootstrap (primera vez, BD vacía)

```powershell
# Crear base de datos (psql)
psql -U postgres -h localhost -c "CREATE DATABASE infinity_bajas_test;"

# Bootstrap schema + migraciones + seed
npm run db:bootstrap-test
```

Alternativa si el schema ya existe:

```bash
npm run db:migrate
npm run db:seed
```

## Comandos

| Script | Comando | Requiere BD |
|--------|---------|-------------|
| Permanencia | `npm run test:permanence` | No |
| Snapshot | `npm run test:permanence-config` | No |
| Validación meses | `npm run test:permanence-months` | No |
| Rutas baja | `npm run test:baja-paths` | No |
| Cierre AUD-007–015 | `npm run test:audit-closure` | No |
| Fechas negocio | `npm run test:business-date` | No |
| P1 closure | `npm run test:p1-closure` | No |
| **P1.6 integración** | `npm run test:p16-integration` | **Sí** |
| Concurrencia bajas | `npm run test:cancellation-concurrency` | Sí |
| Flujo preliquidación | `npm run test:preliquidacion` | Sí |
| Bootstrap TEST | `npm run db:bootstrap-test` | Sí |

Los scripts de integración **fallan** (exit 1) si `DATABASE_URL` no está configurada — no reportan SKIP.
