---
title: "Herramientas de manipulación de archivos para agentes IA"
week: 5
lesson: 4
tags: [file-tools, read-file, write-file, edit-file, nodejs, fs, sandbox, hitl, telegram, seguridad, validacion, encapsulacion, env-vars]
date: 2026-05-05
status: draft
---

# Herramientas de manipulación de archivos para agentes IA

> **Síntesis.** Darle a un agente acceso a Bash para que lea, escriba o edite archivos es entregarle una sierra eléctrica para hacer cirugía: funciona, pero el margen de error es enorme. Encapsular esas operaciones en tres herramientas dedicadas —`read_file`, `write_file`, `edit_file`— construidas sobre el módulo `fs` de Node.js permite validar parámetros, devolver errores estructurados, confinar el alcance con un sandbox y exigir aprobación humana solo cuando corresponde. El resultado es un agente que toca el sistema de archivos con la misma precisión con la que ejecuta una llamada HTTP, no con la imprevisibilidad de un comando shell.

## Introducción

La lección anterior cerró con una tool deliberadamente peligrosa: un ejecutor de Bash detrás de un *flag* y de Human in the Loop. Resolvió el problema de "el agente necesita actuar en la terminal", pero abrió otro: si todo lo que hace falta es leer un README, crear un archivo de notas o cambiar una línea en un código, **¿realmente queremos que el modelo decida construir un `cat`, un `echo > heredoc` o un `sed -i`?**. Cada una de esas formulaciones es una decisión libre del LLM, y cada decisión libre es una superficie de error: redirecciones mal escritas, comillas escapadas de manera incorrecta, regex que matchean más de lo esperado. La respuesta de esta lección es construir tres herramientas específicas que reemplacen a Bash en el caso común de manipulación de archivos, y reservar Bash únicamente para lo que ninguna tool dedicada cubre.

## Objetivos de aprendizaje

1. Argumentar por qué construir tools dedicadas para leer, escribir y editar archivos es preferible a delegar esas operaciones en un ejecutor de Bash.
2. Diseñar las descripciones de las tools de modo que el modelo las prefiera por encima de Bash cuando aplique, evitando ambigüedad y solapamiento.
3. Implementar las funciones `read_file`, `write_file` y `edit_file` sobre el módulo `fs` de Node.js con validaciones explícitas, escritura atómica y errores estructurados que el LLM pueda interpretar.
4. Resolver el conflicto típico de rutas entre el entorno donde corre Bash y el entorno donde corren las tools de Node, usando un sandbox opcional configurable por variable de entorno.
5. Depurar el flujo end-to-end probando las tools desde Telegram, identificando los errores semánticos de `edit_file` —match no único, hints de CRLF/BOM— y entendiendo por qué su confirmación humana sigue siendo necesaria.

## Marco conceptual

### Bash como herramienta universal y por qué eso es un problema

Un ejecutor de Bash es la **herramienta universal**: cualquier acción imaginable sobre un sistema Unix puede expresarse como un comando. Esa universalidad, que es virtud para un humano experto, es defecto para un agente de IA. Cuando el modelo decide modificar un archivo a través de Bash debe construir, en una sola cadena de texto, una sintaxis con redirecciones, escapes, heredocs y banderas de comandos como `sed` o `awk`. Cualquier desvío en esa cadena —una comilla mal cerrada, un `>` cuando hacía falta `>>`, un patrón que matchea demasiadas líneas— produce un efecto distinto al esperado, y como Bash no valida la intención sino solo la sintaxis del comando, el daño se materializa antes de que se descubra el error. La pregunta práctica que aparece es por qué obligar al modelo a navegar esa superficie cuando lo que necesita hacer es algo tan acotado como "abrir un archivo, leer su contenido, devolverlo".

### Control granular como mitigación

La alternativa es darle al agente un conjunto de **llaves específicas** en lugar de la llave maestra del edificio. Cada llave abre exactamente un cajón: `read_file` solo puede leer, `write_file` solo puede crear archivos nuevos, `edit_file` solo puede sustituir una ocurrencia exacta. Lo que para un humano es una restricción incómoda —"ya tengo Bash, ¿para qué tres herramientas más limitadas?"— para un LLM es una guía: ante la duda, la firma de cada tool y la rigidez de sus parámetros le dicen exactamente qué puede pedir y qué no. El espacio de errores se reduce porque cada operación tiene **un único contrato** que validar.

