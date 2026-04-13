# Technical Brief — Flights Tool

## Título de la tarea

Agregar un tool al agente didáctico para buscar vuelos usando la API de Google Flights a través de SerpApi.

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | `08-04-2026` |
| Tipo | `Tool` |
| Stack principal | TypeScript, `fetch` nativo, SerpApi (`engine=google_flights`) |
| Estado | `Done` |

---

## 1. Contexto

### ¿Qué existe hoy?

El agente didáctico cuenta con dos tools: `calculator` (operaciones matemáticas simples) y `current_time` (hora actual, solo hora sin fecha). Está construido sobre TypeScript + LangChain, usa OpenRouter como proveedor de LLM y valida su configuración con Zod. La documentación vive en `docs/`.

La variable `SERPAPI_KEY` ya está definida y validada en `src/config/env.ts`.

### Problema

El agente no puede responder preguntas sobre viajes. Se necesita un tool que consulte vuelos reales para que el agente pueda asistir al usuario con preguntas como *"quiero viajar a Japón la próxima semana"*.

### Objetivo

Que el agente pueda buscar vuelos a través de SerpApi, siguiendo el mismo patrón arquitectónico de los tools existentes, infiriendo los parámetros faltantes del contexto y comunicando explícitamente al usuario qué asumió.

---

## 2. Alcance

### Dentro del alcance

- Un tool que recibe parámetros de vuelo ya resueltos por el LLM y consulta SerpApi.
- El LLM infiere los parámetros faltantes del contexto o asume los más probables (arquitectura single-turn, sin historial de conversación).
- El tool retorna los vuelos encontrados como texto estructurado para que el LLM los presente al usuario.
- Si el usuario indicó presupuesto, el LLM usa esa información para recomendar entre los resultados. El tool no filtra por precio.

### Fuera del alcance

- Reservas, compras o cualquier acción transaccional.
- Búsquedas adicionales más allá de una llamada a la API por invocación del tool.
- Filtrado por presupuesto dentro del tool (esa lógica es del LLM).

---

## 3. Stack & Arquitectura

### 3.1 Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js ≥ 20 + TypeScript |
| HTTP | `fetch` nativo (sin SDK de SerpApi) |
| API externa | SerpApi con `engine=google_flights` |
| Validación | Zod |

### 3.2 Arquitectura del tool

El tool sigue el patrón de `calculator.ts` y `currentTime.ts`:

- **Archivo**: `src/agent/tools/flights.ts`
- **Export**: `flightsTool`
- **Registro**: se agrega al array `agentTools` en `src/agent/createAgent.ts`
- **Prompt**: se actualiza `src/agent/prompt.ts` para instruir al LLM sobre cuándo y cómo usar el tool

### 3.3 Dependencia: upgrade de `currentTime`

Para que el LLM pueda convertir fechas relativas (*"la próxima semana"*, *"mañana"*) a formato `YYYY-MM-DD`, necesita conocer la fecha actual. El tool `current_time` hoy solo retorna la hora.

**Cambio requerido**: agregar un parámetro opcional `includeDate` (`boolean`, default `false`) al schema de `currentTime`. Cuando es `true`, retorna fecha y hora (ej: `2026-04-08 14:30:05`). Cuando es `false`, mantiene el comportamiento actual (solo hora). Esto permite:

- Que el flujo de vuelos use `current_time` con `includeDate: true` para resolver fechas relativas.
- Que el comportamiento existente no cambie cuando el usuario solo pregunta la hora.

Se actualiza `prompt.ts` para que el LLM sepa que puede obtener la fecha actual con este tool.

### 3.4 Flujo de interacción

El agente es **single-turn**: recibe una sola entrada y retorna una sola salida. No hay historial de conversación.

1. El usuario menciona algo relacionado con viajes o vuelos.
2. El LLM identifica que necesita el tool de vuelos.
3. Si necesita resolver una fecha relativa, invoca primero `current_time` con `includeDate: true`.
4. El LLM infiere los parámetros faltantes del contexto o asume los más probables (ej: aeropuerto más cercano según el contexto).
5. El LLM invoca `flights` con los parámetros resueltos.
6. El tool llama a SerpApi, procesa la respuesta y retorna un resumen en texto.
7. El LLM presenta los resultados **informando explícitamente qué asumió** y por qué, para que el usuario pueda relanzar con datos más precisos si lo desea.

