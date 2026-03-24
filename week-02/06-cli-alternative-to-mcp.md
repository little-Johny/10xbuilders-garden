---
title: "CLI como Alternativa a MCP"
week: 2
lesson: 6
tags: [cli, mcp, tokens, eficiencia, unix, skills, composicion]
date: 2026-03-23
status: draft
---

# CLI como Alternativa a MCP

> Los CLIs llevan 50 anos resolviendo problemas de forma simple, composable y barata. MCP agrega estructura y seguridad, pero a un costo medible en tokens, latencia y confiabilidad. Saber cuando usar cada uno es clave para un flujo de desarrollo eficiente.

## Objetivos de Aprendizaje

- Evaluar con datos concretos (tokens, costo, tasa de exito) cuando conviene CLI vs MCP para una tarea dada.
- Aplicar composicion Unix para resolver problemas complejos encadenando comandos simples, algo que MCP no puede replicar sin multiples llamadas.
- Disenar skills que orquesten CLIs como backend eficiente, usando Progressive Disclosure para simplificar la experiencia del usuario.
- Identificar los escenarios donde MCP sigue siendo la opcion correcta (seguridad, auditoria, datos sensibles).

## Conceptos Clave

- **Overhead de tokens en MCP:** El estudio de Scalekit muestra que MCP consume entre 4x y 34x mas tokens que CLI para la misma tarea. La razon: esquemas JSON exhaustivos con descripciones, ejemplos y metadata en cada llamada. Un `curl | jq` resuelve en ~1,300 tokens lo que MCP necesita ~44,800 para obtener el lenguaje de un repo en GitHub.

- **Confiabilidad operacional:** CLI tiene 100% de exito en local porque no depende de red, servidores remotos ni validacion de esquemas. MCP reporta un 28% de fallo segun el estudio, por timeouts, parametros incorrectos o cambios en esquemas remotos.

- **Composicion Unix:** El principio de "programas pequenos que hacen una cosa bien y se encadenan via pipes" sigue siendo poderoso. `find . -mtime 0 | head -5 | awk '{print $9}'` es un pipeline de 1 linea. El equivalente MCP requeriria 3 herramientas separadas con 3 llamadas independientes.

- **Progressive Disclosure con CLI + Skill:** El patron ganador combina lo mejor de ambos mundos. El usuario da un comando simple, el skill ejecuta CLIs baratos por detras, aplica logica condicional segun el output, y devuelve solo lo relevante. ~250 tokens en lugar de ~2,000 con MCP.

- **Cuando MCP es la opcion correcta:** Seguridad corporativa (permisos granulares, auditoria de quien ejecuto que), APIs con datos sensibles (financieros, medicos) donde las credenciales deben quedarse en el servidor, y control de acceso donde Claude no debe ver el secret sino solo el resultado.

- **Costo financiero real:** Una operacion tipica cuesta ~$3 via CLI vs ~$55 via MCP, directamente proporcional al consumo de tokens. En desarrollo diario con ciclos rapidos de iteracion, esto escala significativamente.

- **CLI como interfaz natural para LLMs:** Los modelos conocen terminales a fondo porque su training data esta lleno de ejemplos. stdout es texto plano, parseable, predecible. No necesitan interpretar esquemas complejos para entender la salida de `git log --oneline`.

## Aplicacion al Proyecto: Clon de X

La leccion anterior (2.5) mostro como conectar Supabase via MCP. Esta leccion complementa con la perspectiva practica: en desarrollo diario, los CLIs son la herramienta principal.

| Tarea | Herramienta | Por que |
|---|---|---|
| Crear migracion local | `npx supabase migration new` (CLI) | Rapido, sin overhead, 100% confiable |
| Inspeccionar schema local | `psql -h localhost -p 54322 -U postgres` | Interactivo, composable con `\dt`, `\d tabla`, pipes a grep |
| Queries ad-hoc en dev | `psql` + SQL directo | Feedback instantaneo, sin latencia de red |
| Gestionar PRs del proyecto | `gh pr create`, `gh issue list` | ~1,600 tokens vs ~32,000 con MCP para detalles de PR |
| Aplicar migracion en produccion | MCP + auditoria | Necesita registro, control de acceso, proteccion de datos reales |
| Inspeccionar datos en produccion | MCP + rate-limit | Datos reales que requieren permisos y proteccion |

**CLIs relevantes para el stack del proyecto:**
- **`psql`** — cliente nativo de PostgreSQL. Conexion directa al contenedor local (`localhost:54322`). Soporta queries interactivas, metacomandos (`\dt`, `\di`, `\d+`), y salida composable via pipes.
- **`gh`** — GitHub CLI. Gestiona repos, PRs, issues, actions y releases desde terminal. Ejemplo: `gh pr list --state open` consume una fraccion de los tokens que el MCP de GitHub.
- **`npx supabase`** — ya integrado en el proyecto para migraciones y gestion de la instancia local.

## Puntos de Control

- Si necesitas verificar rapidamente el schema de una tabla en desarrollo local, que usarias: MCP o `psql`? Por que?
- Que hace que la composicion Unix sea imposible de replicar eficientemente con MCP?
- En que escenario concreto del proyecto elegirias MCP sobre CLI, y que ganarias a cambio del costo extra en tokens?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
