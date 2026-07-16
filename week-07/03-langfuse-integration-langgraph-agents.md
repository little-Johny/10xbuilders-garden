---
title: "Integración de Langfuse en Agentes de LangGraph"
week: 7
lesson: 3
module: 6002
tags: [langfuse, langgraph, langchain, observabilidad, trazas, spans, callbacks, callback-handler, docker, docker-compose, self-hosting, variables-de-entorno, sdk-typescript, caja-negra, caja-blanca, cursor, depuracion, llm, agentes]
date: 2026-06-29
status: draft
---

# Integración de Langfuse en Agentes de LangGraph

> **Síntesis.** Las dos sesiones anteriores construyeron el marco mental; esta lo baja al teclado. **Langfuse** es una plataforma open source de observabilidad y evaluación para aplicaciones LLM, y la integramos en nuestro agente de LangGraph para transformarlo de **caja negra** —entra un prompt, sale una respuesta, nada visible en medio— a **caja blanca**: el grafo de ejecución completo, los inputs y outputs de cada nodo, los prompts del sistema, la inyección de memoria y el uso de herramientas, todo inspeccionable. La mecánica tiene tres piezas: (1) el **servidor** de Langfuse desplegado localmente con **Docker Compose**; (2) tres **variables de entorno** (`LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_HOST`) que autentican el código contra el servidor; y (3) el **`CallbackHandler`** del SDK de TypeScript, que se pasa en `{ callbacks: [...] }` al invocar el grafo y captura las **trazas** (una ejecución completa) con sus **spans** (cada paso interno) automáticamente, sin reescribir ninguna función. La advertencia que gobierna toda la práctica: si las credenciales no coinciden, las trazas **se pierden silenciosamente** — el agente sigue funcionando y nada avisa.

## Introducción

La sesión 1 nos dio el diagnóstico (la ilusión operativa, el stack de 4 capas) y la sesión 2 el mapa de la evaluación (output vs. trajectory, offline vs. online, el ciclo de mejora continua). Pero hasta aquí nuestro agente sigue siendo opaco: cuando responde mal, no sabemos si el fallo estuvo en la inyección de memoria, en la herramienta que eligió, en los documentos que recuperó o en el prompt final que recibió el modelo. Diagnosticar es adivinar.

Esta clase práctica instala la **capa 2 del stack de calidad** —la trazabilidad— con una herramienta concreta: **Langfuse**. Es el equivalente open source y self-hosteable de LangSmith: registra cada ejecución del agente como un árbol navegable donde cada nodo del grafo, cada llamada al LLM y cada tool call queda documentado con sus datos exactos.

El recorrido es de extremo a extremo: desplegar el servidor localmente con Docker Compose, crear cuenta/organización/proyecto, generar las API keys, configurar el `.env`, instalar el SDK, enganchar el `CallbackHandler` a la invocación del grafo, y finalmente **leer una traza real** en el dashboard. Como asistente de implementación usamos **Cursor** para adaptar la sintaxis del SDK a nuestra versión de LangGraph y resolver errores de tipado sobre la marcha.

## Objetivos de aprendizaje

1. **Configurar** un entorno local de Langfuse utilizando Docker Compose para habilitar la observabilidad de agentes.
2. **Integrar** el SDK de TypeScript de Langfuse en un proyecto de LangGraph mediante variables de entorno y callbacks.
3. **Emplear** un asistente de IA (Cursor) para automatizar y agilizar la modificación del código fuente durante la integración.
4. **Solucionar** problemas de conexión y registro de trazas depurando credenciales y gestionando los contenedores de Docker.
5. **Analizar** las trazas en la interfaz de Langfuse para examinar el grafo del agente, los inputs, outputs y el proceso de razonamiento del modelo.

## Marco conceptual

### ¿Qué es Langfuse?

**Langfuse** es una plataforma de observabilidad y evaluación **de código abierto** diseñada específicamente para aplicaciones basadas en LLMs. Permite rastrear, analizar y depurar el comportamiento de agentes y cadenas registrando detalladamente cada paso de su ejecución. Al ser open source y self-hosteable, podemos correrla **en nuestra propia máquina** con Docker — los datos de nuestras conversaciones nunca salen del entorno local, y no dependemos de un SaaS para aprender.

### De caja negra a caja blanca

