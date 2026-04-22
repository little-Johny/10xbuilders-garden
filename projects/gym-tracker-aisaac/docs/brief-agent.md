# Technical Brief — Agente de tracking de gym: aisaac

## 0. Snapshot

| Campo           | Valor                                                     |
| --------------- | --------------------------------------------------------- |
| Fecha           | `21-04-2026`                                              |
| Tipo            | `Agente IA`                                               |
| Stack principal | `Node.js + LangChain JS + OpenRouter + Google Sheets API` |
| Estado          | `BETA scope (CLI-only, sin memoria persistente)`          |

---

## 1. Título de la tarea

Crear e implementar un agente en español que se encargue de trackear el progreso del usuario en el gimnasio. En la primera interacción el agente realiza un onboarding donde le pregunta al usuario qué aspectos quiere trackear (de una lista limitada de opciones) y pobla la pestaña pre-existente del Google Sheet con los headers correspondientes y una columna "Categoría" para diferenciar tipos de registro. En interacciones posteriores, recibe información vía CLI y actualiza el sheet con el registro histórico.

---

## 2. Contexto

### ¿Qué existe hoy?

Proyecto desde cero. No hay código existente. El usuario ya creó manualmente un Google Sheet vacío, lo compartió con permisos de Editor al email del Service Account, y proveerá el `SPREADSHEET_ID` y el `SHEET_NAME` de la pestaña a usar vía variables de entorno. El agente no crea el archivo ni pestañas adicionales; solo pobla y modifica la pestaña designada. Se usará LangChain JS para orquestar el agente y `googleapis` para la integración con Sheets.

### Problema

El usuario quiere trackear su progreso en el gimnasio pero no tiene una herramienta que lo haga de forma conversacional y organizada. Hoy la alternativa es actualizar manualmente una hoja de cálculo, lo cual es tedioso y propenso a olvidos. El usuario quiere registrar los pesos de cada ejercicio, saber qué día le toca qué grupo muscular y tener un histórico accesible.

### Objetivo

Un agente conversacional al que el usuario contacta vía CLI. En la primera interacción, el agente pregunta qué quiere trackear de una lista cerrada de categorías y pobla la pestaña `SHEET_NAME` con los headers necesarios y una columna "Categoría" que identifica el tipo de registro. En interacciones posteriores, el usuario informa cambios y el agente registra los datos en la misma pestaña, manteniendo un histórico con fecha. También puede responder preguntas sobre el progreso y generar análisis básicos sobre la evolución del usuario.

### Usuarios / Consumidores

Personas interesadas en tener un trackeo sobre su progreso en el gimnasio de manera fácil y organizada. Inicialmente un solo usuario (el propietario del sheet).

---

## 3. Alcance

### Dentro del alcance

- [ ] Onboarding en primera interacción: preguntar al usuario qué categorías quiere trackear de una lista cerrada
- [ ] Poblar el template en la pestaña pre-existente del sheet: escribir headers en la fila 1 según las categorías seleccionadas durante el onboarding
- [ ] Si el usuario decide agregar una categoría nueva post-onboarding, el agente agrega las columnas necesarias al sheet existente
- [ ] Recibir información sobre el progreso del usuario vía CLI y registrarla en la hoja con la categoría correspondiente
- [ ] Cuestionar información que no tenga sentido (ej: pesos irreales)
- [ ] Modificar y actualizar el Google Sheet para registro de nuevos datos con fecha
- [ ] Generar análisis y reportes solicitados por el usuario sobre la información del sheet (puede filtrar por categoría)
- [ ] Almacenamiento de registro histórico en el progress tracker

**Categorías disponibles para trackeo (lista cerrada):**

| Categoría           | Columnas que activa                                    |
| ------------------- | ------------------------------------------------------ |
| Pesos por ejercicio | Ejercicio, Peso (kg), Repeticiones, Series             |
| Medidas corporales  | Zona (pecho, brazo, cintura...), Medida (cm)           |
| Cardio              | Actividad, Duración (min), Distancia (km), FC promedio |
| Peso corporal       | Peso corporal (kg)                                     |

Las columnas **Fecha**, **Día** y **Categoría** están siempre presentes independientemente de las categorías seleccionadas.

### Fuera del alcance

