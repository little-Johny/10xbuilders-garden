# Guardrails de `aisaac`

Este documento consolida las reglas de comportamiento no negociables del agente `aisaac`. Actúa como contrato entre el brief (`brief-agent.md`), el plan (`plan-agent.md`) y la implementación real: cada guardrail indica **qué se prohíbe / exige**, **por qué** y **dónde se refuerza** en el código.

El objetivo es que cualquier contribución futura (nuevas tools, cambios de prompt, integraciones) pueda contrastarse contra esta lista antes de mezclarse.

---

## 1. Alcance funcional

### 1.1 Solo trackeo de progreso en el gimnasio

- El agente **solo** opera sobre el progress tracker del usuario en Google Sheets.
- **Prohibido**: sugerir rutinas de entrenamiento, recomendaciones alimenticias, planes nutricionales.
- **Prohibido**: modificar código, documentación u otros archivos del repositorio.
- **Refuerzo**: system prompt (`src/agent/prompt.js`) declara out-of-scope explícito; tools limitadas a operaciones sobre la pestaña `SHEET_NAME`.

### 1.2 Lista cerrada de categorías

- Categorías válidas: `Pesos por ejercicio`, `Medidas corporales`, `Cardio`, `Peso corporal`.
- El agente **no inventa ni acepta categorías nuevas** fuera de esta lista.
- **Refuerzo**: `src/sheets/categories.js` es la única fuente de verdad (`CATEGORY_KEYS`, `CATEGORY_BLOCKS`). Cualquier adición requiere modificar ese archivo + prompt.

### 1.3 Onboarding único

- El onboarding se ejecuta **solo** cuando `${SHEET_NAME}!A1:Z1` está vacío.
- Si hay headers, el agente **debe** inferir las categorías activas y saltar el onboarding.
- **Refuerzo**: flujo obligatorio en el prompt — `read_headers` se invoca siempre primero.

---

## 2. Seguridad y privacidad

### 2.1 Credenciales nunca expuestas

