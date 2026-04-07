---
title: "CLI como Alternativa a MCP"
week: 2
lesson: 6
tags: [cli, mcp, tokens, eficiencia, unix, skills, composicion]
date: 2026-03-23
status: done
---

# CLI como Alternativa a MCP

> **Síntesis.** Las **CLI** llevan décadas resolviendo tareas de forma **simple, componible y barata** en tokens. **MCP** aporta estructura, descubrimiento de herramientas y gobernanza, pero tiene **coste** medible en contexto y latencia. Elegir entre una y otra —o combinarlas con un skill que oculte la complejidad— es decisión de **ingeniería**, no de moda.

## Introducción

Los estudios comparativos (por ejemplo mediciones de consumo de tokens en flujos equivalentes) muestran que invocar herramientas MCP puede costar **varios órdenes de magnitud** más contexto que una cadena de comandos clásica para el mismo resultado observable. Eso no vuelve obsoleto a MCP: en entornos con **auditoría**, **secretos** o **políticas de acceso**, el servidor intermediario sigue siendo la opción correcta. La lección contrasta **CLI + composición Unix** con **MCP**, introduce **progressive disclosure** vía skills y enlaza con el **clon de X** y Supabase local donde aplica.

## Objetivos de aprendizaje

1. **Comparar** con criterios concretos (tokens, coste monetario aproximado, tasa de éxito, latencia) cuándo favorece la CLI frente a MCP para una tarea dada.
2. Aplicar **composición Unix** —pipes y programas pequeños— para resolver tareas que con MCP exigirían muchas invocaciones sueltas.
3. Diseñar **skills** que usen CLI como backend eficiente y devuelvan al usuario o al agente solo lo **relevante**.
4. Identificar escenarios donde **MCP** sigue siendo preferible: seguridad, datos sensibles, auditoría de ejecución.

## Marco conceptual

### Overhead de contexto en MCP

Cada herramienta MCP expone **esquemas** y descripciones al modelo. En conjunto, decenas de herramientas pueden consumir miles de tokens solo en metadatos. Una cadena equivalente con `curl`, `jq` o utilidades locales puede producir la misma **información útil** con mucho menos texto de protocolo alrededor. Por eso los informes de la industria suelen mostrar ratios altos de tokens MCP versus CLI para tareas comparables.

### Confiabilidad operativa local

Una CLI en la máquina del desarrollador **no** depende de un servidor remoto ni de la disponibilidad de un host MCP; los fallos típicos son distintos (permisos, binario ausente). Los flujos MCP añaden puntos de fallo (red, esquema cambiado, timeout). La elección no es «siempre CLI»: es **emparejar** riesgo y dependencias con el tipo de tarea.

### Composición Unix

El principio de programas pequeños conectados por **pipes** sigue siendo difícil de igualar con una lista plana de herramientas remotas: una tubería puede filtrar, contar y proyectar en un solo proceso humano o en un script. Replicar eso con MCP suele implicar **varias** llamadas independientes y más contexto acumulado.

### Progressive disclosure con CLI dentro de un skill

Un patrón productivo es que el usuario o el agente dispare un **comando de alto nivel** mientras el skill ejecuta por detrás una o más CLI, ramifica según la salida y devuelve un **resumen** corto. Así se combina bajo coste de tokens con una interfaz simple para el modelo.

### Cuándo MCP sigue siendo la opción correcta

Cuando hace falta **gobernanza** —quién ejecutó qué, con qué credencial—, cuando los **secretos** no deben llegar al contexto del modelo pero sí el **resultado** agregado, o cuando la política corporativa exige un único punto de acceso auditado, MCP (u otra capa de servicio) suele justificar su sobrecosto.

### Aplicación al proyecto (clon de X)

En **desarrollo local**, crear migraciones con la CLI de Supabase, inspeccionar el esquema con `psql` o listar PRs con `gh` suele ser más **rápido y barato** en tokens que encadenar solo MCP genéricos. Para **producción** —datos reales, permisos, trazabilidad— puede ser obligatorio un camino con más control y registro, donde MCP o procesos similares encajan mejor.

### Ejemplos reales: ¿CLI o MCP?