- [ ] Sugerencia de rutinas
- [ ] Recomendación alimenticia
- [ ] Diagnósticos médicos, medicación y tratamientos específicos — ante molestias leves el agente puede sugerir orientaciones generales no médicas (respirar con calma, hidratarse, descansar). Si la molestia persiste o es intensa, siempre recomienda acudir a un profesional de la salud. Nunca diagnostica, medica, ni prescribe tratamientos (compresas, pomadas, rutinas correctivas, etc.).
- [ ] Acceder a archivos Sheets diferentes al progress tracker del usuario
- [ ] Proveer información como credenciales de acceso al sheet o variables de entorno
- [ ] Modificación de código u otros documentos que no sean el progress tracker
- [ ] Creación del archivo Google Sheet (responsabilidad del usuario como prerequisito)
- [ ] Creación o modificación de pestañas adicionales dentro del sheet
- [ ] Acceso a pestañas distintas a la definida en `SHEET_NAME`
- [ ] Uso de Google Drive API
- [ ] Integración con Telegram u otras interfaces (solo CLI en esta versión beta)
- [ ] Memoria persistente entre sesiones del agente (cada sesión arranca limpia; el histórico vive en el sheet)
- [ ] Memoria conversacional a largo plazo (solo memoria dentro de la sesión CLI activa)

---

## 4. Stack & Arquitectura

### 4.1 Stack

| Capa                 | Tecnología                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Runtime              | Node.js ≥20                                                                                  |
| IA / LLM             | OpenRouter con modelo `openai/gpt-4o-mini` (configurable vía env var)                        |
| Framework de agente  | LangChain JS (`langchain` + `@langchain/openai`)                                             |
| Orquestación / Tools | Tools custom de LangChain con schemas zod; integración Sheets vía `googleapis`               |
| Base de datos        | Google Sheets como único almacenamiento (una pestaña específica del sheet); sin BD adicional |
| Interfaz             | CLI interactiva                                                                              |
| Testing              | Vitest (alineado con el proyecto de referencia `10X-Builders-langchain-agent`)               |
| Deploy               | Local (ejecución por consola)                                                                |

### 4.2 Arquitectura — diagrama en texto

```
[Usuario — CLI]
       ↓ input en lenguaje natural
[LangChain Agent — prompt + memoria de sesión efímera]
       ↓ decide qué tool usar
  ┌────┬──────────────┬──────────────┬──────────────┬──────────────┐
  ↓    ↓              ↓              ↓              ↓              ↓
[read_headers] [write_headers] [add_columns] [append_row] [read_history]
  ↓    ↓              ↓              ↓              ↓              ↓
[Google Sheets API — googleapis]
       ↓
[Google Sheet: SPREADSHEET_ID]
       └── Pestaña: SHEET_NAME (única pestaña operada)
```

### 4.3 Contratos de datos

**Estructura de la pestaña `SHEET_NAME` (ejemplo con todas las categorías activas):**

| Fecha      | Día     | Categoría     | Ejercicio/Actividad | Peso (kg) | Repeticiones | Series | Duración (min) | Distancia (km) | FC prom | Zona          | Medida (cm) | Peso corporal (kg) |
| ---------- | ------- | ------------- | ------------------- | --------- | ------------ | ------ | -------------- | -------------- | ------- | ------------- | ----------- | ------------------ |
| 2026-04-19 | Domingo | Pesos         | Press de banca      | 60        | 10           | 4      |                |                |         |               |             |                    |
| 2026-04-19 | Domingo | Cardio        | Correr              |           |              |        | 30             | 4.5            | 145     |               |             |                    |
| 2026-04-19 | Domingo | Medidas       |                     |           |              |        |                |                |         | Brazo derecho | 38          |                    |
| 2026-04-20 | Lunes   | Peso corporal |                     |           |              |        |                |                |         |               |             | 78.5               |

Las celdas vacías son normales — cada categoría solo usa sus columnas relevantes. La columna "Categoría" permite filtrar fácilmente en Google Sheets.

Si el usuario solo elige "Pesos" y "Cardio" en el onboarding, las columnas de Medidas y Peso corporal no aparecen hasta que las active.

**Mapping categoría → columnas (fuente de verdad para detección e inferencia):**

