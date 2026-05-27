# Agente personal (MVP)

Monorepo con **Next.js**, **Supabase**, **LangGraph** y **OpenRouter**. Incluye chat web, onboarding, ajustes y bot de **Telegram** (opcional).

## Requisitos previos

- **Node.js** 20 o superior (recomendado LTS).
- **npm** 10+ (incluido con Node.js 20+).
- Cuenta en **[Supabase](https://supabase.com)** (gratis).
- Cuenta en **[OpenRouter](https://openrouter.ai)** para la API del modelo (clave de API).
- *(Opcional)* Bot de Telegram creado con [@BotFather](https://t.me/BotFather) y una URL **HTTPS** pública para el webhook (en local suele usarse **ngrok** o similar).

---

## Paso 1 — Clonar e instalar dependencias

```bash
cd projects/10x-builders-agent
npm install
```

---

## Paso 2 — Crear proyecto en Supabase

1. Entra en el [dashboard de Supabase](https://supabase.com/dashboard) y crea un **nuevo proyecto**.
2. Espera a que termine el aprovisionamiento.
3. En **Project Settings → API** anota:
   - **Project URL** → será `NEXT_PUBLIC_SUPABASE_URL`
   - **`anon` public** → será `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **`service_role` secret** → será `SUPABASE_SERVICE_ROLE_KEY` (no la expongas al cliente ni la subas a repositorios públicos).

---

## Paso 3 — Aplicar el esquema SQL (tablas + RLS)

1. En Supabase, abre **SQL Editor**.
2. Ejecuta **en orden** los archivos de migración:

   | Migración | Archivo | Descripción |
   |-----------|---------|-------------|
   | 1 | `packages/db/supabase/migrations/00001_initial_schema.sql` | Tablas base, RLS, trigger de perfil |
   | 2 | `packages/db/supabase/migrations/00002_github_integration.sql` | Columnas de GitHub en `user_integrations`, trigger `updated_at` |

3. Copia el contenido de cada archivo y pégalo en el editor SQL. Ejecuta uno a la vez.

Si algo falla (por ejemplo, el trigger `on_auth_user_created` en un proyecto ya modificado), revisa el mensaje de error; en la mayoría de proyectos nuevos el script aplica de una vez.

---

## Paso 4 — Configurar autenticación (email)

1. En Supabase: **Authentication → Providers** → habilita **Email** (por defecto suele estar activo).
2. **Authentication → URL configuration**:
   - **Site URL**: para desarrollo local usa `http://localhost:3000`
   - **Redirect URLs**: añade al menos:
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/**` (o la variante que permita tu versión del dashboard para desarrollo)

Así el flujo de login/signup y el intercambio de código en `/auth/callback` funcionan en local.

---

## Paso 5 — Variables de entorno

Next.js carga `.env*` desde el directorio de la app **`apps/web`**, no desde la raíz del monorepo.

1. Copia el ejemplo:

   ```bash
   cp .env.example apps/web/.env.local
   ```

   *(Si ya tienes `.env.local` en la raíz, mueve o copia ese archivo a `apps/web/.env.local`.)*

2. Edita `apps/web/.env.local` y completa:

   | Variable | Descripción |
   |----------|-------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave `anon` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (solo servidor) |
   | `OPENROUTER_API_KEY` | Clave de OpenRouter |
   | `OPENROUTER_MODEL` | Slug del modelo principal del agente en OpenRouter (ej. `openai/gpt-oss-120b:free`) |
   | `OPENROUTER_COMPACTION_MODEL` | Slug del modelo dedicado a compactar el historial (memoria a corto plazo del agente). Diseño en [docs/features/compaction/plan.md](docs/features/compaction/plan.md) |
   | `OAUTH_ENCRYPTION_KEY` | Clave para cifrar/descifrar tokens OAuth de terceros (AES-256-GCM). Genera con `openssl rand -base64 32` |
   | `GITHUB_CLIENT_ID` | *(Opcional)* Client ID de la GitHub OAuth App |
   | `GITHUB_CLIENT_SECRET` | *(Opcional)* Client Secret de la GitHub OAuth App |
   | `GOOGLE_CLIENT_ID` | *(Opcional)* Client ID del OAuth Client de Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | *(Opcional)* Client Secret del OAuth Client de Google |
   | `NEXT_PUBLIC_APP_URL` | *(Opcional)* URL base de la app (default: `http://localhost:3000`). Necesario para el callback de GitHub y Google OAuth |
   | `TELEGRAM_BOT_TOKEN` | *(Opcional)* Token del bot de Telegram |
   | `TELEGRAM_WEBHOOK_SECRET` | *(Opcional)* Secreto para validar webhooks de Telegram |
   | `ALLOW_BASH_TOOL` | *(Opcional, gate)* `true`/`1` para exponer la tool `bash` (riesgo alto, HITL). Sin esta variable la tool **no se registra** aunque el usuario la tenga habilitada. Diseño en [docs/features/bash-tool/plan.md](docs/features/bash-tool/plan.md) |
   | `ALLOW_FILE_TOOLS` | *(Opcional, gate)* `true`/`1` para exponer las tools `read_file`, `write_file` y `edit_file`. Sin esta variable las tres tools **no se registran**. Diseño en [docs/features/file-tools/plan.md](docs/features/file-tools/plan.md) |
   | `FILE_TOOLS_WORKSPACE_ROOT` | *(Opcional)* Si se define, las file tools confinan toda ruta dentro de ese root y aceptan paths relativos resueltos contra él. Sin definir, solo se aceptan paths absolutos y el alcance lo dictan los permisos del proceso (úsalo solo en entornos confiables) |
   | `FILE_TOOL_MAX_BYTES` | *(Opcional)* Cap defensivo de bytes para `read_file`/`write_file`/`edit_file`. Default `1000000` |

Referencia de nombres: [.env.example](.env.example).

---

## Paso 6 — Arrancar la aplicación web

Desde la **raíz** del repo:

```bash
npm run dev
```

Por defecto Turbo ejecuta el `dev` de cada paquete; la app suele quedar en **http://localhost:3000**.

Flujo esperado:

1. **Registro** en `/signup` o **login** en `/login`.
2. **Onboarding** (perfil, agente, herramientas, revisión).
3. **Chat** en `/chat` y **ajustes** en `/settings`.

---

## Paso 7 — Probar el chat con el modelo

1. Confirma que `OPENROUTER_API_KEY` está en `apps/web/.env.local`.
2. En el onboarding, activa al menos las herramientas básicas (`get_user_preferences`, `list_enabled_tools`) si quieres probar *tool calling*.
3. Escribe un mensaje en `/chat`. Si la clave o el modelo fallan, revisa la consola del servidor (terminal donde corre `npm run dev`).

El modelo por defecto está definido en `packages/agent/src/model.ts` (OpenRouter, `openai/gpt-4o-mini`). Puedes cambiarlo ahí si lo necesitas.

---

## Paso 8 — GitHub (opcional)

Para que el agente opere sobre GitHub (listar repos, listar issues, crear issues, crear repos), el usuario debe conectar su cuenta de GitHub desde la pantalla de Ajustes.

### Configurar la GitHub OAuth App

1. Ve a [GitHub → Settings → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/developers).
2. Rellena:
   - **Application name**: nombre libre (ej. "10x Agent Dev").
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`
3. Al crear la app, copia el **Client ID** → `GITHUB_CLIENT_ID`.
4. Genera un **Client Secret** → `GITHUB_CLIENT_SECRET`.
5. Añade ambos a `apps/web/.env.local` y reinicia el servidor.
6. En la web: **Ajustes → Integraciones → GitHub → Conectar**.

Para detalles sobre el diseño de la integración (cifrado de tokens, flujo de confirmación, niveles de riesgo), ver [docs/features/github/README.md](docs/features/github/README.md).

---

## Paso 9 — Google Calendar (opcional)

Para que el agente opere sobre Google Calendar (listar, crear, modificar y eliminar eventos, incluyendo series recurrentes), el usuario debe conectar su cuenta de Google desde Ajustes.

### Configurar el OAuth Client en Google Cloud Console

1. Ve a [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Habilita la **Google Calendar API** en el proyecto si aún no lo está.
3. **Create Credentials → OAuth client ID → Web application**.
4. **Authorized redirect URIs**: `http://localhost:3000/api/auth/google/callback`.
5. Copia el **Client ID** → `GOOGLE_CLIENT_ID` y el **Client Secret** → `GOOGLE_CLIENT_SECRET` en `apps/web/.env.local`.
6. En la web: **Ajustes → Google → Conectar Google**.

El agente pide los scopes `openid email https://www.googleapis.com/auth/calendar.events`. El access token se renueva automáticamente con el refresh token cuando expira (~1h).

Para detalles sobre el diseño (recurrencias, scope instance/series, refresh flow), ver [docs/features/calendar/README.md](docs/features/calendar/README.md).

---

## Paso 10 — Telegram (opcional)

Telegram **exige HTTPS** para webhooks. En local:

1. Crea el bot con BotFather y copia el token → `TELEGRAM_BOT_TOKEN` en `apps/web/.env.local`.
2. Elige un secreto aleatorio → `TELEGRAM_WEBHOOK_SECRET` (mismo valor usarás al registrar el webhook).
3. Expón tu app local con un túnel HTTPS, por ejemplo:

   ```bash
   ngrok http 3000
   ```

   Usa la URL HTTPS que te dé ngrok (p. ej. `https://abc123.ngrok-free.app`).

4. Con la app en marcha, visita en el navegador (sustituye la URL base):

   `https://TU_URL_NGROK/api/telegram/setup`

   Eso llama a `setWebhook` de Telegram apuntando a `/api/telegram/webhook` y, si definiste secreto, lo asocia al webhook.

5. En la web, entra a **Ajustes** → **Telegram** → **Generar código de vinculación**.
6. En Telegram, envía al bot: `/link TU_CODIGO` (el código que te muestra la web).

Después de vincular, los mensajes al bot usan el mismo pipeline que el chat web.

---

## Paso 11 — Tareas programadas (opcional)

Permite que el agente ejecute prompts de forma recurrente. Documentación completa en [docs/features/scheduled-tasks/README.md](docs/features/scheduled-tasks/README.md).

### Variables de entorno

```env
# apps/web/.env.local
ALLOW_SCHEDULED_TASKS_TOOL=true
CRON_SECRET=  # openssl rand -hex 32
```

### Habilitar pg_cron en Supabase

1. **Dashboard → Database → Extensions**: activar `pg_cron` y `pg_net`.
2. **Dashboard → SQL Editor**, ejecutar **una sola vez**:

   ```sql
   select cron.schedule(
     'scheduled-tasks-tick',
     '* * * * *',
     $$
       select net.http_post(
         url     := 'https://TU_DOMINIO/api/scheduled-tasks/tick',
         headers := jsonb_build_object(
                      'Content-Type', 'application/json',
                      'x-cron-secret', 'PEGAR_AQUI_EL_VALOR_DE_CRON_SECRET'
                    ),
         body    := '{}'::jsonb
       ) as request_id;
     $$
   );
   ```

   En dev local, `TU_DOMINIO` es la URL pública del túnel ngrok.

3. Verifica que el job está activo:

   ```sql
   select * from cron.job;
   select * from cron.job_run_details order by start_time desc limit 5;
   ```

4. Prueba creando una tarea desde el chat: *"programa una tarea cada minuto que me diga 'ping'"*. Aprueba la tarjeta HITL y espera al siguiente minuto.

Para apagar: `select cron.unschedule('scheduled-tasks-tick');`. Detalles operativos (rotación del secret, debug de disparos, modo `autonomous`) en [docs/features/scheduled-tasks/README.md](docs/features/scheduled-tasks/README.md).

---

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo (monorepo) |
| `npm run build` | Build de todos los paquetes que definan `build` |
| `npm run lint` | Lint |
| `cd apps/web && npx next build` | Build solo de la app Next (útil para comprobar tipos antes de desplegar) |

---

## Documentación adicional

- [docs/brief.md](docs/brief.md) — visión y brief original.
- [docs/architecture.md](docs/architecture.md) — arquitectura técnica del MVP.
- [docs/plan.md](docs/plan.md) — fases y decisiones de implementación.
- [docs/features/github/README.md](docs/features/github/README.md) — diseño de la integración de GitHub (OAuth, cifrado, confirmaciones).
- [docs/features/calendar/README.md](docs/features/calendar/README.md) — diseño de la integración de Google Calendar (OAuth, refresh, recurrencias).
- [docs/features/calendar/brief.md](docs/features/calendar/brief.md) — brief inicial de la integración de Google Calendar.
- [docs/features/calendar/plan.md](docs/features/calendar/plan.md) — plan de implementación de Google Calendar.
- [docs/features/hitl/plan.md](docs/features/hitl/plan.md) — plan del flujo human-in-the-loop con `interrupt()`.
- [docs/features/bash-tool/plan.md](docs/features/bash-tool/plan.md) — plan de la tool `bash` (gate `ALLOW_BASH_TOOL`, HITL).
- [docs/features/file-tools/plan.md](docs/features/file-tools/plan.md) — plan de las file tools `read_file`/`write_file`/`edit_file` (gate `ALLOW_FILE_TOOLS`, sandbox opcional).
- [docs/features/scheduled-tasks/plan.md](docs/features/scheduled-tasks/plan.md) — plan de tareas programadas (decisiones, schema, trade-offs).
- [docs/features/scheduled-tasks/README.md](docs/features/scheduled-tasks/README.md) — guía de uso, setup de pg_cron y operación de tareas programadas.
- [docs/features/compaction/plan.md](docs/features/compaction/plan.md) — plan de la memoria a corto plazo del agente (compaction_node, microcompact + LLM compaction, circuit breaker).
- [CHANGELOG.md](CHANGELOG.md) — historial de cambios.

---

## Problemas frecuentes

- **Redirecciones infinitas o “no auth”**: revisa `Site URL` y `Redirect URLs` en Supabase y que `.env.local` esté en **`apps/web`**.
- **Errores al guardar perfil o mensajes**: confirma que ejecutaste la migración SQL y que RLS no bloquea por falta de sesión (debes estar logueado con el mismo usuario).
- **Chat sin respuesta / 500 en `/api/chat`**: `OPENROUTER_API_KEY`, cuota en OpenRouter o modelo en `model.ts`.
- **Telegram no responde**: webhook debe ser HTTPS; token y secreto correctos; visita de nuevo `/api/telegram/setup` si cambias la URL pública.

Si quieres, el siguiente paso natural es desplegar **Vercel** (o similar) para `apps/web`, definir las mismas variables de entorno en el panel del proveedor y usar la URL de producción en Supabase y en el webhook de Telegram.