### 3.5 Schema de entrada (Zod)

| Campo | Tipo | Requerido | Descripción para el LLM |
|---|---|---|---|
| `origin` | `string` | Sí | Código IATA del aeropuerto de origen (ej: `BOG`, `MIA`, `JFK`). Si el usuario no lo especifica, inferir del contexto o asumir el más probable e informarlo en la respuesta |
| `destination` | `string` | Sí | Código IATA del aeropuerto de destino (ej: `NRT`, `CDG`, `LHR`) |
| `departureDate` | `string` | No | Fecha de salida en formato `YYYY-MM-DD`. Convertir lenguaje natural a fecha concreta usando `current_time`. Si se omite, SerpApi busca sin filtro de fecha |
| `returnDate` | `string` | No | Fecha de regreso en formato `YYYY-MM-DD`. Si se omite, se busca solo ida |
| `adults` | `number` | No | Número de pasajeros adultos. Default: `1` |
| `currency` | `string` | No | Moneda para los precios. Default: `USD` |

Cuando `returnDate` está presente, se usa `type=1` (ida y vuelta). Cuando se omite, `type=2` (solo ida).

**Mapeo al API de SerpApi**: los nombres del schema se transforman al construir la URL:

| Zod (tool) | SerpApi (query param) |
|---|---|
| `origin` | `departure_id` |
| `destination` | `arrival_id` |
| `departureDate` | `outbound_date` |
| `returnDate` | `return_date` |
| `adults` | `adults` |
| `currency` | `currency` |

Parámetros fijos (no vienen del schema, se hardcodean en el tool):

| Parámetro | Valor | Razón |
|---|---|---|
| `engine` | `google_flights` | Requerido por SerpApi |
| `hl` | `es` | Respuestas en español |
| `api_key` | desde `env.ts` | Autenticación |

### 3.6 Formato de salida

El tool retorna un `string` con los primeros 3–5 vuelos del campo `best_flights` (o `other_flights` como fallback). Cada vuelo incluye:

- Aerolínea
- Precio
- Duración total
- Número de escalas
- Horarios de salida y llegada

Ejemplo de formato:

```
✈ Vuelo 1 — Avianca | $450 USD | 8h 30m | 1 escala
  Salida: BOG 06:00 → Llegada: NRT 22:30 (+1 día)

✈ Vuelo 2 — LATAM | $520 USD | 12h 15m | 2 escalas
  Salida: BOG 10:00 → Llegada: NRT 08:15 (+1 día)
```

Si no hay vuelos disponibles en `best_flights` ni en `other_flights`, retorna:
`"No se encontraron vuelos de {origin} a {destination} para la fecha {departureDate}."`

### 3.7 Interfaces TypeScript

Se definen interfaces estrictas para tipar la respuesta de SerpApi. Como mínimo:

- `SerpApiFlightsResponse` — estructura raíz del JSON
- `FlightGroup` — un grupo de vuelos (`best_flights[n]` / `other_flights[n]`)
- `FlightLeg` — un tramo individual (aerolínea, horarios, duración)

Estas interfaces se definen en el mismo archivo del tool o en un archivo adyacente si crecen.

---

## 4. Constraints

### Seguridad

- `SERPAPI_KEY` se lee exclusivamente desde `env.local` a través de `src/config/env.ts`. Nunca se expone en código ni en documentación.
- Los parámetros de la query se construyen con `URLSearchParams` para evitar inyección en la URL.

### Comportamiento

- El tool solo responde a consultas de vuelos. El LLM decide cuándo invocarlo según su `description`.
- El tool siempre retorna texto en español. Se fija `hl=es` en cada llamada a SerpApi.
- El tool no realiza consultas externas más allá de SerpApi.

### Reglas fijas del proyecto

**Arquitectura**
- Seguir el patrón de los tools existentes (`calculator.ts`, `currentTime.ts`).

**Calidad de código**
- TypeScript estricto. Sin `any`. Interfaces definidas.
- Linter activo sin errores (ESLint).