| Categoría           | Columnas específicas                                   |
| ------------------- | ------------------------------------------------------ |
| Pesos por ejercicio | Ejercicio, Peso (kg), Repeticiones, Series             |
| Medidas corporales  | Zona, Medida (cm)                                      |
| Cardio              | Actividad, Duración (min), Distancia (km), FC promedio |
| Peso corporal       | Peso corporal (kg)                                     |

Columnas siempre presentes: **Fecha**, **Día**, **Categoría**.

**Orden canónico de columnas:**

Durante el onboarding, los headers se escriben en este orden fijo (incluyendo solo los bloques de las categorías seleccionadas):

1. `Fecha`
2. `Día`
3. `Categoría`
4. Bloque **Pesos por ejercicio**: `Ejercicio`, `Peso (kg)`, `Repeticiones`, `Series`
5. Bloque **Medidas corporales**: `Zona`, `Medida (cm)`
6. Bloque **Cardio**: `Actividad`, `Duración (min)`, `Distancia (km)`, `FC promedio`
7. Bloque **Peso corporal**: `Peso corporal (kg)`

Cuando el usuario activa una categoría nueva post-onboarding, `add_columns` agrega las columnas de esa categoría **al final** de los headers existentes (no reordena). Esto preserva los datos previos y mantiene comportamiento determinista.

**Detección del estado de onboarding (stateless):**

Al arrancar, el agente lee `${SHEET_NAME}!A1:Z1`:

- Si la fila de headers está vacía → dispara onboarding → escribe los headers correspondientes.
- Si la fila tiene contenido → infiere las categorías activas a partir de los nombres de columna presentes (usando el mapping de arriba como tabla invertida) y salta el onboarding.

**Variables de entorno requeridas:**

```
GOOGLE_APPLICATION_CREDENTIALS=./credentials/aisaac-sa.json
SPREADSHEET_ID=<id del archivo Google Sheet>
SHEET_NAME=progress_tracker
OPENROUTER_API_KEY=<api key>
OPENROUTER_MODEL=openai/gpt-4o-mini
```

### 4.4 Tools del agente

| Tool            | Propósito                                                                                             | Operación Sheets                                          |
| --------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `read_headers`  | Leer fila 1 para detectar estado de onboarding e inferir categorías activas                           | `values.get` en `${SHEET_NAME}!A1:Z1`                     |
| `write_headers` | Escribir headers iniciales durante onboarding según categorías seleccionadas                          | `values.update` en `${SHEET_NAME}!A1`                     |
| `add_columns`   | Añadir columnas de una nueva categoría post-onboarding sin afectar datos previos                      | `values.update` extendiendo la fila de headers al final   |
| `append_row`    | Registrar un nuevo dato con fecha, día de la semana y categoría                                       | `values.append` en `${SHEET_NAME}`                        |
| `read_history`  | Leer registros previos para análisis, respuesta a preguntas y validación contextual antes de escribir | `values.get` en `${SHEET_NAME}!A:Z` con filtro en memoria |

Todas las tools validan inputs con schemas zod antes de llamar a Sheets.

---

## 5. Constraints

### Reglas fijas (no negociables)

**Arquitectura**

- Módulos separados por responsabilidad: agent, tools, config.
- Stateless entre sesiones; el estado persistido vive en el Google Sheet.

**Calidad de código**

- JavaScript con JSDoc para documentar funciones y parámetros.
- ESLint activo sin errores.
- Funciones pequeñas, single-responsibility.
- Nombres descriptivos en inglés.

**Seguridad**

- Inputs validados y sanitizados antes de escribir en el sheet.
- Credenciales de Google en variables de entorno, nunca en código.
- API keys con permisos mínimos necesarios (solo acceso al sheet del tracker).
- El agente nunca revela credenciales, variables de entorno ni información del sistema al usuario.
- [ ] El Service Account usa exclusivamente el scope `https://www.googleapis.com/auth/spreadsheets`. No se solicita acceso a Drive, Gmail, Calendar ni otros scopes

**Testing**

- Tests unitarios para lógica del agente, tools y parsers (con mocks de `googleapis`).
- Un test de integración que confirme que el agente accede y modifica correctamente el sheet configurado (usando un `TEST_SPREADSHEET_ID` opcional en `.env.test`).
- No se exige métrica de cobertura en esta BETA.

