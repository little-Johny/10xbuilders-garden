# Plan detallado para construir y fortalecer el agente `aisaac`

## 1. Objetivo del plan

Construir y consolidar `aisaac`, un agente CLI en español basado en JavaScript + Node.js ≥20 + LangChain JS + OpenRouter + Google Sheets API, que:

- realice un onboarding stateless en la primera interacción, preguntando al usuario qué categorías quiere trackear de una lista cerrada,
- pueble la pestaña pre-existente del Google Sheet del usuario con los headers correspondientes y una columna `Categoría`,
- registre el progreso del usuario vía CLI en interacciones posteriores, manteniendo histórico con fecha,
- cuestione datos inconsistentes antes de escribirlos,
- responda preguntas y análisis básicos sobre el progreso,
- y mantenga una arquitectura entendible, extensible y segura (único scope `spreadsheets`, sin almacenamiento local).

Este plan traduce el [brief-agent.md](./brief-agent.md) en pasos ejecutables para que cualquier integrante del equipo pueda continuar el trabajo de forma consistente.

---

## 2. Principios de ejecución

1. **Fidelidad al brief primero:** cada decisión técnica rastreable a una regla del brief (alcance, constraints, DoD).
2. **Cambios pequeños y verificables:** cada avance debe poder ejecutarse, probarse y explicarse.
3. **Consistencia arquitectónica:** respetar separación de responsabilidades por capas (`config`, `sheets`, `agent`, `cli`).
4. **Stateless entre sesiones:** el estado persistido vive en el Google Sheet; nada en disco local fuera de credenciales.
5. **Seguridad por defecto:** scope mínimo, credenciales siempre en variables de entorno, nunca expuestas al usuario.
6. **Documentar cada decisión relevante:** comportamiento, límites y configuración deben quedar explícitos en README y código (JSDoc).

---

## 3. Alcance funcional

### Incluye (MVP del brief)

- Entrada conversacional en lenguaje natural desde la CLI (`aisaac> `).
- Respuestas en español, claras y breves.
- Onboarding con selección entre 4 categorías fijas: `Pesos por ejercicio`, `Medidas corporales`, `Cardio`, `Peso corporal`.
- Escritura de headers en orden canónico en la pestaña `SHEET_NAME`.
- Extensión de columnas post-onboarding cuando el usuario activa una nueva categoría.
- Registro de filas con `Fecha` (ISO `YYYY-MM-DD`), `Día` (español), `Categoría` y campos específicos por categoría.
- Lectura de histórico y generación de análisis básicos sobre los registros.
- Validación contextual por el LLM (consulta `read_history` antes de `append_row` en pesos / peso corporal y cuestiona saltos sospechosos).
- Manejo controlado de errores de Google Sheets (403, 404, sheet inexistente, 429, timeouts) con mensajes accionables.

### No incluye (por ahora)

- Interfaz web, Telegram u otras integraciones fuera de la CLI.
- Memoria persistente entre sesiones (cada arranque es limpio; el histórico vive en el sheet).
- Sugerencia de rutinas, recomendaciones alimenticias o diagnósticos médicos.
- Creación del archivo Google Sheet o pestañas adicionales (responsabilidad del usuario).
- Acceso a pestañas distintas de `SHEET_NAME`.
- Uso de Google Drive API u otros scopes de Google.

---

## 4. Plan por fases

## Fase 0: Alineación y línea base

**Objetivo:** asegurar que todo el equipo comparta contexto, límites y criterios de éxito antes de escribir código.

**Actividades:**

- Revisar [docs/brief-agent.md](./brief-agent.md) y confirmar entendimiento común (alcance, categorías, constraints).
- Revisar el proyecto de referencia [projects/10X-Builders-langchain-agent/](../../10X-Builders-langchain-agent/) como patrón arquitectónico de tools + `createToolCallingAgent` + `AgentExecutor`.
- Confirmar prerequisitos del usuario: Google Sheet creado manualmente, pestaña `SHEET_NAME` existente, Service Account creado con Sheets API habilitada y sheet compartido como Editor.
- Definir escenarios de uso prioritarios para validar cambios (primer arranque con sheet vacío, registro post-onboarding, agregar categoría nueva, preguntar histórico, dato sospechoso).

**Entregables:**

- Resumen de estado actual (proyecto desde cero; solo existe el brief).
- Lista de escenarios prioritarios para validación manual y automatizada.

**Criterio de salida:**

- El equipo entiende el mismo objetivo y evita cambios fuera de alcance.

---

## Fase 1: Consolidación de arquitectura y responsabilidades

**Objetivo:** establecer una estructura clara por capas, alineada con el diagrama de arquitectura del brief (§4.2).

**Actividades:**

