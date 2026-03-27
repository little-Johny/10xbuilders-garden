# Prompt: Crear apuntes de lección

## Instrucciones

A partir del temario/contenido de clase que te comparto, generá un archivo de apuntes siguiendo el template en `docs/lesson-note-template.md`.

### Reglas

1. **No copies el contenido literal.** Destilá los conceptos: reformulá con tus palabras, sintetizá, y capturá la esencia de cada idea.
2. **Completá el frontmatter** con los datos correctos (title, week, lesson, tags, date de hoy, status: draft).
3. **Síntesis (blockquote inicial):** una o dos frases que planteen la **tesis** de la lección, no un índice de temas.
4. **Introducción:** un párrafo que sitúe el tema para un lector que no asistió a la clase.
5. **Objetivos de aprendizaje:** 2–4 resultados; redactalos en prosa breve o lista **numerada**. Evitá viñetas con `-` como formato principal.
6. **Marco conceptual:** el núcleo del apunte. Usá subsecciones `###` con **texto corrido** (párrafos). El objetivo es que alguien entienda los conceptos **solo leyendo este documento**. Unificá definiciones, relaciones causa-efecto y ejemplos en prosa; usá listas solo cuando ordenen pasos o criterios paralelos.
7. **Síntesis final:** un párrafo de cierre que integre lo anterior.
8. **Preguntas de repaso:** 2–3 (o unas pocas más) preguntas **numeradas** para autoevaluación.
9. **Notas personales:** dejá esta sección vacía con el placeholder del template. Es para que el usuario la complete.

### Estilo

- Priorizar **explicación continua** frente a listas de guiones.
- Cada `###` debe corresponder a una idea mayor con desarrollo propio, no a una etiqueta de una sola línea.
- Términos técnicos: definirlos o parafrasearlos la primera vez que aparecen.

### Convención de nombres

El archivo debe guardarse como: `week-XX/NN-descriptive-slug.md`

Donde:

- `XX` = número de semana (01, 02, …)
- `NN` = número de lección en la semana (01, 02, …)
- `descriptive-slug` = slug corto en **inglés**, kebab-case, que describa el tema (p. ej. `subagents-fresh-context-delegation`, `mcp-supabase-local-skills`). El contenido del apunte puede seguir en español; solo el **nombre del archivo** va en inglés para consistencia en el repo y mejor orden alfabético/búsqueda.

### Ejemplo de uso

```
Seguí las instrucciones de @docs/LESSON-PROMPT.md

Semana 2, Lección 3.
El temario de la clase es:

[pegar temario acá]
```
