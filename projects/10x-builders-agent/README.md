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

Así el flujo de login/signup, el intercambio de código en `/auth/callback` y la recuperación de contraseña (`/forgot-password` → email → `/reset-password`) funcionan en local. Para que el reset funcione end-to-end, además se necesita SMTP (Supabase trae uno por defecto con límites bajos) y que la plantilla "Reset Password" use `{{ .ConfirmationURL }}` (flujo PKCE). Detalle del flujo y requisitos en [docs/features/password-recovery/plan.md](docs/features/password-recovery/plan.md).

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
   | `OPENROUTER_MEMORY_MODEL` | *(Opcional)* Slug del modelo de extracción de memoria a largo plazo (memory flush). Si no se define, cae a `OPENROUTER_COMPACTION_MODEL`. Diseño en [docs/features/long-term-memory/plan.md](docs/features/long-term-memory/plan.md) |
   | `OPENROUTER_EMBEDDING_MODEL` | *(Opcional)* Modelo de embeddings vía OpenRouter. Default `openai/text-embedding-3-small` (1536 dims) |
   | `MEMORY_FLUSH_IDLE_MINUTES` | *(Opcional)* Fallback del umbral de inactividad para el flush automático (default `30`). El valor por usuario (`profiles.memory_flush_idle_minutes`, editable en Ajustes) tiene prioridad |
   | `MEMORY_FLUSH_MIN_TURNS` | *(Opcional)* Mínimo de turnos de usuario para que una sesión se flushee (default `2`) |
   | `MEMORY_RETRIEVAL_K` | *(Opcional)* Top-K de recuerdos a inyectar por turno (default `6`) |
   | `MEMORY_DEDUP_THRESHOLD` | *(Opcional)* Cosine mínima para considerar un hecho duplicado al guardar (default `0.90`) |
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
   | `LANGFUSE_PUBLIC_KEY` | *(Opcional)* Public key del proyecto en Langfuse (tracing del agente). Sin las credenciales el tracing se desactiva silenciosamente. Setup en el paso 13 |
   | `LANGFUSE_SECRET_KEY` | *(Opcional)* Secret key del proyecto en Langfuse |
   | `LANGFUSE_BASE_URL` | *(Opcional)* URL de la instancia self-hosted de Langfuse (ej. `http://localhost:3001`) |

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

## Paso 9 — Integraciones de Google (opcional)

Las tools de Google (Calendar, Sheets, y futuras Drive/Gmail) comparten **un solo OAuth Client** y **una sola conexión** del usuario. Al agregar una integración nueva basta con habilitar su API en Cloud Console y volver a conectar Google desde Ajustes.

### Configurar el OAuth Client en Google Cloud Console