La analogía central de la clase. Sin observabilidad, el agente es una **caja negra**: le enviamos un input y nos devuelve un output. Si falla o alucina, no sabemos *en qué nodo o herramienta* ocurrió el error — ¿fue la memoria inyectada? ¿la tool equivocada? ¿el prompt mal armado? Todo el proceso intermedio es invisible.

Al iluminar la caja con Langfuse, se vuelve **caja blanca**: vemos la **ruta exacta de toma de decisiones**, la inyección de memoria, y los metadatos paso a paso. El comportamiento se hace totalmente transparente. Es la materialización de lo que en la sesión 1 llamamos "reconstruir el árbol de ejecución" y en la sesión 2 "trazas estructuradas paso a paso" (la bandera roja #1 era conformarse con logs de texto).

### Trazas y spans: la unidad de observabilidad

La observabilidad en LLMs se organiza en dos niveles:

- **Traza (trace)** — Representa **una ejecución completa** del agente: por ejemplo, responder una pregunta del usuario de principio a fin. Es el "expediente" de ese turno.
- **Span** — Cada **paso individual** dentro de la traza: la llamada al LLM, la ejecución de una herramienta de búsqueda, la recuperación de memoria, un nodo del grafo. Los spans se anidan formando el árbol de ejecución.

Esta granularidad es la que permite medir **latencia, costos y calidad por paso**, no solo por respuesta. Nótese la correspondencia directa con la sesión 2: la traza completa es lo que necesita el *trajectory eval* — sin spans, solo podrías juzgar el output.

### Callbacks: escuchar sin reescribir

¿Cómo conectamos el código con Langfuse **sin tocar cada función** del agente? Con **callbacks**. Un callback es un mecanismo que "escucha" automáticamente los eventos que ocurren dentro de LangGraph —el inicio de un nodo, una generación de tokens, el fin de una tool— y envía esa información al servidor de Langfuse **en segundo plano**.

Este es el motivo por el que la integración es tan poco invasiva: LangChain/LangGraph ya emiten esos eventos internamente; el `CallbackHandler` de Langfuse solo se suscribe a ellos. El agente ni se entera de que está siendo observado.

### Anatomía de las variables de entorno

La autenticación entre nuestro código y el servidor usa **tres variables** en el `.env`:

| Variable | Rol |
|---|---|
| `LANGFUSE_SECRET_KEY` | Llave **privada** para autenticar contra el servidor (`sk-lf-...`) |
| `LANGFUSE_PUBLIC_KEY` | Llave **pública** que identifica la aplicación/proyecto (`pk-lf-...`) |
| `LANGFUSE_HOST` | URL base donde vive el servidor — en local, `http://localhost:3000` |

Las llaves se generan **por proyecto** dentro de la plataforma (Settings → API Keys), así que el par identifica unívocamente a qué proyecto de Langfuse van a parar las trazas.

### Docker y Docker Compose en el despliegue

Langfuse no es un solo proceso: trae interfaz web, worker, y varias bases de datos de soporte. **Docker** permite correr cada pieza en un contenedor aislado, y **Docker Compose** orquesta todo el conjunto con un solo comando (`docker compose up -d`), sin instalar nada en el sistema ni contaminar el entorno de desarrollo principal. El `-d` (*detached*) lo deja corriendo en segundo plano.

### ⚠️ Advertencias críticas

Dos trampas que gobiernan la depuración de esta práctica:

1. **Docker debe estar corriendo** antes de ejecutar el agente o abrir el panel. Si el motor está apagado, no hay servidor que reciba las trazas.
2. **Las trazas se pierden en silencio.** Si las credenciales del `.env` no coinciden *exactamente* con las generadas en la plataforma (un espacio al pegar, una llave de otro proyecto), las trazas **se pierden silenciosamente sin detener la ejecución del agente**. El agente responde normal, el dashboard queda vacío, y nada lanza error. Es un eco directo de la lección de la sesión 1: las fallas de observabilidad también son fallas silenciosas.

```mermaid
flowchart LR
  subgraph codigo["TU PROYECTO (TypeScript)"]
    direction TB
    env[".env<br/>LANGFUSE_SECRET_KEY<br/>LANGFUSE_PUBLIC_KEY<br/>LANGFUSE_HOST"]
    handler["CallbackHandler<br/>(langfuse-langchain)"]
    graph["Grafo LangGraph<br/>agent.invoke(inputs,<br/>{ callbacks: [handler] })"]
    env --> handler --> graph
  end

  subgraph eventos["EVENTOS ESCUCHADOS"]
    direction TB
    e1["inicio/fin de nodo"]
    e2["llamada al LLM<br/>(prompt exacto + respuesta)"]
    e3["tool calls + parámetros"]
    e4["inyección de memoria"]
  end

  subgraph servidor["SERVIDOR LOCAL · Docker Compose"]
    direction TB
    web["langfuse-web<br/>UI en localhost:3000"]
    dbs["worker + postgres +<br/>clickhouse + redis + minio"]
  end

  ui["DASHBOARD → Traces<br/>traza = ejecución completa<br/>spans = pasos anidados<br/>inputs · outputs · latencia · costo"]

  graph -. "emite" .-> eventos
  eventos -- "envío en segundo plano" --> servidor
  web --> ui

  warn["⚠️ credenciales que no coinciden<br/>= trazas perdidas EN SILENCIO<br/>(el agente sigue funcionando)"]
  handler -.-> warn
```

Leído de izquierda a derecha: el `.env` alimenta al **`CallbackHandler`**, que se pasa en `callbacks` al **invocar el grafo**. LangGraph emite eventos (nodos, LLM, tools, memoria) que el handler **escucha y envía en segundo plano** al servidor local levantado con **Docker Compose**. El dashboard los presenta como **trazas** navegables con sus **spans** anidados. El punto débil del circuito son las credenciales: si no coinciden, el flujo se corta sin ruido.

## Guía práctica

### Preparación

1. Abre **Docker Desktop** y verifica que el motor de contenedores esté en ejecución.
2. Abre la terminal y navega a la carpeta donde vivirá el servidor de Langfuse (fuera de tu proyecto).
3. Ten tu proyecto de LangGraph abierto en el editor (**Cursor** recomendado).

### Paso 1 — Despliegue local de Langfuse

```bash
git clone https://github.com/langfuse/langfuse.git
cd langfuse
docker compose up -d
```

- Espera ~2–3 minutos a que el contenedor `langfuse-web` reporte "Ready".
- Abre `http://localhost:3000` → pantalla de login de Langfuse.
- Crea una **cuenta local**, una **organización** base y un **proyecto** nuevo.

### Paso 2 — Configuración de credenciales

1. En el proyecto de Langfuse: **Settings → API Keys → generar par de llaves**.
2. En el `.env` de tu proyecto de código:

```bash
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_HOST="http://localhost:3000"
```

3. **Verifica que no haya espacios** al inicio o final de los valores pegados (recuerda: el fallo es silencioso).

### Paso 3 — Integración del SDK en el agente

```bash
npm install langfuse langfuse-langchain
```

En el archivo donde se inicializa/invoca el grafo:

```typescript
import { CallbackHandler } from "langfuse-langchain";

const langfuseHandler = new CallbackHandler({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
});

// Al invocar el agente:
await agent.invoke(inputs, { callbacks: [langfuseHandler] });
```

- Usa el chat de IA de **Cursor** para adaptar la sintaxis a tu versión de LangGraph o resolver errores de tipado.

### Paso 4 — Pruebas y depuración

1. Ejecuta el agente con un prompt de prueba.
2. En `localhost:3000` → pestaña **Traces** del menú lateral.
3. Si la traza **no aparece**: `docker compose restart` en la carpeta de Langfuse, y verifica que la app realmente cargó las credenciales del `.env`.
4. Reejecuta el agente → debería aparecer una nueva entrada en la lista de trazas.

### Paso 5 — Análisis de la traza (la caja blanca)

1. Haz clic en la traza recién generada.
2. Explora el **árbol de ejecución visual** del grafo.
3. Haz clic en los nodos individuales: **Inputs**, **Outputs**, inyección de memoria, mensajes del sistema.
4. Verifica en el detalle cómo se **seleccionó y ejecutó** cada herramienta — la caja negra ahora es transparente.

## Síntesis

Integrar Langfuse convierte al agente de LangGraph en una caja blanca con sorprendentemente poco código: el trabajo pesado lo hacen los **callbacks**, que escuchan los eventos internos del grafo y los envían en segundo plano al servidor. La arquitectura completa tiene tres capas: el **servidor** (clonado y levantado con `docker compose up -d`, viviendo en `localhost:3000`), la **autenticación** (tres env vars — secret key, public key, host — generadas por proyecto en la plataforma), y el **SDK** (`langfuse-langchain`, un `CallbackHandler` pasado en `{ callbacks: [...] }` al `invoke`). El resultado en el dashboard son **trazas** (una por ejecución) compuestas de **spans** (uno por paso: nodo, LLM, tool, memoria), navegables con sus inputs, outputs, latencia y costo — exactamente la trazabilidad que la capa 2 del stack de calidad exigía y la materia prima que el *trajectory eval* de la sesión 2 necesita. La lección de depuración más valiosa es la advertencia: **credenciales incorrectas no rompen nada — solo pierden las trazas en silencio**. Verificar Docker arriba y el `.env` sin espacios es el primer reflejo ante un dashboard vacío.

## Preguntas de repaso

1. Explica la analogía de caja negra → caja blanca. ¿Qué tres cosas concretas puedes ver con Langfuse que antes eran invisibles?
2. Diferencia **traza** y **span**, y da un ejemplo de una traza de tu agente con al menos tres spans distintos. ¿Por qué esta granularidad es prerrequisito del *trajectory eval* de la sesión anterior?
3. ¿Qué es un callback en LangChain/LangGraph y por qué permite integrar observabilidad **sin reescribir** las funciones del agente?
4. Enumera las tres variables de entorno de la integración y el rol de cada una. ¿Por qué las llaves se generan *por proyecto*?
5. Tu agente corre perfecto pero el dashboard de Langfuse está vacío. Describe tu checklist de depuración en orden (mínimo tres verificaciones) y explica por qué este fallo es especialmente traicionero.
6. ¿Qué rol cumplen Docker y Docker Compose en el despliegue? ¿Qué significa el flag `-d` y por qué conviene?
7. ¿En qué capa del stack de calidad de 4 capas (sesión 1) se ubica lo construido en esta clase, y qué capas quedan aún sin cubrir?

## Recursos

- [Langfuse — Docker Compose Deployment (Self-Hosted)](https://langfuse.com/self-hosting/docker-compose) — guía oficial del despliegue local: clonar el repo, `docker compose up`, y acceso en `localhost:3000`.
- [Langfuse — Integración con LangChain / LangGraph](https://langfuse.com/integrations/frameworks/langchain) — guía oficial del `CallbackHandler`: instalación del SDK, env vars, callbacks en el `invoke`, atributos de traza (sessionId, userId, tags) y flush.
- [Docker Compose — Documentación oficial](https://docs.docker.com/compose/) — referencia de `docker-compose.yml`, comandos `up`/`down`/`restart` y archivos override.
- [Langfuse — repositorio en GitHub](https://github.com/langfuse/langfuse) — el repo que se clona para el despliegue local.
- Conexión interna: [Observabilidad y Evaluación en Sistemas de IA](./01-observability-and-evaluation-in-ai-systems.md) — el marco (ilusión operativa, stack de 4 capas) que esta clase instrumenta.
- Conexión interna: [Evaluación y Observabilidad de Agentes de IA](./02-evaluation-and-observability-of-ai-agents.md) — las trazas capturadas aquí son la materia prima del *trajectory eval* y del ciclo de mejora continua.

## Notas personales

Implementé esto de verdad en `projects/10x-builders-agent` y la práctica difirió del guion en varios puntos que valen oro:

- **Conflicto de puerto**: mi agente ya corría en `localhost:3000` (Next.js). En vez de mover el agente (OAuth de GitHub/Google y Supabase tenían callbacks registrados a ese puerto), remapeé Langfuse a `3002` en el compose (`ports: "3002:3000"`). Regla: mueve al que llega, no al que tiene dependencias externas.
- **El nombre de la env var depende de la versión del SDK**: el SDK clásico v3 (`langfuse-langchain`) lee `LANGFUSE_BASEURL`, el v4 (`@langfuse/langchain`, basado en OpenTelemetry) lee `LANGFUSE_BASE_URL`, y el temario dice `LANGFUSE_HOST` (que acepta el constructor v3). Si pasas la URL explícita al constructor (`baseUrl: ...`) te independizas del nombre. Clásico fallo silencioso.
- **v3 vs v4**: la v4 requiere pipeline OTEL completo (`LangfuseSpanProcessor` + `NodeSDK` en el `instrumentation.ts` de Next) — sin registrarlo, el handler emite spans al vacío. La v3 es autocontenida (el handler exporta solo) y para este proyecto resultó más simple.
- **El flush importa**: en rutas serverless/vida corta, hacer flush (`flushAsync()` en v3) en un `try/finally` — solo en el camino feliz pierde justo las trazas de los turnos que fallan, que son las que más quieres ver.
- **RAM**: el stack self-hosted trae ClickHouse, que sin límite se come la memoria de forma agresiva. Vale ponerle techo con un `docker-compose.override.yml` (`mem_limit: 4g` a clickhouse, etc.) y bajar el stack (`docker compose down`) cuando no se está usando.
- **El OOM que casi me vuelve loco NO fue Langfuse**: al instalar el SDK con `npm install <pkg> --workspace=@agents/agent`, npm **podó los symlinks de los demás workspaces** y dejó el árbol de `node_modules` corrupto. Con el árbol roto, *todo lo que typechequea* se infla hasta reventar: el `tsc --noEmit` pasó de 1.2s/200MB a OOM (>4GB, con reintentos de hasta 12GB y procesos zombis), y —la parte traicionera— el **tsserver del editor** y el **chequeo de tipos de `next dev`** sufrían lo mismo de forma persistente. Levantar dev server + contenedores a la vez sumó tsc corruptos + tsserver + next dev + Docker = máquina de 24GB muerta en swap (el IDE reportaba "60GB", un artefacto de cómo Electron suma memoria compartida). **El fix: `npm install` a secas desde la raíz del monorepo**, que restaura los links — mismo código, type-check de vuelta a 1.2s. Doble lección: (1) tras cualquier install con `--workspace`, rematar siempre con `npm install` desde la raíz; (2) si la RAM muere con el dev server arriba, sospechar del árbol de node_modules *antes* que de los contenedores o del código — es fácil culpar al recién llegado (Langfuse) cuando el veneno estaba en el tooling.
- **El segundo OOM (misma familia, otra causa) — Turbopack tomó el HOME como raíz**: semanas después, al relevantar el stack para analizar trazas, la máquina volvió a morir en swap con un `node` disparado a ~50 GB. El instinto otra vez fue culpar a Langfuse (lo recién levantado) — y otra vez el veneno estaba en el tooling, no en el código. La causa esta vez: un **lockfile huérfano en el HOME** (`~/package.json` = `{}` y `~/package-lock.json` vacío, creados por accidente tiempo atrás). Con dos lockfiles a la vista, **Next 16 / Turbopack infirió `/Users/johny` (el home entero) como raíz del workspace** y se puso a escanear/vigilar todo el árbol (`Dev`, `Downloads`, `Library`…). La señal delatora estaba en el log del `next dev`, fácil de pasar por alto: `⚠ Next.js inferred your workspace root... We detected multiple lockfiles and selected the directory of /Users/johny/package-lock.json as the root directory`. **El fix (dos capas): (1)** fijar la raíz en el repo — `turbopack: { root: path.join(__dirname, "..", "..") }` en `apps/web/next.config.ts` (commiteable, protege a cualquiera que clone); **(2)** borrar los `~/package*.json` huérfanos. Con `turbopack.root` explícito basta para cerrar el OOM aunque el lockfile huérfano siga ahí. Moraleja acumulada: los OOM de este monorepo casi nunca son del código ni de Langfuse — son de **resolución de paquetes/workspace** (symlinks podados por `--workspace` la primera vez; raíz mal inferida por un lockfile huérfano la segunda). Ante un `node` que se infla con el dev server arriba: **primero sospecha del árbol de `node_modules` y de qué carpeta cree Next/Turbopack que es la raíz** — y lee los warnings de arranque, que suelen decir exactamente qué se rompió.
- Threading del `config` a los nodos del grafo (`agentNode(state, config)` → `model.invoke(msgs, config)`): necesario para que las llamadas al LLM y tools aparezcan **anidadas** en la traza — sin eso ves el grafo pero no las generaciones.