### Triage por riesgo aplicado al sistema de archivos

La taxonomía de Human in the Loop que vimos en la lección anterior se aplica con matices al manejo de archivos. **Leer** un archivo es bajo riesgo: no hay efecto sobre el sistema y, mientras esté confinado al sandbox, el alcance está acotado. **Crear** un archivo nuevo es bajo riesgo siempre que la herramienta no pueda sobrescribir uno existente: si el path ya está ocupado, la operación falla en lugar de pisar contenido. **Editar** un archivo existente es de riesgo alto, no por el efecto técnico —reemplazar una cadena por otra es trivial— sino porque una sustitución mal elegida puede romper la sintaxis de un código fuente, borrar un dato sensible o introducir un bug invisible. La consecuencia operativa es que `read_file` y `write_file` se ejecutan sin fricción mientras que `edit_file` siempre dispara la pausa de HITL y muestra al usuario el cambio exacto antes de aplicarlo.

### Descripciones que ganan la disputa contra Bash

Que las tres tools existan en el catálogo no garantiza que el modelo las elija; con descripciones vagas el LLM seguirá prefiriendo `bash` porque "ya sabe usarlo". El truco está en diseñar las descripciones para que dejen poco margen de interpretación. Cada una explica **qué hace, cuándo usarla, cómo construir los paths, qué proceso interno sigue, qué devuelve cuando todo va bien y qué códigos de error devuelve cuando no**. Y en paralelo, la descripción de `bash` recibe un addendum de **PREFERENCIA**: un párrafo que enumera los casos en los que el modelo debe usar la tool dedicada en su lugar —leer texto, crear un archivo conocido, find/replace exacto— y los casos en los que Bash sigue siendo el camino correcto —localizar un archivo cuando no se sabe la ruta, mover, borrar, ejecutar binarios—. La consecuencia es que la disputa por defecto se resuelve a favor del bisturí, y el martillo queda reservado para cuando hace falta romper algo a propósito.

### Anatomía de las tres tools

`read_file` toma una `path` y, opcionalmente, `offset` y `limit` para paginar archivos grandes sin saturar el contexto del modelo. Devuelve cada línea con un prefijo `   N|`, idéntico a lo que produce un `cat -n`, junto con el total de líneas y un *flag* que avisa si la respuesta fue truncada. `write_file` toma `path` y `content` y crea exclusivamente archivos nuevos: si el destino ya existe, la operación falla con un código `FILE_ALREADY_EXISTS` y obliga al modelo a tomar una decisión consciente —usar `edit_file` o pedirle al usuario que confirme la sobreescritura—. `edit_file` toma `path`, `old_string` y `new_string`, exige que `old_string` aparezca **exactamente una vez** en el archivo y reemplaza esa única ocurrencia; si aparece cero veces o más de una, devuelve un error que invita al modelo a ajustar la cadena con más contexto antes de reintentar.

### Node.js como capa de validación

El módulo `fs` de Node, en su variante `fs/promises`, expone primitivas que se prestan al patrón **validar primero, actuar después**. Antes de leer se hace `stat` para confirmar que el path es un archivo y no un directorio, y para rechazar lecturas que excedan un cap defensivo como `FILE_TOOL_MAX_BYTES`. Antes de escribir se chequea con `access` que el path no exista, y la escritura misma se hace en dos tiempos: primero a un archivo temporal en el mismo directorio, luego un `rename` atómico al destino final. Esa atomicidad evita estados intermedios visibles a otros lectores y reduce la ventana de **TOCTOU** —*time of check, time of use*— a un instante. Antes de editar se cuentan las ocurrencias literales del `old_string` para distinguir match único, ausente o múltiple. Toda esta lógica vive del lado de Node, no del lado del modelo: el LLM solo ve el resultado final, estructurado y predecible.

### Sandbox opcional y la trampa de los paths relativos