1. Ve a [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Habilita las APIs que vayas a usar (puedes habilitarlas todas a la vez; hacerlo no otorga ningún permiso hasta que el scope correspondiente se solicite en el consent):
   - [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   - [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   - (Opcional, futuro) Google Drive API, Gmail API.
3. **Create Credentials → OAuth client ID → Web application**.
4. **Authorized redirect URIs**: `http://localhost:3000/api/auth/google/callback`.
5. En **OAuth consent screen → Scopes**, agrega los scopes de las APIs habilitadas:
   - `.../auth/calendar.events`
   - `.../auth/spreadsheets` (clasificado como **sensitive** por Google)
6. Si el consent screen está en modo **Testing**, confirma que tu cuenta está en *Test users*.
7. Copia el **Client ID** → `GOOGLE_CLIENT_ID` y el **Client Secret** → `GOOGLE_CLIENT_SECRET` en `apps/web/.env.local`.
8. En la web: **Ajustes → Google → Conectar Google** (si ya estaba conectado por Calendar y agregás Sheets, **desconectá y reconectá** para que el grant cubra el scope nuevo).

Scopes solicitados por el agente hoy: `openid email .../auth/calendar.events .../auth/spreadsheets`. El access token se renueva automáticamente con el refresh token cuando expira (~1h).

### Google Calendar

Listar, crear, modificar y eliminar eventos (incluyendo series recurrentes). Diseño completo en [docs/features/calendar/README.md](docs/features/calendar/README.md).

### Google Sheets

Leer, agregar filas, sobrescribir rangos, listar pestañas y crear spreadsheets nuevos. El usuario provee el `spreadsheetId` (el agente no lo inventa ni lo busca por nombre), salvo que la hoja esté **registrada** por alias (ver "Referencias de hojas" abajo).

| Tool | Operación | Riesgo | Ejemplo de prompt |
|------|-----------|--------|-------------------|
| `gsheets_list_sheets` | Lista las pestañas de un spreadsheet | bajo | *"En el spreadsheet `1abc…xyz` qué pestañas tiene?"* |
| `gsheets_read_range` | Lee un rango A1 | bajo | *"Leeme `Gastos!A1:D20` del spreadsheet `1abc…xyz`"* |
| `gsheets_append_row` | Agrega una fila al final | medio | *"En el spreadsheet `1abc…xyz`, agregá una fila en `Gastos!A:D` con fecha de hoy, 'Café', 'Comida', 4.50"* |
| `gsheets_update_range` | Sobrescribe un rango | medio | *"Cambiá `Diario!E5` del spreadsheet `1abc…xyz` a 22.5"* |
| `gsheets_create_spreadsheet` | Crea un spreadsheet nuevo (opcional `register_as`) | medio | *"Creame un spreadsheet 'Lecturas 2026' con pestañas 'Libros' y 'Artículos' y guardalo como 'lecturas'"* |

`value_input_option` default `USER_ENTERED` (interpreta strings con `=` como fórmulas y formatea fechas/números); pasá `RAW` para guardar literal. Las 3 tools de escritura disparan confirmación HITL. Brief y plan en [docs/features/google-sheets/](docs/features/google-sheets/).

#### Referencias de hojas (registrar por alias)

Para no pegar el `spreadsheetId` en cada conversación, el usuario puede **registrar** una hoja bajo un alias legible; el agente la resuelve por nombre/intención en cualquier conversación (la lista se inyecta en el contexto del agente cada turno).

| Tool | Operación | Riesgo | Ejemplo de prompt |
|------|-----------|--------|-------------------|
| `gsheets_save_reference` | Registra/actualiza una hoja por alias | medio | *"Guardá esta hoja como 'gym': `https://docs.google.com/spreadsheets/d/1abc…xyz/edit`"* |
| `gsheets_list_references` | Lista las hojas registradas | bajo | *"¿Qué hojas tengo registradas?"* |
| `gsheets_delete_reference` | Elimina una referencia (no borra el archivo) | medio | *"Borrá la referencia 'gym'"* |

Una vez registrada: *"Leé mi hoja de gym"* o *"Anotá una fila en gastos"* funcionan sin pegar el id. El alias es case-insensitive y re-guardarlo lo sobrescribe. Brief y plan en [docs/features/sheet-references/](docs/features/sheet-references/).

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

## Paso 12 — Memoria a largo plazo

El agente recuerda al usuario entre sesiones: destila hechos durables al cerrar una conversación y los recupera al iniciar la siguiente. La **recuperación/inyección** funciona en cuanto apliques las migraciones (no requiere config extra). El **flush** se dispara de dos formas: con el botón "Nueva conversación" (inmediato) y con un sweep de inactividad por pg_cron (opcional).

1. **Migraciones**: aplica `00006_long_term_memory.sql` (pgvector + tabla `memories`) y `00007_memory_idle_setting.sql`. Confirma que la extensión `vector` quedó habilitada (Dashboard → Database → Extensions).

2. **(Opcional) Flush automático por inactividad** — registra el job en **Supabase Dashboard → SQL Editor** (reutiliza el `CRON_SECRET` y las extensiones de tareas programadas):

   ```sql
   select cron.schedule(
     'memory-flush-tick',
     '*/5 * * * *',
     $$
       select net.http_post(
         url     := 'https://TU_DOMINIO/api/memory/flush-tick',
         headers := jsonb_build_object(
                      'Content-Type', 'application/json',
                      'x-cron-secret', 'PEGAR_AQUI_EL_VALOR_DE_CRON_SECRET'
                    ),
         body    := '{}'::jsonb
       ) as request_id;
     $$
   );
   ```

   Cada usuario configura su umbral de inactividad en **Ajustes → Agente** (default 30 min). Para apagar: `select cron.unschedule('memory-flush-tick');`.

Validación rápida sin esperar el cron:

```bash
curl -X POST http://localhost:3000/api/memory/flush-tick -H "x-cron-secret: $CRON_SECRET"
```

Guía completa (tipos de memoria, dedup, inspección, limitaciones) en [docs/features/long-term-memory/README.md](docs/features/long-term-memory/README.md).

---

## Paso 13 — Observabilidad con Langfuse (opcional)

Tracing por turno del agente: cada mensaje genera una traza navegable con los nodos del grafo, las llamadas LLM (prompts, respuestas, tokens, latencia) y las tool calls. Corre **self-hosted en local** con Docker.

1. **Clonar y levantar Langfuse** (fuera de este repo, es infraestructura compartida):

   ```bash
   git clone https://github.com/langfuse/langfuse.git ~/Dev/langfuse
   cd ~/Dev/langfuse
   docker compose up -d
   ```

   ⚠️ **Puerto**: la UI de Langfuse usa el `3000` por defecto — el mismo que esta app. Remapéalo con un `docker-compose.override.yml`:

   ```yaml
   services:
     langfuse-web:
       ports: !override
         - "127.0.0.1:3001:3000"
       environment:
         NEXTAUTH_URL: http://localhost:3001
   ```

2. **Crear credenciales**: abre `http://localhost:3001`, regístrate (el primer usuario es local), crea una organización y un proyecto, y en **Project Settings → API Keys** genera las keys.

3. **Configurar variables** en `apps/web/.env.local`: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` y `LANGFUSE_BASE_URL=http://localhost:3001`. Reinicia el servidor de desarrollo.

4. **Validar**: envía un mensaje en `/chat` y abre **Traces** en `http://localhost:3001` — debe aparecer una traza `LangGraph` con la generación LLM y los nodos del grafo.

Sin las variables, el tracing se desactiva silenciosamente y el agente funciona normal (CI, otros devs). El stack de Langfuse consume ~2–4 GB de RAM entre sus 6 contenedores: cuando no lo uses, apágalo con `docker compose down` (los datos persisten en volúmenes).

Diseño y detalles en [docs/features/observability-langfuse/README.md](docs/features/observability-langfuse/README.md).

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
- [docs/features/long-term-memory/plan.md](docs/features/long-term-memory/plan.md) — plan de la memoria a largo plazo (flush, injection, pgvector, dedup, cierre de sesión).
- [docs/features/long-term-memory/README.md](docs/features/long-term-memory/README.md) — guía de uso, setup del flush por inactividad y operación de la memoria a largo plazo.
- [docs/features/password-recovery/brief.md](docs/features/password-recovery/brief.md) — brief del flujo de recuperación de contraseña.
- [docs/features/password-recovery/plan.md](docs/features/password-recovery/plan.md) — plan as-built del flujo de recuperación (pantallas, middleware whitelist, esquema de contraseña, toggle de visibilidad, requisitos Supabase).
- [docs/features/observability-langfuse/plan.md](docs/features/observability-langfuse/plan.md) — plan de la observabilidad con Langfuse (decisiones, SDK, propagación de callbacks).
- [docs/features/observability-langfuse/README.md](docs/features/observability-langfuse/README.md) — guía de la integración de Langfuse (arquitectura del tracing, configuración, operación).
- [CHANGELOG.md](CHANGELOG.md) — historial de cambios.

---

## Problemas frecuentes

- **Redirecciones infinitas o “no auth”**: revisa `Site URL` y `Redirect URLs` en Supabase y que `.env.local` esté en **`apps/web`**.
- **Errores al guardar perfil o mensajes**: confirma que ejecutaste la migración SQL y que RLS no bloquea por falta de sesión (debes estar logueado con el mismo usuario).
- **Chat sin respuesta / 500 en `/api/chat`**: `OPENROUTER_API_KEY`, cuota en OpenRouter o modelo en `model.ts`.
- **Telegram no responde**: webhook debe ser HTTPS; token y secreto correctos; visita de nuevo `/api/telegram/setup` si cambias la URL pública.
- **Email de recuperación no llega**: el SMTP por defecto de Supabase solo envía a miembros del proyecto y tiene límite bajo. Atajos: probar con el email de tu cuenta Supabase, generar el link manualmente desde Authentication → Users, o activar SMTP custom (Resend/SendGrid).
- **Link de recuperación cae en la home en vez de en `/reset-password`**: las URLs `…/auth/callback` no están en la whitelist de Supabase (Authentication → URL Configuration → Redirect URLs).
- **No aparecen trazas en Langfuse**: verifica que los contenedores estén arriba (`docker compose ps` en el repo de Langfuse), que las 3 variables `LANGFUSE_*` estén en `apps/web/.env.local` (y reiniciaste el dev server tras añadirlas) y que `LANGFUSE_BASE_URL` apunte al puerto remapeado (`http://localhost:3001`, no `3000`). Si Langfuse está caído el agente sigue funcionando: el SDK loguea `ECONNREFUSED` en la consola del server y descarta las trazas de esa sesión.

Si quieres, el siguiente paso natural es desplegar **Vercel** (o similar) para `apps/web`, definir las mismas variables de entorno en el panel del proveedor y usar la URL de producción en Supabase y en el webhook de Telegram.