**Seguridad**
- Inputs validados con Zod.
- Credenciales en variables de entorno. `.env` / `env.local` en `.gitignore`.
- No logear datos sensibles.

**Testing**
- Cobertura mínima 80%.
- Cubrir: caso feliz, casos borde (sin resultados, IATA inválido), y errores de API.
- Usar `vi.spyOn(globalThis, 'fetch')` para mockear llamadas HTTP en tests. No se hacen llamadas reales a SerpApi en pruebas.

---

## 5. Riesgos & Supuestos

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | SerpApi free tier tiene solo 250 requests/mes | Alta | Usar mocks en todas las pruebas. No hacer llamadas reales en tests |
| 2 | El LLM puede alucinar códigos IATA incorrectos | Media | Documentar ejemplos válidos en la `description` del schema Zod |
| 3 | SerpApi no retorna `best_flights` en rutas poco comunes | Media | Fallback a `other_flights`; mensaje claro si ambos están vacíos |
| 4 | El usuario no especifica origen u otros datos | Media | El LLM infiere o asume los parámetros faltantes e informa al usuario qué asumió. Los únicos campos obligatorios son `origin` y `destination`; el resto es opcional tanto en el schema como en SerpApi |
| 5 | La estructura del JSON de SerpApi puede variar entre rutas | Baja | Interfaces TypeScript estrictas; validar campos antes de acceder |

---

## 6. Definition of Done

### Generales (aplican siempre)

- [ ] Linter pasa sin errores
- [ ] Cobertura de tests ≥ 80%, incluyendo casos borde
- [ ] TypeScript estricto, sin `any`
- [ ] Sin valores hardcodeados en lógica
- [ ] Inputs validados con Zod
- [ ] Credenciales en variables de entorno

### Específicos de esta tarea

**Upgrade de `currentTime`**
- [ ] `currentTime` acepta parámetro opcional `includeDate` (default `false`)
- [ ] Con `includeDate: false` retorna solo hora (comportamiento actual sin romper)
- [ ] Con `includeDate: true` retorna fecha y hora (`YYYY-MM-DD HH:MM:SS`)
- [ ] Tests existentes de `currentTime` siguen pasando

**Flights tool**
- [ ] El tool vive en `src/agent/tools/flights.ts` y exporta `flightsTool`
- [ ] Sigue el mismo patrón de `calculator.ts` y `currentTime.ts`
- [ ] Usa `fetch` nativo de Node 20, sin SDK adicional
- [ ] Está registrado en `createAgent.ts` dentro del array `agentTools`
- [ ] `src/agent/prompt.ts` instruye al LLM a: usar `current_time` para resolver fechas relativas, inferir parámetros faltantes, y declarar explícitamente qué asumió en su respuesta
- [ ] Parámetros fijos (`engine`, `hl=es`, `api_key`) se hardcodean en el tool, no en el schema
- [ ] El tool retorna texto en español
- [ ] Si no hay vuelos, retorna un mensaje claro en lugar de fallar
- [ ] Errores de red o API se capturan y retornan como mensaje legible
- [ ] Tests cubren: búsqueda exitosa, sin resultados, error de API, código IATA inválido
- [ ] Tests usan `vi.spyOn(globalThis, 'fetch')` — cero llamadas reales a SerpApi
- [ ] `env.local` documenta `SERPAPI_KEY` (la validación en `env.ts` ya existe)

---

## 7. Referencias & Notas

- [SerpApi — Google Flights API docs](https://serpapi.com/google-flights-api)
- [SerpApi — Google Flights Results (estructura del JSON)](https://serpapi.com/google-flights-results)
- Códigos IATA de referencia: `BOG` Bogotá, `MIA` Miami, `NRT` Tokyo, `JFK` Nueva York, `CDG` París, `LHR` Londres
- El campo `best_flights` ya viene ordenado por relevancia; usar los primeros 3–5 para no sobrecargar el contexto del LLM
- `type=2` = solo ida; `type=1` = ida y vuelta (requiere `return_date`)
- `hl=es` se documenta como parámetro fijo en sección 3.5 y constraints de comportamiento
