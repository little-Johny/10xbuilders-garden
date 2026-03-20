# Prompt: Crear apuntes de lección

## Instrucciones

A partir del temario/contenido de clase que te comparto, generá un archivo de apuntes siguiendo el template en `docs/lesson-note-template.md`.

### Reglas

1. **No copies el contenido literal.** Destilá los conceptos: reformulá con tus palabras, sintetizá, y capturá la esencia de cada idea.
2. **Completá el frontmatter** con los datos correctos (title, week, lesson, tags, date de hoy, status: draft).
3. **Resumen:** una o dos frases que capturen la idea central de la clase, no un índice de temas.
4. **Objetivos de Aprendizaje:** extraé los 2-4 objetivos principales. Redactalos como algo que el estudiante debería poder hacer/entender después de la clase.
5. **Conceptos Clave:** identificá los conceptos más importantes. Explicá cada uno de forma breve y clara, como si se lo explicaras a un dev que no vio la clase.
6. **Puntos de Control:** generá 2-3 preguntas de reflexión que ayuden a verificar si se entendieron los conceptos.
7. **Notas Personales:** dejá esta sección vacía con el placeholder del template. Es para que el usuario la complete.

### Convención de nombres

El archivo debe guardarse como: `week-XX/NN-nombre-descriptivo.md`

Donde:
- `XX` = número de semana (01, 02, ...)
- `NN` = número de lección en la semana (01, 02, ...)
- `nombre-descriptivo` = slug corto en kebab-case que describa el tema

### Ejemplo de uso

```
Seguí las instrucciones de @docs/LESSON-PROMPT.md

Semana 2, Lección 3.
El temario de la clase es:

[pegar temario acá]
```