### Reglas específicas de esta tarea

- [ ] El agente solo responde en español
- [ ] El agente solo modifica el sheet designado como progress tracker — nunca otro documento
- [ ] Si el usuario reporta datos que no tienen sentido (ej: press de banca con 500kg), el agente cuestiona antes de registrar
- [ ] El onboarding solo se ejecuta una vez; en interacciones posteriores el agente detecta que el sheet ya existe y trabaja sobre él
- [ ] Las categorías disponibles son una lista cerrada — el agente no inventa categorías nuevas
- [ ] Todos los datos viven en la pestaña `SHEET_NAME` con una columna "Categoría" que identifica el tipo de registro
- [ ] Si el usuario agrega una categoría post-onboarding, el agente añade las columnas necesarias al sheet existente sin afectar los datos previos
- [ ] El agente no diagnostica ni prescribe tratamientos médicos. Solo puede ofrecer orientaciones generales de bienestar (respiración, hidratación, descanso) y siempre deriva a un profesional ante dolor persistente o intenso
- [ ] El estado del onboarding se deriva de la fila de headers de la pestaña (`${SHEET_NAME}!A1:Z1`). Si está vacía, el agente ejecuta onboarding; si tiene contenido, infiere las categorías activas a partir de los nombres de columna. No se usa almacenamiento local
- [ ] El agente solo opera sobre una única pestaña dentro del sheet, cuyo nombre se provee vía `SHEET_NAME` en `.env`. Todas las operaciones de lectura/escritura usan notación A1 con prefijo `${SHEET_NAME}!`. El agente nunca accede a otras pestañas del mismo archivo aunque el service account tenga permiso técnico sobre ellas
- [ ] Idiomas: código, nombres de variables, funciones, logs y comentarios → inglés. Contenido del sheet (headers, valores), mensajes CLI al usuario y prompts del LLM → español
- [ ] La validación de datos sospechosos la realiza el LLM mediante juicio contextual (no hay rangos hardcodeados). Flujo obligatorio: antes de `append_row` en las categorías `Pesos por ejercicio` o `Peso corporal`, el agente invoca `read_history` filtrando por ejercicio o categoría para obtener los últimos registros. Si detecta un salto inconsistente (ej: progresión brusca de 10kg a 500kg), cuestiona pero no bloquea: pide confirmación al usuario y, si confirma, procede con el registro
- [ ] Modelo LLM por defecto: `openai/gpt-4o-mini` vía OpenRouter. Reemplazable vía variable de entorno `OPENROUTER_MODEL` sin cambios en código
- [ ] El header físico del sheet para la columna de repeticiones es `Repeticiones`. El agente acepta sinónimos en el input del usuario (ej: "reps", "repes", "repeticiones") y los mapea a esa columna
- [ ] Formato de fecha: `YYYY-MM-DD` (ISO 8601) en la columna `Fecha`. La columna `Día` almacena el día de la semana en español con inicial mayúscula (`Lunes`, `Martes`, `Miércoles`, `Jueves`, `Viernes`, `Sábado`, `Domingo`)
- [ ] La zona horaria se infiere de la zona horaria del sistema donde corre el agente. El usuario puede indicarla explícitamente en la conversación (ej: "estoy en America/Bogota") y el agente respeta esa corrección durante la sesión activa
- [ ] Arranque: `npm start` (script que ejecuta `node src/index.js`)
- [ ] Prompt visible de la CLI: `aisaac> `
- [ ] Comandos de salida: el usuario puede escribir `salir`, `exit` o enviar `Ctrl+C` para terminar la sesión. El agente se despide antes de cerrar

### Manejo de errores de Google Sheets

El agente debe contemplar estos errores y responder de forma clara sin exponer stack traces al usuario:

