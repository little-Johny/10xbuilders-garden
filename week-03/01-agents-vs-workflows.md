---
title: "Arquitectura de IA: Agentes Autónomos vs Flujos de Trabajo"
week: 3
lesson: 1
tags: [arquitectura, agentes, workflows, determinismo, sobrediseño, latencia, costos]
date: 2026-04-05
status: done
---

# Arquitectura de IA: Agentes Autónomos vs Flujos de Trabajo

> **Síntesis.** No todo problema necesita un agente autónomo. La decisión arquitectónica más valiosa en el desarrollo con IA es saber **dónde termina lo determinista y dónde empieza la ambigüedad**; solo en esa frontera se justifica delegar a un modelo de lenguaje.

## Introducción

La disponibilidad masiva de modelos de lenguaje ha creado un sesgo de innovación: ante cualquier problema, la tentación inmediata es resolverlo con un agente de IA. Sin embargo, los equipos que obtienen mejores resultados —según la propia experiencia documentada por Anthropic— no son los que construyen los sistemas más sofisticados, sino los que eligen la solución más simple que resuelve el problema y solo escalan la complejidad cuando hay evidencia de que es necesaria. Esta lección establece criterios concretos para distinguir cuándo un flujo de trabajo tradicional basta y cuándo un agente autónomo aporta valor real.

## Objetivos de aprendizaje

1. Identificar la «trampa del agente para todo» y sus consecuencias directas en costos, latencia y variabilidad de los resultados.
2. Distinguir las características de un flujo de trabajo estructurado frente a las de un agente autónomo, eligiendo el adecuado según el tipo de tarea.
3. Aplicar la **regla del límite del determinismo** como criterio de diseño para decidir dónde integrar inteligencia artificial en un proceso.
4. Detectar situaciones de sobrediseño (*overkill*) donde la IA introduce más riesgo del que resuelve.

## Marco conceptual

### La trampa del agente para todo

Existe un patrón recurrente en equipos que adoptan IA: asumir que cualquier problema se resuelve mejor con un sistema autónomo capaz de razonar y tomar decisiones. Esa suposición —la **trampa del agente para todo**— ignora que los agentes operan intercambiando latencia y costo por flexibilidad. Cuando la tarea es lineal y predecible, ese intercambio no tiene sentido: se pagan más tokens, se espera más tiempo y se introduce variabilidad en un resultado que debería ser estable. Convertir un JSON a CSV, clasificar datos contra categorías fijas o extraer campos con una expresión regular son ejemplos donde el razonamiento dinámico de un LLM no aporta nada que un script determinista no resuelva mejor, más rápido y sin riesgo de alucinación.

Anthropic lo resume con claridad en su guía de agentes efectivos: «Recomendamos encontrar la solución más simple posible y solo aumentar la complejidad cuando sea necesario». Los equipos más exitosos que han acompañado no usaban frameworks complejos ni bibliotecas especializadas; construían con patrones simples y componibles.

### Qué es un flujo de trabajo y qué es un agente

Un **flujo de trabajo** (*workflow*) es un sistema donde los modelos de lenguaje y las herramientas se orquestan a través de rutas de código predefinidas. El desarrollador decide de antemano la secuencia de pasos: qué se ejecuta primero, qué comprobación se hace después, qué rama se toma en cada caso. Es rápido, económico y altamente predecible porque el control permanece en el código, no en el modelo.

Un **agente autónomo**, en cambio, es un sistema donde el propio LLM dirige dinámicamente su proceso y el uso de herramientas. El agente razona, elige rutas, decide cuándo pedir más información y cuándo detenerse. Esa autonomía lo hace idóneo para problemas abiertos —donde no se puede anticipar cuántos pasos hará falta ni cuál será la ruta— pero también lo hace más costoso, más lento y más propenso a errores acumulativos.

La diferencia clave es quién tiene el control: en el workflow lo tiene el código; en el agente lo tiene el modelo.

### Patrones intermedios: no todo es blanco o negro

Entre el script puro y el agente totalmente autónomo hay un espectro de patrones documentados que conviene conocer para no saltar directamente a la opción más compleja.

El **encadenamiento de prompts** (*prompt chaining*) descompone una tarea en pasos secuenciales donde cada llamada al LLM procesa la salida de la anterior, con comprobaciones programáticas entre pasos. El **ruteo** (*routing*) clasifica la entrada y la dirige a un flujo especializado, de modo que cada rama puede tener su prompt optimizado sin que una perjudique a otra. La **paralelización** ejecuta subtareas independientes de forma simultánea —ya sea dividiendo el trabajo en secciones o votando con múltiples perspectivas— y agrega los resultados de forma programática. El patrón **orquestador-trabajadores** usa un LLM central que descompone dinámicamente la tarea y delega a LLMs especializados, útil cuando no se pueden predecir las subtareas pero sí se puede acotar el rango de acción. Finalmente, el **evaluador-optimizador** genera una respuesta y la somete a un ciclo de retroalimentación hasta cumplir un criterio de calidad.

Cada uno de estos patrones es un workflow —el control sigue en el código— pero incorpora LLMs en puntos específicos. Solo cuando ninguno alcanza y la tarea exige que el modelo descubra la ruta por sí mismo, se justifica un agente completo.