- Definir las capas con responsabilidad única:
  - `src/config/` — carga y validación de variables de entorno con `zod`.
  - `src/sheets/` — cliente `googleapis`, mapping de categorías, manejo de errores y repositorio de operaciones (`readHeaders`, `writeHeaders`, `addColumns`, `appendRow`, `readHistory`).
  - `src/agent/` — modelo (`ChatOpenAI` vía OpenRouter), prompt, tools LangChain y executor.
  - `src/cli/` — REPL `readline` con prompt `aisaac> `, formatters y comandos de salida.
- Documentar la regla de extensión: **nuevas tools se agregan en `src/agent/tools/` y se registran en `createAgent.js`**; **nuevas categorías solo se modifican en `sheets/categories.js`** (fuente de verdad del orden canónico y la tabla invertida).
- Preparar `package.json` (ESM, Node ≥20), `eslint.config.js`, `vitest.config.js`, `.gitignore` (ignora `.env*` y `credentials/*` salvo `.gitkeep`), `.env.example`.

**Entregables:**

- Estructura de carpetas coherente con el brief.
- Scripts `npm start`, `npm test`, `npm run lint`, `npm run typecheck`.
- Guía breve de "cómo extender el agente sin romperlo" en el README.

**Criterio de salida:**

- Cualquier persona puede ubicar rápidamente dónde modificar cada tipo de cambio (tool nueva, categoría nueva, política de validación).

---

## Fase 2: Robustez funcional del agente

**Objetivo:** asegurar que el agente resuelve los escenarios principales en español, usando tools solo cuando corresponde, cumpliendo las reglas del brief.

**Actividades:**

- Implementar las 5 tools con schemas `zod` y descripciones en español: `read_headers`, `write_headers`, `add_columns`, `append_row`, `read_history`.
- Escribir el system prompt que codifica:
  - Flujo obligatorio: **siempre** `read_headers` primero; si vacío, onboarding; si con contenido, inferir categorías desde headers.
  - Validación contextual: antes de `append_row` en `Pesos` o `Peso corporal`, invocar `read_history` y cuestionar saltos sospechosos sin bloquear.
  - Out-of-scope: rechazar rutinas, dietas y diagnósticos médicos; orientaciones generales no médicas y derivación a profesional ante dolor persistente.
  - Seguridad: nunca revelar credenciales ni variables de entorno.
- Implementar `runAgent(input, history)` con memoria de sesión efímera (array de `HumanMessage` / `AIMessage` en proceso).
- Implementar REPL con prompt `aisaac> `, feedback "Pensando...", y salidas por `salir`, `exit` o `Ctrl+C` con despedida.
- Validar los escenarios de la Fase 0 de forma manual.

**Entregables:**

- Comportamiento del agente estable en los 5 escenarios prioritarios.
- Respuestas con tono y formato consistentes en español.
- Tools que retornan JSON determinista para facilitar tests y razonamiento del LLM.

**Criterio de salida:**

- El agente resuelve correctamente los casos esperados y explica de forma breve qué hizo, respetando el alcance.

---

## Fase 3: Gestión de configuración y fallos esperados

**Objetivo:** garantizar arranque seguro, mensajes claros ante configuración incompleta y manejo robusto de errores de Google Sheets (brief §5).

**Actividades:**

- Validación temprana de `.env.local` con `zod` (OpenRouter + Google credentials + `SPREADSHEET_ID` + `SHEET_NAME`).
- Implementar `sheets/errors.js` que mapea:
  - 404 / sheet inaccesible → mensaje accionable y cierre de sesión.
  - 403 / permisos insuficientes → mensaje accionable y cierre de sesión.
  - Pestaña inexistente → mensaje accionable y cierre de sesión.
  - 429 → retry exponencial (2s, 4s); si persiste, informa y mantiene la sesión.
  - Timeout 10s → 1 retry inmediato; si falla, informa y mantiene la sesión.
- Asegurar que el agente **nunca expone stack traces** al usuario.
- Documentar checklist mínimo de Google Cloud en el README (crear proyecto, habilitar Sheets API, generar Service Account, compartir sheet, crear pestaña).

**Entregables:**

- Flujo de arranque con validaciones claras.
- Documentación de configuración mínima y fallos comunes en el README.
- Distinción entre errores **fatales** (cierran sesión) y **recuperables** (mantienen el REPL).

**Criterio de salida:**

- Si falta configuración o el sheet no es accesible, el sistema falla de forma controlada y entendible, sin exponer detalles técnicos.

---

## Fase 4: Pruebas y calidad operativa

**Objetivo:** proteger estabilidad del comportamiento actual y facilitar cambios futuros con confianza (brief §5 — Testing).

**Actividades:**

- Tests unitarios con Vitest y `googleapis` mockeado:
  - `categories.test.js`: `buildHeaders` respeta orden canónico; `inferCategoriesFromHeaders` es tabla invertida fiel.
  - `tools.*.test.js`: una suite por tool validando schema `zod`, llamadas al repositorio y forma del retorno.
  - `sheets.repository.test.js`: `appendRow` mapea al orden actual de headers; `addColumns` no duplica.
  - `errors.test.js`: clasificación 403/404/429/timeout y retries.
  - `formatters.test.js`: fecha ISO y día en español.
