## 1. Objetivo del producto

Construir un agente que permita a un usuario **gestionar tareas y ejecutar acciones útiles** desde chat: consultar calendario y correo, buscar documentos, disparar workflows internos, operar GitHub en casos acotados. El sistema debe priorizar **control, trazabilidad, seguridad y costos predecibles** por encima de “autonomía máxima”.

## Qué problema resuelve el MVP

**“Un usuario conversa con el agente, el agente entiende la intención, consulta o ejecuta herramientas permitidas, guarda contexto útil y pide confirmación cuando la acción es sensible.”**

Ejemplos de tareas válidas para MVP:

- “Muéstrame mis pendientes de hoy.”
- “Resume los correos no leídos importantes.”
- “Busca el documento donde hablé de X.”
- “Crea un evento mañana a las 3 pm.”
- “Abre un issue en GitHub con este resumen.”
- “Lanza un workflow interno para generar un reporte.”
- “Programa una tarea larga y avísame cuando termine.”

Eso es más realista que intentar desde el día 1 un agente autónomo multiobjetivo. La razón técnica es simple: los proveedores actuales soportan tool use/function calling, pero el valor de producción aparece cuando tú controlas el loop, las políticas y el estado, no cuando delegas todo al modelo.

## Decisión principal de arquitectura

La mejor forma de construirlo con ese stack es esta:

**Next.js** como interfaz de usuario y canal web inicial.
**Node.js + TypeScript** como gateway/API unificado.
**LangGraph** como runtime del agente y grafo de decisión.
**Supabase Postgres** como sistema de registro: usuarios, sesiones, mensajes, tool calls, memoria y auditoría.
**OpenRouter** como router principal de modelos para flexibilidad y fallback, con soporte directo para OpenAI/Anthropic cuando convenga por costo, latencia o fiabilidad.

## Arquitectura propuesta

```text
[ Next.js Web App ]
        |
        v
[ Gateway/API - Node.js + TypeScript ]
        |
        +--> Auth / User Context
        +--> Policy Engine / Guardrails
        +--> LangGraph Runtime
        +--> Tool Adapters
        +--> Job Enqueuer
        |
        v
[ Supabase ]
  - users
  - sessions
  - messages
  - tool_calls
  - memory
  - documents
  - audit_log
  - embeddings (optional)
        |
        +--> pgvector (optional)
        |
        v
[ External Systems ]
  - Calendar
  - Email
  - GitHub
  - Internal workflows
  - Restricted shell
```

## Flujo operativo

### Flujo de una petición

1. El usuario envía mensaje desde web.
2. El gateway autentica y carga:
   - perfil
   - permisos
   - estado de sesión

3. El runtime de LangGraph recibe:
   - mensaje actual
   - resumen de sesión
   - memoria útil
   - catálogo de tools permitidas para ese usuario

4. El grafo decide entre:
   - responder directo
   - pedir aclaración
   - llamar herramienta
   - pedir confirmación humana
   - delegar a cola

5. Si hay tool call:
   - pasa por policy engine
   - valida esquema
   - ejecuta adapter
   - guarda resultado y trazas

6. Si la tarea excede tiempo/costo:
   - crea job
   - responde “tarea programada”

7. Se persiste todo:
   - input
   - decisiones
   - tools usadas
   - costos
   - output
   - eventos de auditoría