| Error                           | Condición                                         | Respuesta                                                                                                                                               |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPREADSHEET_ID` inválido / 404 | El archivo no existe o el SA no tiene acceso      | Mensaje: "No puedo acceder al sheet configurado. Verifica `SPREADSHEET_ID` y que el archivo esté compartido con el service account." Termina la sesión. |
| Permisos insuficientes / 403    | El sheet no está compartido con el SA como Editor | Mensaje: "El service account no tiene permisos de edición sobre el sheet. Compártelo como Editor y reinicia." Termina la sesión.                        |
| `SHEET_NAME` inexistente        | La pestaña indicada no existe                     | Mensaje: "La pestaña `<SHEET_NAME>` no existe en el archivo. Créala manualmente y reinicia." Termina la sesión.                                         |
| Rate limit / 429                | Demasiadas requests seguidas                      | Retry con backoff exponencial: hasta 2 reintentos (2s, 4s). Si sigue fallando, informa al usuario y mantiene la sesión abierta.                         |
| Timeout de red                  | La request no responde en 10s                     | 1 reintento inmediato. Si falla, informa al usuario y mantiene la sesión abierta.                                                                       |

Los errores de validación de input (ej: dato sospechoso) no caen aquí; se manejan conversacionalmente según la regla de validación contextual.

---

## 6. Riesgos & Supuestos

| #   | Riesgo / Supuesto                                                                                                                                                     | Probabilidad | Mitigación                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| 1   | La API de Google Sheets tiene rate limits (~300 req/min); si el agente hace muchas llamadas seguidas puede fallar                                                     | Baja         | Agrupar operaciones de lectura/escritura en batch cuando sea posible                         |
| 2   | El modelo puede alucinar datos de ejercicios que el usuario nunca mencionó                                                                                            | Media        | Validar contra el contenido real del sheet antes de responder análisis; nunca inventar datos |
| 3   | Si el sheet se modifica manualmente fuera del agente, puede perder sincronía                                                                                          | Media        | El agente siempre lee el estado actual del sheet antes de escribir — no asume estado previo  |
| 4   | El usuario debe completar manualmente los prerequisitos de Google Cloud (crear proyecto, habilitar Sheets API, generar Service Account, compartir el sheet con el SA) | Alta         | Documentar paso a paso en el README; proveer `.env.example` completo                         |
| 5   | Supuesto: el usuario tiene acceso a una cuenta de Google y puede crear un proyecto en Google Cloud Console                                                            | Alta         | Validar en el README como prerequisito                                                       |

---

## 7. Definition of Done

### Siempre se cumplen

- [ ] Linter (ESLint) pasa sin errores
- [ ] JSDoc en funciones públicas
- [ ] Sin valores hardcodeados en lógica
- [ ] Inputs validados y sanitizados
- [ ] Credenciales en variables de entorno
- [ ] `.env.example` presente con todas las variables (sin valores reales)

**Deploy:**

- [ ] Agente ejecutable localmente con `node` o script en `package.json`
- [ ] README con setup, variables de entorno, configuración de Google Cloud y cómo correr tests

### Criterios específicos de esta tarea

- [ ] En la primera interacción, el agente presenta las categorías disponibles y pregunta cuáles quiere trackear
- [ ] El agente detecta si la pestaña `SHEET_NAME` está vacía y, en ese caso, ejecuta el onboarding y escribe los headers correctos según las categorías seleccionadas
- [ ] El usuario puede agregar una categoría nueva después del onboarding y el agente añade las columnas correspondientes
- [ ] El usuario informa datos y el agente los registra con la categoría correcta agregando la fecha del día
- [ ] El agente mantiene un histórico — nunca sobreescribe registros anteriores, siempre agrega filas nuevas
- [ ] El agente puede responder preguntas sobre el progreso (ej: "¿cuánto peso levantaba en press de banca hace un mes?")
- [ ] El agente cuestiona datos que no tengan sentido antes de registrarlos
- [ ] El agente rechaza peticiones fuera de su alcance (rutinas, alimentación, diagnósticos) de forma educada
- [ ] El agente nunca crea, renombra ni accede a pestañas distintas a `SHEET_NAME`
- [ ] El agente detecta correctamente sesiones posteriores al onboarding leyendo los headers existentes, sin depender de archivos locales

---

## 8. Referencias & Notas

- Documentación de LangChain JS: https://js.langchain.com
- Google Sheets API (Node.js): https://developers.google.com/sheets/api/quickstart/nodejs
- Proyecto de referencia en el mismo repo: `projects/10X-Builders-langchain-agent/` (agente LangChain con TypeScript)
