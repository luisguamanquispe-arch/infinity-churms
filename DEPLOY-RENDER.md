# Despliegue en Render — Infinity Bajas

## Servicios (no compartir con Hoteles)

| Recurso | Nombre Render | Base PostgreSQL |
|---------|---------------|-----------------|
| Web | `infinity-bajas` | — |
| BD | `infinity-bajas` | `infinity_bajas` |

Hoteles usa **`infinity-db`** / `infinity_hoteles` — es otra base distinta.

## Comandos (render.yaml)

- **Build:** `npm ci --include=dev && npm run render:build`
- **Start:** `npm run render:start` (migraciones + seed + Next.js)
- **Health:** `GET /api/health` → `{ "database": "connected" }`

## Si la URL devuelve 404

1. [Dashboard Render](https://dashboard.render.com) → servicio **infinity-bajas**
2. **Settings → Build & Deploy**
   - Runtime: **Node**
   - Build Command: igual que arriba
   - Start Command: `npm run render:start`
   - Root Directory: vacío (raíz del repo)
3. **Environment**
   - `DATABASE_URL` → linked a BD **infinity-bajas** (no `infinity-db`)
   - `JWT_SECRET` → generado
4. **Logs** → pestaña *Deploy* del último build: buscar error en build o start
5. Tras deploy OK, probar:
   - `https://<su-url>.onrender.com/api/health`
   - `https://<su-url>.onrender.com/login`

## Login producción

- `admin@infinity.net` / `admin2010`
- `supervisor@infinity.net` / `admin2010`
