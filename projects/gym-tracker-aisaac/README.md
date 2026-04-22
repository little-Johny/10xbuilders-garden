# aisaac — agente conversacional para tu progreso en el gimnasio

`aisaac` es un agente CLI en español que registra y consulta tu progreso en un Google Sheet. Habla contigo, detecta automáticamente si necesitas un onboarding, y mantiene un histórico inmutable en una sola pestaña.

- Categorías permitidas (cerradas): **Pesos por ejercicio**, **Medidas corporales**, **Cardio**, **Peso corporal**.
- Stack: Node.js ≥ 20, JavaScript ESM con JSDoc, LangChain JS sobre OpenRouter (`openai/gpt-4o-mini` por defecto), Google Sheets API.
- Fuera de alcance: rutinas, nutrición y diagnóstico médico (ver `docs/guardrails.md`).

Documentos relacionados:

- [`docs/brief-agent.md`](docs/brief-agent.md): especificación funcional.
- [`docs/architecture.md`](docs/architecture.md): arquitectura y decisiones clave.
- [`docs/guardrails.md`](docs/guardrails.md): reglas no negociables de comportamiento.
- [`docs/plan-agent.md`](docs/plan-agent.md): plan de implementación por fases.

## 1. Prerrequisitos

- Node.js 20+ y npm.
- Una cuenta de Google Cloud donde habilitar la Google Sheets API.
- Un Google Sheet ya creado con una pestaña vacía destinada al tracker.
- Una API key de [OpenRouter](https://openrouter.ai).

### 1.1 Configurar Google Cloud y el service account

1. Entra a [console.cloud.google.com](https://console.cloud.google.com/) y crea (o reutiliza) un proyecto.
2. Abre **APIs & Services → Library** y habilita **Google Sheets API**.
3. Ve a **APIs & Services → Credentials → Create credentials → Service account**.
4. Dale un nombre (por ejemplo `aisaac-agent`) y continúa sin asignar roles adicionales.
5. Abre el service account creado, pestaña **Keys → Add key → Create new key → JSON**.
6. Guarda el archivo dentro de `credentials/` (por ejemplo `credentials/aisaac.json`). Este directorio ya está ignorado por `git`.

### 1.2 Preparar el Google Sheet

1. Crea un Google Sheet nuevo (o reusa uno vacío) y copia su **Spreadsheet ID** (lo que está entre `/d/` y `/edit` en la URL).
2. Renombra la pestaña destino a `progress_tracker` (o usa otro nombre que luego pondrás en `SHEET_NAME`).
3. **Comparte el sheet como Editor** con el email del service account (algo como `aisaac-agent@tu-proyecto.iam.gserviceaccount.com`).
4. Deja la fila 1 completamente vacía. El agente llenará los headers durante el onboarding.

## 2. Setup del proyecto

```bash
cd projects/gym-tracker-aisaac
npm install
cp .env.example .env.local
```

Luego edita `.env.local` con tus valores. Las claves mínimas son:

```
OPENROUTER_API_KEY=sk-or-v1-...
GOOGLE_APPLICATION_CREDENTIALS=./credentials/aisaac.json
SPREADSHEET_ID=1Qm-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHEET_NAME=progress_tracker
```

Opcionales:

- `OPENROUTER_MODEL` (por defecto `openai/gpt-4o-mini`).
- `OPENROUTER_BASE_URL`, `OPENROUTER_TEMPERATURE`.
- `OPENROUTER_HTTP_REFERER` y `OPENROUTER_APP_TITLE` si OpenRouter te los pide.

El loader acepta tanto `.env.local` (preferido) como `.env` si ya existe en la carpeta.

## 3. Ejecutar el agente

```bash
npm run dev
# o
npm start
```

Al iniciar verás el mensaje de bienvenida y el prompt `aisaac> `. Para salir: escribe `salir` o presiona `Ctrl+C`.

### Ejemplos de conversación

- Primera vez (onboarding):
  - tú: `Hola`
  - aisaac: presenta las 4 categorías y te pregunta cuáles quieres trackear.
  - tú: `pesos y peso corporal`
  - aisaac: escribe los headers canónicos y confirma que está todo listo.

- Registrar un entrenamiento:
  - tú: `Hoy hice press de banca 4x10 con 60 kg`
  - aisaac: consulta el histórico, detecta saltos sospechosos, confirma y guarda la fila en la pestaña.

- Consultar progreso:
  - tú: `¿Cómo voy con la sentadilla este mes?`
  - aisaac: lee el histórico con filtro por ejercicio y te responde citando los datos reales.

- Activar una categoría nueva en plena conversación:
  - tú: `Ahora quiero empezar a medir mi cadera y cintura`
  - aisaac: agrega las columnas de **Medidas corporales** al final del header y registra tu primera fila.

## 4. Scripts disponibles

- `npm start` → ejecuta el agente.
- `npm run dev` → alias para sesiones locales.
- `npm run lint` → ESLint en `src/` y `tests/`.
- `npm run typecheck` → `tsc --noEmit` sobre JS + JSDoc (no produce archivos).
- `npm test` → suite Vitest.

## 5. Desarrollo

- `src/` contiene la app. Entrypoint: `src/index.js`.
- `src/config/env.js` valida el entorno con `zod` y expone `EnvValidationError`.
- `src/sheets/` encapsula Google Sheets: cliente, repositorio, categorías y clasificación de errores.
- `src/agent/` contiene el modelo, prompt y las 5 tools que el LLM puede invocar.
- `src/cli/` implementa el REPL y formatters.
- `tests/` contiene los tests Vitest agrupados por guardrail.

## 6. Modo debug

Si necesitas verificar que el agente está invocando realmente las tools (o por qué un registro no llegó al sheet), levanta el REPL con la bandera `AISAAC_DEBUG`:

```bash
AISAAC_DEBUG=1 npm start
```

Verás en `stderr`:

- `[debug:tool:read_headers] invoked {}` y `[debug:tool:read_headers] returned {"ok":true,...}` cada vez que una tool realmente se invoca.
- Trazas verbose de LangChain con cada decisión del agente.

Si el agente dice "registré X" pero no ves una línea `[debug:tool:append_row] returned {"ok":true,...}` en el mismo turno, significa que el modelo está alucinando la confirmación y **no** llamó a la herramienta. En ese caso:

- Prueba con otro modelo más fuerte en tool-calling (por ejemplo `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`) ajustando `OPENROUTER_MODEL` en `.env.local`.
- El prompt del sistema ya incluye una regla explícita contra este comportamiento, pero modelos pequeños a veces lo ignoran.

## 7. Troubleshooting

| Síntoma                                                                           | Causa probable                                                       | Acción                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `No puedo acceder al sheet configurado. Verifica SPREADSHEET_ID...`               | El ID está mal o el sheet no está compartido con el service account. | Comparte el archivo como **Editor** con el email del service account y confirma el `SPREADSHEET_ID`. |
| `El service account no tiene permisos de edición sobre el sheet.`                 | Compartiste solo como Viewer.                                        | Cambia el acceso a **Editor**.                                                                       |
| `La pestaña configurada no existe en el archivo.`                                 | `SHEET_NAME` no coincide con la pestaña.                             | Crea la pestaña o ajusta `SHEET_NAME`.                                                               |
| `Configuración incompleta o inválida. Revisa estas variables en tu .env.local...` | Faltan variables o están mal formadas.                               | Copia desde `.env.example` y completa.                                                               |
| `Google Sheets está respondiendo lento por demasiadas peticiones.`                | Rate limit temporal.                                                 | Esperá unos segundos; el agente vuelve a intentar automáticamente.                                   |
| `Tardamos demasiado en hablar con Google Sheets.`                                 | Timeout o red inestable.                                             | Reintenta; el REPL sigue operativo.                                                                  |

## 8. Privacidad y seguridad

- Tu archivo de credenciales nunca se loguea ni se incluye en commits (`credentials/` está en `.gitignore`).
- El agente solo tiene permiso `https://www.googleapis.com/auth/spreadsheets` y únicamente accede al `SPREADSHEET_ID` configurado.
- Los mensajes al usuario nunca incluyen stack traces, URLs internas ni nombres de APIs. Las reglas completas están en [`docs/guardrails.md`](docs/guardrails.md).