- Test del agente con executor mock: `runAgent.test.js` verifica que `read_headers` se invoca primero y que el onboarding se dispara con headers vacíos.
- Test de integración **opcional** gated por `TEST_SPREADSHEET_ID` en `.env.test` que escribe y limpia filas en un sheet real.
- Ejecutar `npm run lint` y `npm test` antes de cerrar cualquier cambio.

**Entregables:**

- Suite de pruebas estable para casos prioritarios.
- Rutina mínima de calidad antes de aceptar cambios.

**Criterio de salida:**

- Los cambios se aceptan solo si mantienen ejecución correcta, lint limpio y tests en verde.

---

## Fase 5: Documentación final y handoff

**Objetivo:** dejar el proyecto listo para continuidad por cualquier miembro del equipo y para el usuario final.

**Actividades:**

- Actualizar `README.md` con:
  - Prerequisitos Google Cloud paso a paso (proyecto, Sheets API, Service Account con scope único `spreadsheets`, descarga del JSON a `credentials/aisaac-sa.json`, compartir sheet como Editor, crear pestaña `SHEET_NAME`).
  - Instalación y `.env.local` (referenciar `.env.example`).
  - Cómo correr: `npm start`, `npm test`, `npm run lint`.
  - Ejemplos de interacción (primer arranque, registro, agregar categoría, pregunta histórica).
  - Troubleshooting (403, 404, 429, pestaña inexistente).
- Sincronizar `docs/brief-agent.md`, `docs/plan-agent.md` y notas operativas.
- Definir próximos pasos priorizados sin inflar alcance (ver sección 8).

**Entregables:**

- Documentación coherente con lo implementado.
- Hoja de ruta de mejoras incrementales.

**Criterio de salida:**

- Una persona nueva puede ejecutar, entender y extender el agente en poco tiempo.

---

## 6. Criterios de aceptación globales (Definition of Done operativa)

Se considera completado cuando:

- El agente responde en español y cumple el alcance del brief sin inventar categorías ni salirse del scope.
- Primer arranque con sheet vacío dispara el onboarding y escribe los headers correctos en orden canónico.
- Interacciones posteriores detectan categorías activas desde los headers e infieren el estado sin archivos locales.
- El usuario puede agregar categorías nuevas post-onboarding sin afectar los datos previos.
- Cada registro se agrega como fila nueva con `Fecha`, `Día` y `Categoría`, nunca sobreescribe.
- El agente cuestiona datos sospechosos antes de registrarlos y respeta confirmaciones del usuario.
- El agente rechaza educadamente rutinas, dietas y diagnósticos médicos.
- El agente nunca accede a pestañas distintas de `SHEET_NAME` ni a otros archivos.
- Errores de Google Sheets se manejan según la tabla del brief §5 sin exponer stack traces.
- `npm run lint` sin errores, `npm test` en verde, JSDoc en funciones públicas, credenciales solo en `.env.local`.

---

## 7. Riesgos y mitigaciones

- **Riesgo:** rate limits de Google Sheets (~300 req/min) si el agente encadena muchas llamadas.
  - **Mitigación:** retry con backoff en `sheets/errors.js` y uso de `values.get` con rangos amplios (`A:Z`) para reducir calls.

- **Riesgo:** el modelo alucina ejercicios o datos que el usuario nunca mencionó.
  - **Mitigación:** system prompt que obliga a consultar `read_history` antes de responder análisis; tools devuelven JSON determinista que el LLM debe citar.

- **Riesgo:** el sheet se modifica manualmente fuera del agente y pierde sincronía.
  - **Mitigación:** el agente siempre lee el estado actual (`read_headers`) antes de escribir; no asume estado previo.

- **Riesgo:** configuración incompleta en entornos nuevos (Service Account mal configurado, sheet no compartido).
  - **Mitigación:** validación temprana de env con `zod`, mensajes accionables ante 403/404, README con checklist paso a paso.

- **Riesgo:** regresiones al introducir nuevas tools o categorías.
  - **Mitigación:** tests unitarios por tool y por `categories.js`; regla de extensión documentada en Fase 1.

- **Riesgo:** desviación hacia alcance fuera del brief (rutinas, dietas, diagnósticos).
  - **Mitigación:** system prompt con out-of-scope explícito y tests de comportamiento sobre esas categorías de entrada.

---

## 8. Próximos pasos recomendados tras este plan

1. Ejecutar Fase 0 en una sesión corta de alineación (revisión conjunta de brief + este plan).
2. Priorizar una mejora puntual por fase para avanzar en iteraciones pequeñas.
3. Al cierre de cada fase, validar: funcionamiento, pruebas y documentación.
4. Registrar decisiones importantes (por ejemplo, cambio de modelo LLM o de formato de fecha) para mantener trazabilidad.
5. Una vez estable la BETA, evaluar sin inflar alcance: integración con Telegram, memoria persistente ligera, o panel de análisis — cada uno requeriría un nuevo brief.