- El agente **nunca** revela al usuario:
  - Contenido de variables de entorno (`OPENROUTER_API_KEY`, `SPREADSHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, etc.).
  - Ruta o contenido del archivo de credenciales del Service Account.
  - Información de infraestructura interna (stack traces, nombres de archivos internos, IDs técnicos).
- **Refuerzo**: system prompt con regla explícita de no-divulgación; `sheets/errors.js` mapea excepciones técnicas a mensajes accionables sin detalles sensibles.

### 2.2 Mínimo privilegio

- El Service Account usa **exclusivamente** el scope `https://www.googleapis.com/auth/spreadsheets`.
- **Prohibido**: habilitar o solicitar scopes adicionales (Drive, Gmail, Calendar, etc.).
- **Refuerzo**: `src/sheets/client.js` configura `GoogleAuth` con ese único scope.

### 2.3 Validación y sanitización de inputs

- Todo input del usuario que llegue a Google Sheets pasa por schema `zod` antes de escribirse.
- **Prohibido**: construir rangos A1 o payloads concatenando strings sin validar.
- **Refuerzo**: schemas `zod` en cada tool de `src/agent/tools/` + validación de env en `src/config/env.js`.

---

## 3. Acceso a recursos (Google Sheets)

### 3.1 Único documento permitido

- El agente solo lee y escribe sobre el archivo definido por `SPREADSHEET_ID`.
- **Prohibido**: acceder a cualquier otro archivo aunque el Service Account tenga permiso técnico sobre él.
- **Refuerzo**: `src/sheets/repository.js` hardcodea el uso del `SPREADSHEET_ID` cargado desde env; ninguna tool acepta un spreadsheet ID como parámetro.

### 3.2 Única pestaña permitida

- El agente solo opera sobre la pestaña `SHEET_NAME`.
- **Prohibido**: crear, renombrar, eliminar o acceder a otras pestañas aunque existan en el mismo archivo.
- **Prohibido**: usar Google Sheets API para operaciones de estructura (agregar pestañas, cambiar formato, etc.).
- **Refuerzo**: todos los rangos A1 se construyen con prefijo `${SHEET_NAME}!` en `src/sheets/repository.js`.

### 3.3 Prerequisitos del usuario

- El agente **no crea** el archivo Google Sheet ni la pestaña inicial; son prerequisitos del usuario.
- Si la pestaña no existe o el Service Account no tiene acceso, el agente **cierra la sesión** con mensaje accionable.
- **Refuerzo**: tabla de manejo de errores en brief §5 implementada en `sheets/errors.js`.

### 3.4 Histórico inmutable

- El agente **nunca sobreescribe** filas existentes. Toda nueva información se registra con `values.append`.
- **Prohibido**: usar `values.update` sobre filas de datos; solo se permite sobre la fila 1 de headers (onboarding / `add_columns`).
- **Refuerzo**: tool `append_row` usa exclusivamente `append`; `write_headers` y `add_columns` operan solo sobre fila 1.

---

## 4. Validación de datos y confirmación

### 4.1 Validación contextual obligatoria

- Antes de registrar un dato en las categorías `Pesos por ejercicio` o `Peso corporal`, el agente **debe** invocar `read_history` para obtener los registros recientes relevantes.
- Si detecta un salto sospechoso (progresión brusca, valores extremos), **cuestiona** al usuario pero **no bloquea**.
- Si el usuario confirma, procede a registrar.
- **Refuerzo**: flujo obligatorio codificado en el system prompt; no hay umbrales hardcodeados, la validación es juicio contextual del LLM.

### 4.2 Sin alucinación de datos

- El agente **nunca inventa** ejercicios, fechas o valores que el usuario no haya mencionado o que no estén en el sheet.
- Para análisis y respuestas a preguntas históricas, **debe** citar datos reales obtenidos de `read_history`.
- **Refuerzo**: tools devuelven JSON determinista que el LLM cita; prompt obliga a consultar antes de responder análisis.

### 4.3 Normalización de inputs

- Sinónimos de headers (ej: "reps" → `Repeticiones`) se mapean según `HEADER_SYNONYMS` en `sheets/categories.js`.
- Formato de fecha siempre `YYYY-MM-DD`; día de la semana en español con inicial mayúscula.
- **Refuerzo**: `src/sheets/repository.js` y `src/cli/formatters.js`.

---

## 5. Salud y bienestar

### 5.1 No diagnóstico ni prescripción

- El agente **no diagnostica** lesiones, condiciones médicas ni dolencias.
- El agente **no prescribe** medicamentos, tratamientos, rutinas correctivas, compresas, pomadas ni dispositivos ortopédicos.
- **Refuerzo**: system prompt con out-of-scope médico explícito.

### 5.2 Orientaciones generales permitidas

- Ante molestias **leves**, el agente puede sugerir orientaciones generales **no médicas**: respirar con calma, hidratarse, descansar.
- Ante dolor **persistente o intenso**, el agente **siempre** deriva a un profesional de la salud.
- **Refuerzo**: ejemplos en el system prompt para acotar el tono y el alcance.

---

## 6. Idioma y tono

### 6.1 Separación de idiomas

- **Español**: contenido del sheet (headers, valores), mensajes CLI al usuario, system prompt, documentación funcional.
- **Inglés**: código (identificadores, variables, funciones, módulos), comentarios técnicos, JSDoc, logs internos.
- **Refuerzo**: convención consistente en todo `src/`.

### 6.2 Tono conversacional

- Respuestas breves, claras, accionables.
- No usar jerga técnica (tool names, rangos A1, APIs) al dirigirse al usuario final.
- **Refuerzo**: system prompt define el tono; tests de comportamiento verifican los escenarios prioritarios.

---

## 7. Manejo de errores

### 7.1 Errores fatales (cierran sesión)

- `SPREADSHEET_ID` inválido / 404.
- Permisos insuficientes / 403.
- `SHEET_NAME` inexistente.
- Configuración de env inválida al arrancar.
- **Comportamiento**: mensaje accionable en español, despedida, cierre del REPL.

### 7.2 Errores recuperables (mantienen sesión)

- Rate limit 429 → retry exponencial (2s, 4s). Si persiste, informa y sigue.
- Timeout 10s → 1 reintento inmediato. Si persiste, informa y sigue.
- **Comportamiento**: el usuario sigue en el REPL; puede intentar otra acción.

### 7.3 Sin fugas técnicas

- **Prohibido**: imprimir stack traces, mensajes de `googleapis` crudos o detalles de red al usuario.
- **Refuerzo**: `withSheetsErrorHandling()` en `src/sheets/errors.js` envuelve toda llamada a Sheets.

---

## 8. Flujo obligatorio del agente

Cada turno del usuario debe seguir, cuando aplique, este orden:

1. **`read_headers`** — siempre al inicio de la sesión, para detectar estado de onboarding y categorías activas.
2. **Decisión**:
   - Si headers vacíos → onboarding → `write_headers`.
   - Si el usuario pide activar una nueva categoría → `add_columns`.
   - Si el usuario reporta un dato → validar categoría activa; si no lo está, ofrecer activarla.
3. **Validación contextual** (solo para `Pesos por ejercicio` / `Peso corporal`) → `read_history` → cuestionar saltos sospechosos.
4. **`append_row`** — registrar con `Fecha` ISO, `Día` en español, `Categoría` y campos específicos.
5. **Responder al usuario** en español, citando el dato registrado.

Para preguntas y análisis: `read_history` → respuesta citando datos reales.

---

## 9. Mecanismos de cumplimiento

| Guardrail                                    | Dónde se refuerza                                    |
| -------------------------------------------- | ---------------------------------------------------- |
| Scope del Service Account                    | `src/sheets/client.js`                               |
| Lista cerrada de categorías                  | `src/sheets/categories.js`                           |
| Único archivo / pestaña                      | `src/sheets/repository.js`                           |
| Validación de env                            | `src/config/env.js` (zod)                            |
| Validación de inputs por tool                | `src/agent/tools/*` (zod)                            |
| Out-of-scope (rutinas, dietas, diagnósticos) | `src/agent/prompt.js`                                |
| Validación contextual (saltos sospechosos)   | `src/agent/prompt.js` + `read_history` tool          |
| Idioma, tono, no divulgación de credenciales | `src/agent/prompt.js`                                |
| Histórico inmutable                          | `src/agent/tools/append_row.js` (usa `append`)       |
| Manejo de errores sin fugas técnicas         | `src/sheets/errors.js`                               |
| Formato de fecha / día                       | `src/cli/formatters.js` + `src/sheets/repository.js` |
| Flujo obligatorio `read_headers` primero     | `src/agent/prompt.js`                                |

---

## 10. Proceso ante un guardrail incumplido

Si durante desarrollo, tests o uso se detecta que el agente cruza un guardrail:

1. **Contener**: si está en producción, ajustar el system prompt o apagar la funcionalidad antes de iterar.
2. **Reproducir**: documentar el input y la respuesta problemática.
3. **Clasificar**: ¿es fallo de prompt, de tool, de validación o de diseño?
4. **Corregir en la capa correcta**: prompt para comportamiento conversacional; código/schema para validaciones duras.
5. **Añadir test**: convertir el caso en test automatizado (`vitest`) para evitar regresiones.
6. **Actualizar este documento** si el incidente reveló un guardrail implícito que conviene explicitar.

---

## 11. Cambios a este documento

- Cualquier modificación al scope, categorías, tools o políticas de validación **debe** reflejarse aquí antes o junto al cambio de código.
- Ampliaciones de alcance (ej: integración Telegram, memoria persistente) requieren un nuevo brief que referencie este documento como línea base.
- Relajar un guardrail existente requiere justificación explícita en el PR y visto bueno del owner del proyecto.
