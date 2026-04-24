# Integración de GitHub

> **Estado: implementada.** Este documento describe el diseño de la integración de GitHub con el agente. La implementación cubre todas las secciones descritas y cumple los criterios de aceptación listados al final.

## Objetivo

Permitir que el usuario conecte su cuenta de GitHub desde *Settings* mediante OAuth, y que el agente trabaje con sus repositorios e *issues* usando los permisos del propio usuario, con un manejo seguro del token y un patrón de confirmación estructurado para acciones que crean recursos.

## Alcance

1. [Conectar GitHub desde Settings](#1-conectar-github-desde-settings)
2. [Almacenar el token de forma segura](#2-almacenar-el-token-de-forma-segura)
3. [Herramientas reales de GitHub](#3-herramientas-reales-de-github)
4. [Pedir confirmación en acciones sensibles](#4-pedir-confirmación-en-acciones-sensibles)
5. [Evitar el loop de confirmación](#5-evitar-el-loop-de-confirmación)
6. [Pasar el token al agente](#6-pasar-el-token-al-agente)

---

### 1. Conectar GitHub desde Settings

- Sección **GitHub** en la pantalla de *Settings* con botón para conectar la cuenta.
- Flujo OAuth estándar:
  1. `GET /api/auth/github/start` → redirige a GitHub con state CSRF.
  2. `GET /api/auth/github/callback` → intercambia el código por un access token, cifra el token y persiste la integración.
  3. Si ya está conectada, muestra el login de GitHub vinculado y ofrece **desconectar** (`POST /api/auth/github/disconnect`).
- Archivos: `apps/web/src/lib/github/oauth.ts`, `apps/web/src/app/api/auth/github/`.

### 2. Almacenar el token de forma segura

- El access token se cifra con **AES-256-GCM** antes de persistirse en `user_integrations.encrypted_tokens`.
- Clave maestra en `OAUTH_ENCRYPTION_KEY`, derivada vía SHA-256 a 32 bytes.
- Formato del ciphertext: `v1:<iv_b64>:<tag_b64>:<ct_b64>`.
- Descifrado **únicamente en servidor**, nunca expuesto al cliente.
- Archivo: `packages/db/src/crypto.ts`.

### 3. Herramientas reales de GitHub

Cuatro operaciones implementadas con un cliente REST mínimo en `packages/agent/src/integrations/github.ts`:

| Tool | Operación | Riesgo | Requiere confirmación |
|------|-----------|--------|----------------------|
| `github_list_repos` | Listar repositorios del usuario | bajo | No |
| `github_list_issues` | Listar issues de un repositorio | bajo | No |
| `github_create_issue` | Crear un issue | medio | Sí |
| `github_create_repo` | Crear un repositorio | alto | Sí |

Definiciones en `packages/agent/src/tools/catalog.ts`. Wrappers LangChain en `packages/agent/src/tools/adapters.ts`.

### 4. Pedir confirmación en acciones sensibles

Las herramientas que crean recursos (`github_create_issue`, `github_create_repo`) lanzan `ConfirmationRequiredError` en lugar de ejecutar:

- **Web:** card de confirmación con botones Aprobar / Rechazar en la interfaz de chat.
- **Telegram:** inline buttons con las mismas dos acciones.
- Endpoint de resolución: `POST /api/chat/confirm`.
- Ejecución post-aprobación: `executeApprovedToolCall()` en `packages/agent/src/tools/adapters.ts`.

### 5. Evitar el loop de confirmación

- El grafo se **detiene de inmediato** al detectar `ConfirmationRequiredError`, sin volver a invocar al modelo.
- Devuelve un resultado estructurado `{ pendingConfirmation: { toolCallId, toolName, args, summary } }`.
- La confirmación se resuelve exclusivamente mediante botones de UI, nunca por texto libre.
- La API identifica el estado de confirmación mediante el campo estructurado, no por string matching.
- Implementación: arista condicional `shouldContinueAfterTools` en `packages/agent/src/graph.ts`.

### 6. Pasar el token al agente

Los puntos de entrada (`/api/chat` y Telegram webhook):

1. Cargan la integración de GitHub del usuario desde la base de datos.
2. Descifran el access token en servidor.
3. Lo pasan al agente en `IntegrationsContext` (campo separado del estado), para que las tools lo consuman sin que aparezca en los mensajes del hilo.

Archivos: `apps/web/src/lib/agent/integrations-context.ts`, `packages/agent/src/types.ts`.

---

## Criterios de aceptación

- [x] El usuario puede conectar y desconectar su cuenta de GitHub desde *Settings*, y el estado se refleja correctamente tras refrescar.
- [x] En base de datos, el token nunca aparece en texto plano; cifrar y descifrar funciona con `OAUTH_ENCRYPTION_KEY` y falla de forma explícita si la clave cambia.
- [x] Las cuatro tools de GitHub operan contra la API real con los permisos del usuario conectado.
- [x] Crear un issue o un repo desde el agente dispara un card (web) o inline buttons (Telegram) y no ejecuta la acción hasta que el usuario aprueba.
- [x] La API identifica el estado de "pendiente de confirmación" mediante el resultado estructurado del grafo, no por string matching.
- [x] El token no aparece nunca en respuestas del cliente, ni en logs, ni en el historial de mensajes del agente.