Una variable de entorno como `FILE_TOOLS_WORKSPACE_ROOT` permite confinar todas las operaciones a un directorio raíz. Cuando esta variable está definida, los paths absolutos se aceptan solo si caen dentro del root, y los paths relativos se resuelven contra ese root —de modo que el modelo puede pedir `docs/architecture.md` sin saber el árbol de directorios completo—. Cuando la variable no está definida, los relativos se rechazan con un error explícito (`REQUIRES_ABSOLUTE_PATH`), porque resolverlos contra el directorio actual del proceso introduce una ambigüedad peligrosa: el agente podría leer un archivo "del proyecto" pero apuntando al CWD del servicio web. Forzar la decisión —absoluto u relativo, pero contra un root explícito— le dice al modelo: si no sabes la ruta, pídela o búscala con `bash`, no la inventes. Y como salvaguarda extra, `realpath` se aplica al path resuelto para neutralizar symlinks que apunten fuera del sandbox.

### Riesgo concreto de `edit_file` y el match único como blindaje

La trampa más sutil de una tool de edición es que un `old_string` demasiado genérico encuentra el lugar equivocado. Si el modelo pide reemplazar `}` por `} else {` en un archivo que tiene cincuenta llaves de cierre, el reemplazo cae en una llave aleatoria y rompe el código. La política de **match único** es la mitigación: cuando `old_string` aparece más de una vez, la tool devuelve un error con el `count` y obliga al modelo a ampliar la cadena con líneas de contexto hasta que el match sea único. A esto se suman pistas automáticas para errores de codificación —si el archivo usa CRLF y el modelo construyó `old_string` con LF, la respuesta incluye una `hint` que se lo dice— y un mini-diff renderizado en la tarjeta de confirmación, para que el humano apruebe viendo el cambio exacto y no solo "se va a editar X".

## Guía práctica: implementar las file tools en el agente

### Preparación

Antes de escribir nada, conviene confirmar tres cosas. La primera, que la tool de Bash de la lección anterior funcione: enviarle al agente un `ls` desde Telegram y verificar que la pausa de HITL aparece y la salida vuelve correctamente confirma que el flujo HITL ya está en pie. La segunda, que el IDE asistido por IA tenga acceso al MCP de la documentación de LangChain y al código del proyecto, para acelerar el andamiaje sin perder coherencia con el catálogo y los adapters existentes. La tercera, decidir el directorio que hará de sandbox; suele convenir uno amplio pero acotado, por ejemplo la raíz del repositorio donde se trabaja habitualmente.

### Paso 1: Planificación con un prompt estructurado

El primer artefacto no es código, es un plan. Se le pide al chat del IDE que diseñe las tres tools especificando: descripciones que **disputen** explícitamente con Bash (no que coexistan amablemente con él), errores como salida estructurada (`{ ok: false, code, message }`) en lugar de excepciones, sandbox opcional con dos modos —con y sin root—, y validaciones específicas para cada tool. El plan vive como un documento Markdown con TODOs, similar al de la lección de Bash. Ese plan es el que después guía la implementación: si el modelo se desvía en algún paso, se vuelve al plan y se ajusta.

### Paso 2: Implementación de las tres funciones en Node.js

Las tres funciones se escriben en un módulo dedicado —`packages/agent/src/tools/file-ops.ts` en este proyecto— que no sabe nada de LangChain ni LangGraph: solo expone funciones puras que toman parámetros y devuelven un resultado discriminado. Esa separación facilita testear el módulo sin levantar el grafo. La validación crítica de `edit_file` se reduce a una verificación de match único antes de tocar el archivo:

```ts
// Conteo de ocurrencias literales antes de reemplazar
const count = countOccurrences(raw, oldString);
if (count === 0) {
  const hint = encodingMismatchHint(raw, oldString);
  return { ok: false, code: "MATCH_NOT_FOUND", message: "...", details: hint ? { hint } : undefined };
}
if (count > 1) {
  return { ok: false, code: "MATCH_NOT_UNIQUE", message: "...", details: { count } };
}
```

Una vez probado el módulo en aislado con un *smoke script* que ejercite los caminos felices y los errores principales, se conectan las funciones al catálogo y a los adapters: cada tool aparece como una entrada con `risk` declarado (`low` para read y write, `high` para edit) y se monta como adapter de LangChain solo si los gates de entorno (`ALLOW_FILE_TOOLS`) y los toggles del usuario lo permiten.

### Paso 3: Probar desde Telegram y resolver el conflicto de rutas

