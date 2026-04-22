# Arquitectura

Este proyecto implementa `aisaac`, un agente CLI en español para el tracking de progreso en el gimnasio, construido con LangChain JS, OpenRouter y la Google Sheets API. La estructura es modular para mantener desacoplados y testeables el flujo de onboarding, la invocación de tools y la I/O contra Sheets.

## Flujo de punta a punta

1. El entrypoint `src/index.js` carga el entorno mediante `src/config/env.js` y arranca el REPL.
2. `src/cli/repl.js` abre una interfaz `readline` con el prompt `aisaac> `, mantiene el historial de chat en memoria y envía cada turno del usuario al agente.
3. `runAgent` en `src/agent/runAgent.js` invoca al `AgentExecutor` con `{ input, chat_history }` y devuelve el historial actualizado.
4. `buildAgentExecutor` en `src/agent/createAgent.js` compone modelo, prompt y tools.
5. El agente selecciona y ejecuta la tool adecuada según el prompt:
   - `read_headers` (siempre primero; dirige la detección de onboarding)
   - `write_headers` (onboarding en la primera ejecución)
   - `add_columns` (activar una nueva categoría post-onboarding)
   - `append_row` (registrar un nuevo dato)
   - `read_history` (análisis y validación contextual antes de escribir)
6. Cada tool delega la I/O en `src/sheets/repository.js`, que se comunica con Google Sheets a través del cliente autenticado de `src/sheets/client.js`.
7. El `AgentExecutor` devuelve el `output` final al REPL, que lo imprime y espera el siguiente turno hasta que el usuario escribe `salir` / `exit` o envía `Ctrl+C`.

```
[Usuario — CLI]
     ↓
[src/cli/repl.js — readline, aisaac>]
     ↓
[src/agent/runAgent.js — historial de sesión]
     ↓
[AgentExecutor — modelo + prompt + tools]
     ↓
[src/agent/tools/* — tools validadas con zod]
     ↓
[src/sheets/repository.js]
     ↓
[src/sheets/client.js — googleapis, scope: spreadsheets]
     ↓
[Google Sheet: SPREADSHEET_ID → pestaña SHEET_NAME]
```

## Responsabilidades por módulo