**Escenario A — conviene la CLI.** Estás en tu máquina con Supabase local ya levantado (`npx supabase start`) y necesitás confirmar cómo se llama una columna o si un índice existe antes de escribir una migración en el `twitter-clon`. Correr `psql` contra `localhost` o `npx supabase db diff` y, si hace falta, enchufar la salida a `grep` o a un archivo es **directo**: no exponés credenciales de ningún entorno remoto, no necesitás que quede registro central de «quién preguntó qué» y el coste en tokens para el agente es mínimo si ejecuta esos comandos por terminal en lugar de hidratar un catálogo MCP entero. El criterio es: **entorno local, sin política corporativa fuerte, resultado desechable**.

**Escenario B — conviene MCP.** El mismo agente debe ayudar a inspeccionar datos o metadatos en un contexto donde **no** podés darle al modelo acceso directo a la red interna ni pegar connection strings en el chat: un **servidor MCP** actúa de puerta de entrada, aplica permisos en el host, y solo devuelve al modelo el **resultado acotado** de una herramienta ya definida (por ejemplo lecturas vía un endpoint interno). Ahí el sobrecosto en tokens se paga a cambio de **separación de secretos**, **trazabilidad** (quién invocó qué herramienta) y **contrato estable** para el agente —similar a usar el MCP de Supabase local en el curso cuando querés que Cursor descubra herramientas con esquema conocido sin que el flujo dependa de copiar SQL a mano. El criterio es: **acceso gobernado, auditoría o datos sensibles fuera del alcance directo del modelo**.

## Síntesis

CLI y MCP responden a **distintas restricciones**: la primera maximiza control local, composición y economía de contexto; la segunda maximiza **estructura**, integración uniforme y políticas centralizadas. Los skills permiten presentar al agente una cara simple sin ocultar la elección técnica entre ambos mundos.

## Preguntas de repaso

1. Si necesitás verificar **rápidamente** el esquema de una tabla en desarrollo local, ¿inclinás por MCP o por `psql`, y por qué?
2. ¿Qué hace que la **composición Unix** sea difícil de replicar de forma tan eficiente solo con muchas llamadas MCP sueltas?
3. ¿En qué escenario concreto de tu proyecto elegirías MCP sobre CLI, y qué ganarías a cambio del coste extra en tokens o latencia?

## Notas Personales

El eje de la sesión es **cuándo conviene la CLI frente a MCP**: no es dogma anti-MCP, sino **emparejar herramienta y restricción** (tokens, latencia, gobernanza). En la clase se trajeron cifras orientativas de estudios comparativos: el coste en **tokens** de flujos equivalentes puede dispararse por metadatos de herramientas, descripciones verbosas o diseños poco ajustados del servidor MCP —se habló de **órdenes de magnitud** del orden de **4× a 32×** respecto a una cadena CLI comparable para el mismo resultado observable. También se contrastaron **tasas de éxito** aproximadas en esos experimentos (en torno a **72%** vía MCP versus **100%** con CLI en el escenario citado). Son números para **calibrar intuición**, no leyes universales: el marco conceptual del apunte ya explica por qué el overhead de esquemas y catálogos puede pesar tanto.

**Para el día a día de desarrollo local**, el takeaway práctico que me llevo es que la **CLI suele ser la herramienta más barata y directa** cuando no hace falta intermediario auditado ni ocultar secretos al modelo: por ejemplo en el `twitter-clon`, migraciones y `psql`/`supabase` desde terminal encajan con lo que ya dice la lección sobre el proyecto.

**Reto de la clase: usar un CLI real.** La consigna fue implementar o integrar flujo con una **CLI** concreta; instalé la **CLI oficial de GitHub** (`gh`) —cliente para repos, PRs, issues, `gh api`, etc.— que encaja bien con la idea de **composición** y comandos pequeños sin pasar por un servidor MCP. Instalación típica: [GitHub CLI](https://cli.github.com/) (`brew install gh` en macOS, paquetes en Linux, instalador en Windows); luego `gh auth login` para asociar credenciales. No sustituye al contenido del apunte sobre cuándo MCP sigue siendo obligatorio en entornos con políticas estrictas.