La primera prueba se hace en caliente desde Telegram. Pedirle al agente que cree un archivo —`Crea week-05/notas.md con un título y dos bullets`— suele dar el primer fallo característico: el agente responde con `REQUIRES_ABSOLUTE_PATH` porque el sandbox no está configurado, o con `FILE_NOT_FOUND` cuando se le pide leer algo que el humano sabe que existe pero el agente no encuentra. La causa habitual es que la variable que define el directorio para Bash y la que define el sandbox de las file tools apuntan a sitios distintos, o una está y la otra falta. La solución consiste en alinear ambas: definir `FILE_TOOLS_WORKSPACE_ROOT` apuntando al directorio donde realmente se quiere operar, reiniciar el servidor de desarrollo —Next.js no recarga env vars en caliente— y reintentar el mismo prompt. Lo que antes era un error de ruta ahora resuelve la ruta relativa contra el sandbox y el flujo se completa.

### Paso 4 opcional: depurar `edit_file` y entender sus errores semánticos

Con las tools probadas en el camino feliz, queda explorar los caminos amargos de `edit_file`. Pedir un reemplazo donde `old_string` aparece varias veces produce `MATCH_NOT_UNIQUE` con `count: 3`; el modelo debería leerlo, ampliar la cadena y reintentar. Pedir un reemplazo en un archivo CRLF con un `old_string` LF produce `MATCH_NOT_FOUND` con un `details.hint` que sugiere reconstruir la cadena con `\r\n`. Y rechazar la tarjeta de confirmación de un edit verifica que el archivo en disco no sufre cambios. Cada uno de estos casos es una oportunidad para observar cómo la combinación de errores estructurados, hints de codificación y mini-diff en la tarjeta de aprobación convierten una tool intrínsecamente peligrosa en una pieza con la que se puede vivir.

## Síntesis

Las tres tools dedicadas no eliminan a Bash; lo desplazan al lugar que realmente le corresponde. Para todo lo que es leer, crear o editar archivos de manera puntual, `read_file`, `write_file` y `edit_file` ofrecen un contrato estable, validaciones del lado de Node, un sandbox opcional que confina el alcance, errores legibles que el modelo puede interpretar y corregir, y —en el caso más sensible— un mini-diff aprobado por el humano antes de tocar el archivo. Bash queda reservado para lo que solo Bash puede hacer: localizar archivos, mover, borrar, ejecutar binarios, montar pipelines. La consecuencia más interesante no es técnica sino de diseño: cuanto más específica es cada tool y mejor descrita está, menos depende el sistema de la imaginación del LLM y más se parece a un programa convencional con un agente como interfaz.

## Preguntas de repaso

1. Enumerá tres situaciones concretas en las que delegar la operación de archivos a Bash en lugar de a una tool dedicada produce un riesgo evitable. Para cada una, indicá qué tool específica la cubriría y por qué.
2. ¿Por qué `write_file` puede mantenerse como riesgo bajo aunque cree archivos en disco, y por qué `edit_file` debe ser riesgo alto aunque solo modifique cadenas dentro de un archivo? ¿Qué pasaría si invirtiéramos esa clasificación?
3. Describí el rol del bloque "PREFERENCIA" en la descripción de Bash y explicá por qué ese párrafo, aunque sea solo texto, cambia el comportamiento del modelo.
4. ¿Qué problema resuelve la política de match único en `edit_file` y qué consecuencia tiene en los prompts del modelo? Pensá en cómo cambia la forma en la que el agente arma `old_string` cuando sabe que debe ser único.
5. Tu agente reporta `REQUIRES_ABSOLUTE_PATH` al pedirle leer `docs/architecture.md`. ¿Qué cosas revisarías, en qué orden, para diagnosticar y resolver el conflicto entre el entorno de Bash y el de las file tools?

## Recursos

- [Node.js — `fs/promises` API](https://nodejs.org/api/fs.html#promises-api)
- [Node.js — escritura atómica con `rename`](https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath)
- [diff (npm) — generación de patches unificados estilo `git diff`](https://www.npmjs.com/package/diff)
- Implementación real en este monorepo: `projects/10x-builders-agent/packages/agent/src/tools/{catalog.ts, adapters.ts, file-ops.ts}` y `projects/10x-builders-agent/docs/file_tools_plan.md`.
