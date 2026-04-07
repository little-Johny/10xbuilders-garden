---
title: "MCP en Practica: Supabase Local + Skills"
week: 2
lesson: 6
tags: [mcp, supabase, docker, skills, cursor, postgresql, migraciones]
date: 2026-03-22
status: done
---

# MCP en Practica: Supabase Local + Skills

> **Síntesis.** Conectar una base **Supabase** local al editor mediante **MCP** permite operar sobre datos y esquemas reales sin abandonar el flujo de trabajo, mientras los **skills** orquestan **CLI**, llamadas al protocolo y verificaciones para que el agente no quede atrapado en comandos interactivos o errores silenciosos.

## Introducción

Desarrollar contra una base real —aunque sea local— exige **reproducibilidad**: mismas migraciones, mismos contenedores, mismo esquema versionado en git. **Docker** aísla la infraestructura; la **CLI de Supabase** levanta PostgreSQL y servicios asociados. **MCP** estructura el acceso desde Cursor u otro cliente. **MCP Inspector** permite depurar antes de automatizar. Los **skills** van un paso más allá del «wrapper»: combinan pasos, manejo de errores y comprobaciones. La lección recorre ese stack y las **fricciones** habituales (comandos interactivos, SQL que falla sin señal clara, timeouts).

## Objetivos de aprendizaje

1. Levantar una instancia **local de Supabase** con Docker y gestionar **migraciones** versionadas en git.
2. Configurar **MCP** en Cursor mediante el archivo de configuración del editor para hablar con herramientas externas de forma estructurada.
3. Usar **MCP Inspector** para depurar conexiones, explorar esquemas y validar respuestas antes de integrar todo en un skill.
4. Diseñar **skills** que orquesten llamadas MCP y CLI, con manejo explícito de errores y de modos no interactivos.

## Marco conceptual

### Docker y entorno reproducible

**Docker** empaqueta servicios en contenedores de modo que otro desarrollador puede recrear el mismo estado con comandos declarados. Eso permite experimentar sin contaminar el sistema host ni una base compartida accidentalmente.

### Supabase local y migraciones

**Supabase** en local aporta **PostgreSQL** y herramientas coherentes con el producto cloud. Las **migraciones** son archivos SQL incrementales versionados junto al código: cada cambio de esquema queda **auditable** y reversible, alineado con prácticas de equipo.

### MCP como capa de acceso

**MCP** define cómo el cliente descubre **recursos** (lecturas: esquemas, metadatos) y **herramientas** (acciones: consultas, comandos acotados) con permisos explícitos. En `.cursor/mcp.json` (o equivalente) se registran los **servidores** disponibles: comando, argumentos y habilitación.

### MCP Inspector

**MCP Inspector** (por ejemplo vía `npx @modelcontextprotocol/inspector`) abre una interfaz para probar servidores MCP: lista herramientas y recursos, permite ajustar parámetros y ver respuestas **sin** tocar aún la base productiva ni el skill final. Es el lugar indicado para validar conectividad y semántica antes de automatizar.

### Skills como orquestación

Un skill útil no se limita a «llamar al MCP». Combina **lógica condicional**, composición de pasos (CLI + MCP + verificación), manejo de fallos y mensajes claros. En proyectos de clase suele haber un skill más orientado a **modificación** (por ejemplo migraciones vía CLI) y otro a **inspección** (consultas de solo lectura vía MCP), lo que separa rutas peligrosas de exploración segura.

### Fricciones frecuentes

Los comandos **interactivos** de algunas CLIs pueden bloquear al agente: la mitigación típica es usar flags **no interactivos** donde existan. Los errores SQL a veces pasan **silenciosos** en flujos largos: conviene **verificar** con un paso de inspección o test. Las operaciones largas pueden **timeout**: partirlos en subpasos o acotar alcance reduce sorpresas.

### Flujo en capas

En líneas generales el recorrido es: **Cursor** lee configuración MCP → **servidor MCP** → **Supabase CLI** u operaciones sobre **Docker** (PostgreSQL). Cada capa tiene una responsabilidad; el **skill** documenta y encadena el recorrido para el agente.

## Síntesis

Supabase local más MCP más skills forma un **sistema**: datos reproducibles, acceso estructurado desde el editor y orquestación explícita que absorbe la complejidad operativa (incluidas las fricciones de terminal y SQL).

## Preguntas de repaso

1. Si un comando de Supabase **congela** Cursor, ¿cuál es una causa probable y cómo la abordarías?
2. ¿Qué ventaja tiene que las migraciones SQL vivan en **git** junto al código de aplicación?
3. Antes de integrar un MCP en un skill, ¿qué herramienta usarías para validar que responde como esperás y por qué?

## Notas Personales

El hilo práctico de la clase fue **armar la base del `twitter-clon`**: Supabase local con **Docker**, **CLI** para migraciones versionadas en git, **MCP** en Cursor y dos **skills** que separan lo peligroso (cambiar esquema) de lo seguro (solo lectura).

**Supabase CLI.** Hace falta para `supabase start`, `db reset` y crear/aplicar migraciones. En este monorepo la CLI viene como dependencia de desarrollo en la raíz de `projects/twitter-clon/`: tras `npm install` ahí, conviene usar **`npx supabase …`** para alinear la versión con el `package.json`. Alternativa: instalar global con Homebrew (`brew install supabase/tap/supabase`) o `npm install -g supabase`. El detalle de opciones está en el README del proyecto (`projects/twitter-clon/README.md`, sección de herramientas y Supabase CLI).

**Configuración MCP en el repo.** El servidor que usa el curso apunta al endpoint que expone Supabase local cuando los contenedores están arriba. El archivo vive en `projects/twitter-clon/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "local-supabase": {
      "url": "http://localhost:54321/mcp",
      "headers": {}
    }
  }
}
```

Sin `npx supabase start` (o equivalente), ese URL no responde: el MCP depende del stack local en el puerto **54321**.

**Cursor y reconocimiento del MCP.** Conviene abrir **como carpeta de trabajo la raíz donde está `.cursor/`** —en la práctica, `projects/twitter-clon/`— para que el editor cargue `mcp.json` del proyecto sin ambigüedades. Para comprobar que el servidor está registrado y habilitado: **Cmd + Shift + P** (macOS) → buscar **MCP** → **View Open MCP settings** (o el comando equivalente que liste servidores MCP).

**Depuración previa al skill.** Antes de confiar en el flujo dentro del agente, tiene sentido probar el servidor con **`npx @modelcontextprotocol/inspector`** (paquete npm oficial del MCP Inspector), igual que en el cuerpo de la lección: misma idea, nombre de paquete correcto.

**Los dos skills del repo.** En `projects/twitter-clon/.cursor/skills/` quedaron **`modifying-db`** (migraciones vía CLI, directorio de trabajo la raíz del twitter-clon, cuidado con comandos no interactivos) e **`inspecting-db`** (inspección **solo lectura** vía herramientas del MCP **`local-supabase`**, sin usar el MCP para mutar esquema o datos). Esa división evita mezclar SQL destructivo con exploración.

**Migraciones y esquema inicial.** Las migraciones SQL versionadas viven en `projects/twitter-clon/supabase/migrations/`; el esquema inicial del curso cubrió lo necesario para el producto (perfiles, tweets, relaciones, RLS, etc.) y el flujo de **generar migración + aplicar en local** quedó encapsulado en el skill de modificación, alineado con lo que ya dice el marco conceptual sobre git y reproducibilidad —acá solo el ancla al árbol real del repositorio.
