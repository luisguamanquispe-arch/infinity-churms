# Despliegue en Render — Infinity Bajas

## Servicios (no compartir con Hoteles)

| Recurso | Nombre Render | Base PostgreSQL |
|---------|---------------|-----------------|
| Web | `infinity-bajas` | — |
| BD | `infinity-bajas` | `infinity_bajas` |

Hoteles usa **`infinity-db`** / `infinity_hoteles` — es otra base distinta.

## Crear BD Free en cuenta nueva de Render

Solo puedes tener **1 base PostgreSQL Free** por cuenta. **Expira a los 30 días** (luego hay 14 días para pagar o se borra).

### Paso 1 — Crear PostgreSQL Free

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **PostgreSQL**
2. Completar:
   - **Name:** `infinity-bajas`
   - **Database:** `infinity_bajas`
   - **User:** `infinity`
   - **Region:** Oregon (misma región que usará el web)
   - **PostgreSQL Version:** la más reciente
   - **Instance Type:** **Free**
3. **Create Database** → esperar estado **Available**
4. En la BD → pestaña **Info** → copiar **Internal Database URL**

### Paso 2 — Crear Web Service Free (si aún no existe)

1. **New +** → **Web Service**
2. Conectar repo GitHub: `luisguamanquispe-arch/infinity-churms`
3. Configurar:
   - **Name:** `infinity-bajas`
   - **Region:** Oregon
   - **Branch:** `main`
   - **Runtime:** Node
   - **Instance Type:** **Free**
   - **Build Command:** `npm ci --include=dev && npm run render:build`
   - **Start Command:** `npm run render:start`
4. **Environment Variables:**
   - `DATABASE_URL` → pegar **Internal Database URL** de la BD
   - `JWT_SECRET` → texto aleatorio largo (ej. `infinity-bajas-jwt-2026-secreto`)
   - `NODE_VERSION` → `20`
   - `NEXT_PUBLIC_APP_URL` → la URL que Render asigne (ej. `https://infinity-bajas.onrender.com`)
5. **Create Web Service**

### Paso 3 — Probar

Tras el deploy (5–10 min, primera vez puede tardar más si el servicio Free estaba dormido):

- `/api/health` → `{"database":"connected"}`
- `/login` → pantalla de ingreso

### Alternativa: Blueprint (crea web + BD juntos)

**Blueprints** → **New Blueprint Instance** → repo `infinity-churms` → Render lee `render.yaml` y crea todo con plan **Free**.

## Crear la base de datos en Render (si no aparece `infinity-bajas`)

El archivo `render.yaml` define la BD, pero **solo se crea automáticamente** si despliegas con **Blueprint**. Si el servicio web se creó a mano, la BD hay que crearla aparte:

### Opción A — Manual (recomendada si ya tiene el servicio web)

1. [Dashboard Render](https://dashboard.render.com) → **New +** → **PostgreSQL**
2. Configurar:
   - **Name:** `infinity-bajas`
   - **Database:** `infinity_bajas`
   - **User:** `infinity` (o el que prefiera)
   - **Region:** Oregon (igual que el servicio web)
   - **Plan:** Basic o el que tenga disponible
3. Crear → esperar a que quede **Available**
4. Abrir el servicio web **infinity-bajas** (o `infinity-bajas-abfs`)
5. **Environment** → **Add Environment Variable**
   - Key: `DATABASE_URL`
   - Value: pegar **Internal Database URL** (desde la BD recién creada)
6. Verificar también:
   - `JWT_SECRET` → cualquier texto largo aleatorio
   - `NEXT_PUBLIC_APP_URL` → URL pública del servicio (ej. `https://infinity-bajas-abfs.onrender.com`)
7. **Manual Deploy** → Deploy latest commit

### Opción B — Blueprint (crea web + BD juntos)

1. Dashboard → **Blueprints** → **New Blueprint Instance**
2. Conectar repo `luisguamanquispe-arch/infinity-churms`
3. Render leerá `render.yaml` y creará **infinity-bajas** (web) + **infinity-bajas** (PostgreSQL)
4. Si ya existe un servicio web con el mismo nombre, puede pedir otro nombre o eliminar el duplicado antes

### Importante

- **No usar** la BD de hoteles (`infinity-db` / `infinity_hoteles`)
- Tras el deploy, `/api/health` debe responder `{"database":"connected"}`

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