- `src/config/env.js`
  - Carga `.env.local`.
  - Valida las variables de entorno con `zod` (`OPENROUTER_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `SPREADSHEET_ID`, `SHEET_NAME`, y la opcional `TEST_SPREADSHEET_ID`).
  - Falla rápido ante configuración inválida.
- `src/sheets/client.js`
  - Crea un cliente `google.auth.GoogleAuth` con `keyFile` y el único scope `https://www.googleapis.com/auth/spreadsheets`.
  - Expone un helper perezoso `getSheetsClient()` reutilizado por el repositorio.
- `src/sheets/categories.js`
  - Fuente de verdad para la lista cerrada de categorías, los headers base, el orden canónico de columnas y los sinónimos de headers.
  - Provee `buildHeaders(selectedCategories)` e `inferCategoriesFromHeaders(headers)` para el onboarding y la detección stateless.
- `src/sheets/errors.js`
  - Envuelve las llamadas a Sheets con `withSheetsErrorHandling()`.
  - Mapea 403 / 404 / pestaña inexistente / 429 / timeout a los mensajes accionables definidos en el brief, distinguiendo errores fatales (cierran la sesión) de recuperables (retry con backoff y se mantiene el REPL abierto).
- `src/sheets/repository.js`
  - Implementa las operaciones de alto nivel: `readHeaders`, `writeHeaders`, `addColumns`, `appendRow`, `readHistory`.
  - Normaliza el payload de `append_row` usando el orden actual de headers, formatea `Fecha` como `YYYY-MM-DD` y deriva `Día` en español.
- `src/agent/model.js`
  - Crea el modelo `ChatOpenAI` configurado contra OpenRouter (API compatible con OpenAI más headers propios del proveedor).
- `src/agent/prompt.js`
  - Define el comportamiento del agente en español: `read_headers` obligatorio al inicio de cada sesión, flujo de onboarding, inferencia de categorías, validación contextual antes de escribir pesos o peso corporal, manejo de solicitudes fuera de alcance (rutinas, dietas, diagnósticos médicos) y reglas de seguridad.
  - Usa los placeholders `{chat_history}` y `{agent_scratchpad}`.
- `src/agent/tools/*`
  - Implementa las cinco tools de dominio con schemas `zod` y descripciones en español.
  - Devuelve cadenas JSON deterministas para que el LLM pueda citar datos estructurados y los tests puedan hacer aserciones sobre el payload.
- `src/agent/createAgent.js`
  - Ensambla modelo, tools y prompt en el agente ejecutable mediante `createToolCallingAgent` + `AgentExecutor`.
- `src/agent/runAgent.js`
  - Expone una interfaz de ejecución focalizada para el REPL y los tests, manteniendo el historial efímero de sesión (array de `HumanMessage` / `AIMessage`) en memoria del proceso.
- `src/cli/repl.js`
  - Es dueño del loop `readline`, el prompt `aisaac> `, el feedback "Pensando...", los comandos de salida (`salir`, `exit`, `Ctrl+C`) y el mensaje de despedida.
- `src/cli/formatters.js`
  - Helpers compartidos para fechas ISO, nombres de día en español y mensajes de error presentables al usuario.

## Decisiones de diseño

- JavaScript ESM con JSDoc para cumplir la regla no negociable del brief manteniendo chequeos estáticos disponibles vía `tsc --noEmit --allowJs --checkJs`.
- Stateless entre sesiones: la fuente de verdad es el propio Google Sheet; el agente infiere el estado de onboarding desde `${SHEET_NAME}!A1:Z1` en cada ejecución.
- Responsabilidad única por capa (`config`, `sheets`, `agent`, `cli`) para mantener independientes y fáciles de evolucionar el flujo de onboarding, la I/O contra Sheets y la orquestación del LLM.
- Validación centralizada de entorno para fallar rápido ante configuración inválida.
- Mínimo privilegio en la autenticación: el Service Account usa exclusivamente el scope `spreadsheets` y solo opera sobre la pestaña configurada en `SHEET_NAME`.
- OpenRouter integrado a través de la API compatible con OpenAI y headers propios del proveedor, con `openai/gpt-4o-mini` como default y sobreescribible vía `OPENROUTER_MODEL` sin cambios de código.
- La validación contextual vive en el prompt, no en umbrales hardcodeados: el LLM debe invocar `read_history` antes de `append_row` en `Pesos por ejercicio` y `Peso corporal`, y cuestionar saltos sospechosos sin bloquear.
- Soporte de executor inyectable en `runAgent` para tests unitarios aislados y rápidos.
- Salidas deterministas de las tools (cadenas JSON) para que el comportamiento del agente sea predecible y testeable con `googleapis` mockeado.
- Distinción entre errores fatales y recuperables en `sheets/errors.js` para que el REPL pueda decidir si cerrar o mantener la sesión sin filtrar stack traces al usuario.

## Evolución recomendada

- Añadir logging estructurado (pino o similar) cuando se requieran diagnósticos de runtime más profundos, manteniendo credenciales y datos del usuario fuera de los logs.
- Agrupar lecturas y escrituras de Sheets mediante `values.batchGet` / `values.batchUpdate` si los rate limits se vuelven un problema al crecer el uso.
- Persistir contexto ligero de sesión (por ejemplo, última categoría usada o zona horaria override) en un store local opcional si la UX lo justifica — actualmente fuera de alcance.
- Para añadir una nueva tool: crear el archivo en `src/agent/tools/`, registrarla en `createAgent.js` y actualizar `prompt.js` con las instrucciones de uso. Usar `append_row.js` como referencia para tools que leen estado antes de escribir.
- Para añadir una nueva categoría: extender `CATEGORY_KEYS`, `CATEGORY_BLOCKS` y `HEADER_SYNONYMS` en `src/sheets/categories.js`, y actualizar el párrafo de onboarding en `prompt.js`. No se requieren cambios en tools ni repositorio.
- Evaluar, sin ampliar el alcance actual, futuros canales (Telegram, UI web) reutilizando `runAgent` como frontera de integración; cada canal tendría su propia capa de transporte equivalente a `src/cli/`.