### La regla del límite del determinismo

El criterio más directo para decidir si un proceso necesita IA es evaluar dónde se rompe el **determinismo**. Un proceso determinista parte de un estado inicial, recibe entradas conocidas y produce siempre el mismo resultado a través de pasos fijos y lógicos. Si se puede diagramar de principio a fin con condicionales exactos (`if/else`), se resuelve con código tradicional.

La IA entra cuando aparece la **ambigüedad**: entradas no estructuradas, contextos variables, decisiones que dependen de matices semánticos o situaciones donde el sistema necesita explorar alternativas y adaptarse sobre la marcha. En ese punto —y solo en ese punto— el modelo de lenguaje aporta algo que el código determinista no puede ofrecer.

Una lista de verificación práctica antes de implementar un agente: (1) ¿La tarea tiene pasos fijos y predecibles? Usa un workflow. (2) ¿El formato de salida es estricto —extraer datos puntuales, transformar formatos—? Usa código tradicional. (3) ¿El sistema necesita reaccionar a errores imprevistos y buscar soluciones alternativas de forma autónoma? Ahí sí, un agente. (4) ¿La latencia es crítica y el presupuesto de tokens es limitado? Favorece el workflow.

### Sobrediseño: cuando la IA es el problema, no la solución

En ingeniería, **overkill** significa usar una herramienta desproporcionadamente compleja para un problema simple. Delegar tareas lineales a un agente de IA no solo desperdicia recursos: añade puntos de falla que antes no existían. Una alucinación del modelo puede corromper un proceso que, como script determinista, habría funcionado sin error durante años. Es lo que la lección llama «fricción disfrazada de innovación»: parece moderno, pero el sistema es más frágil.

El valor real de la IA no está en su presencia dentro de un proyecto, sino en su **ubicación estratégica**. Un buen diseño arquitectónico aísla la complejidad, mantiene determinista todo lo que puede serlo y reserva el LLM como un recurso de élite para los puntos donde el razonamiento humano —o su aproximación artificial— es indispensable. Esto conecta con los tres principios que Anthropic propone para implementar agentes: mantener la simplicidad en el diseño, priorizar la transparencia mostrando los pasos del agente y construir interfaces agente-herramienta con el mismo cuidado que una interfaz humano-computadora.

## Síntesis

La decisión más importante en arquitectura de IA no es cómo construir un agente, sino **cuándo no construirlo**. El límite del determinismo marca esa frontera: todo lo que se pueda resolver con pasos fijos y lógica condicional debe quedarse en código tradicional o en workflows con puntos específicos de LLM. Solo donde la ambigüedad hace imposible predeterminar la ruta se justifica un agente autónomo. Aplicar este criterio reduce costos, latencia y puntos de fallo, y concentra el poder del modelo donde realmente hace diferencia.

## Preguntas de repaso

1. ¿Qué consecuencias concretas tiene caer en la «trampa del agente para todo» en un sistema en producción?
2. Dado un proceso que convierte archivos de un formato a otro y luego los clasifica según reglas fijas, ¿dónde ubicarías la frontera del determinismo? ¿Algún paso justificaría un agente?
3. Describí un escenario real donde un workflow con LLM en puntos específicos sea mejor solución que un agente autónomo, y otro donde solo un agente resuelva el problema.
4. ¿Por qué la documentación de Anthropic insiste en «empezar con la solución más simple posible»? ¿Qué riesgos concretos mitiga ese enfoque?

## Notas personales

### El ejercicio del diagrama de flujo

La herramienta más práctica de la sesión es simple: antes de meter IA, intentá diagramar el proceso completo. Si puedes cerrarlo con condicionales exactos, no necesitás un modelo (ver [La regla del límite del determinismo](#la-regla-del-límite-del-determinismo)). Si en algún punto el diagrama se rompe porque la decisión depende de contexto ambiguo, ahí aparece el valor real de la IA.

**Ejemplo 1 — Sin IA: pipeline de procesamiento de facturas en formato fijo.**

```
[Recibir PDF] → [Extraer texto con parser] → [¿Tiene campos obligatorios?]
        ├─ Sí → [Mapear campos a JSON] → [Validar montos contra esquema] → [Insertar en DB]
        └─ No → [Mover a carpeta de errores] → [Notificar por email]
```

Cada paso es determinista: el formato del PDF es conocido, los campos son fijos, la validación es aritmética. Se diagrama completo sin ambigüedad. Un script lo resuelve con cero tokens y cero latencia de modelo.

**Ejemplo 2 — Con IA: triaje de tickets de soporte con lenguaje libre.**

```
[Recibir ticket] → [¿Categoría?] → ???
```

Acá el diagrama se rompe inmediatamente. El usuario escribe en lenguaje natural, mezcla problemas, usa jerga propia, a veces describe síntomas en lugar del problema real. No hay un `if/else` que cubra todas las variantes. Un LLM aporta valor clasificando la intención, extrayendo el problema subyacente y ruteando al equipo correcto — incluso con un workflow simple de tipo *routing* (no hace falta un agente autónomo, sino un punto específico de LLM dentro de un flujo controlado).