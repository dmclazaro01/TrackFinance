# TrackFinance

Panel de patrimonio personal **en tiempo real**. Reúne salario, propiedades e
hipotecas (con TIN y plazo), fondos y ETFs por **ISIN**, acciones con su **precio
medio de compra** y efectivo, y calcula tu **patrimonio neto** con cotizaciones de
mercado actualizadas al minuto. Login con **Google**, desplegable en **Vercel**.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Auth.js (NextAuth v5)** con proveedor Google (sesiones JWT)
- **Prisma 7** + PostgreSQL (driver adapter `@prisma/adapter-pg`)
- **yahoo-finance2** para cotizaciones y tipos de cambio en tiempo real
- **Recharts** para los gráficos

## Funcionalidades

- Patrimonio neto = inmuebles + inversiones + efectivo − hipotecas − deudas.
- Inversiones con precio en vivo, P/L latente por posición y variación del día.
- Búsqueda de activos por **nombre, ticker o ISIN** (fondos y ETFs incluidos).
- Conversión automática de divisas a tu divisa base.
- Hipotecas y préstamos: cuota mensual calculada desde capital, TIN y plazo.
- Flujo mensual: ingresos − (gastos + cuotas) = ahorro estimado.
- **Tasación online de inmuebles**: con la referencia catastral, estima el valor a
  diario (m² del **Catastro** × €/m² de la provincia) vía **Vercel Cron**, con
  histórico. Es una estimación, no una tasación oficial; el €/m² por provincia
  (`src/data/pricePerM2.ts`) es un dataset editable — sustitúyelo por el oficial
  del Ministerio de Vivienda para más precisión.
- Datos privados por usuario; refresco automático cada 30 s.

---

## Puesta en marcha (local)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Base de datos PostgreSQL

Usa un Postgres gratuito de [Neon](https://neon.tech) o [Vercel Postgres](https://vercel.com/storage/postgres).
Copia la cadena de conexión **pooled**.

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Rellena `.env.local`:

- `DATABASE_URL` — cadena de conexión de Postgres.
- `AUTH_SECRET` — genera uno con `npx auth secret`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — ver siguiente sección.

> Para los comandos de Prisma (migraciones) también necesitas `DATABASE_URL`
> disponible; ponla además en `.env` o expórtala en tu shell.

### 4. Credenciales de Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → crea un proyecto.
2. **APIs y servicios → Pantalla de consentimiento OAuth** → tipo *Externo*,
   añade tu email como usuario de prueba.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
4. **Orígenes autorizados de JavaScript**:
   - `http://localhost:3001`
   - `https://TU-APP.vercel.app`
5. **URIs de redirección autorizados**:
   - `http://localhost:3001/api/auth/callback/google`
   - `https://TU-APP.vercel.app/api/auth/callback/google`
6. Copia el *Client ID* y *Client secret* a `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### 5. Crear las tablas

```bash
npm run db:push
```

(o `npx prisma migrate dev --name init` si prefieres migraciones versionadas).

### 6. Arrancar

```bash
npm run dev
```

Abre <http://localhost:3001> e inicia sesión con Google.

---

## Despliegue en Vercel

1. Sube el repositorio a GitHub e **importa el proyecto en Vercel**
   (framework detectado: Next.js).
2. En **Settings → Environment Variables** añade:
   `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` y
   `CRON_SECRET` (una cadena aleatoria; protege el cron de tasación diaria).
3. Añade la URL de producción a los orígenes y redirecciones de Google OAuth
   (paso 4.4 / 4.5).
4. Ejecuta las migraciones contra la BD de producción una vez:
   ```bash
   DATABASE_URL="<prod-url>" npm run db:push
   ```
5. **Deploy**. `prisma generate` se ejecuta automáticamente en `postinstall`.

---

## Estructura

```
src/
  app/
    page.tsx                landing
    login/                  página de acceso
    dashboard/              panel (protegido)
    actions.ts              server actions (CRUD)
    api/
      auth/[...nextauth]/   handler de Auth.js
      search/               búsqueda de símbolos/ISIN
      portfolio/live/       snapshot en vivo (polling)
  auth.ts / auth.config.ts  configuración de Auth.js (split edge-safe)
  proxy.ts                  protección de rutas (/dashboard)
  lib/
    prisma.ts               cliente Prisma (adapter pg)
    finance.ts              yahoo-finance2 (quotes, search, FX)
    calc.ts                 cálculos de portfolio (puros)
    portfolio.ts            carga + enriquece el snapshot del usuario
  components/               UI (Dashboard, formularios, etc.)
prisma/schema.prisma        modelos
```

## Aviso

Los datos de mercado provienen de Yahoo Finance y pueden tener retraso. Esta
aplicación es solo informativa y **no constituye asesoramiento financiero**.
