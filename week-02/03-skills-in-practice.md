---
title: "Skills en Practica: TDD y Setup del Clon de Twitter"
week: 2
lesson: 3
tags: [skills, tdd, cursor, rules, progressive-disclosure]
date: 2026-03-18
status: done
---

# Skills en Practica: TDD y Setup del Clon de Twitter

> Dominar la creacion, implementacion e iteracion de Skills en un entorno real, transitando de la teoria a la practica mediante TDD (Test-Driven Development). Configurar el "Cerebro" de un proyecto (estructura, reglas, verificacion) que sirva como base para construir un Clon de Twitter con IA.

## Objetivos de Aprendizaje

- Entender que es TDD y por que es critico al trabajar con agentes IA.
- Crear reglas de proyecto (`.cursor/rules/`) que guien el comportamiento del agente.
- Definir un skill usando `/create skill` en Cursor.
- Aplicar el ciclo Red -> Green -> Refactor en TDD.
- Comprender Progressive Disclosure: carga inteligente de contexto para el agente.
- Iterar skills: refinar un skill con nueva informacion.
- Debugging basado en tests: crear tests que reproduzcan bugs antes de arreglarlos.
- Setup inicial del proyecto: estructura de carpetas, stack, convenciones.

## Conceptos Clave

### 1. Test-Driven Development (TDD) con IA

TDD es fundamental cuando trabajas con agentes IA porque:

- **Verificabilidad:** El agente puede verificar si completo la tarea sin supervision humana continua.
- **Claridad:** Los tests definen exactamente que se espera (entrada, salida, comportamiento).
- **Debugging eficiente:** Cuando algo falla, el test aislado te dice exactamente donde.
- **Iteracion rapida:** Red -> Green -> Refactor mantiene el codigo limpio.

**El ciclo TDD:**

1. **RED (Rojo):** Escribes un test que falla porque la funcionalidad no existe.
2. **GREEN (Verde):** Implementas lo minimo para que el test pase.
3. **REFACTOR:** Mejoras el codigo manteniendo los tests verdes.

### 2. Reglas de Proyecto (`.cursor/rules/`)

Instrucciones persistentes que guian como el agente debe comportarse en tu proyecto.

**Componentes esenciales:**

- **Stack tecnologico:** Decisiones arquitectonicas (React, Vite, Tailwind, Supabase).
- **Estructura de carpetas:** `app/` (frontend), `api/` (backend), `tests/` (pruebas).
- **Principios de desarrollo:** Discovery de skills, verificacion, linting, convenciones.
- **Comandos de verificacion:** Scripts que el agente puede ejecutar para validar su trabajo.

### 3. Progressive Disclosure vs Full Disclosure

Existen dos estrategias de carga de contexto para el agente:

**Progressive Disclosure (Skills):** El agente no ve todo a la vez. Solo descubre lo que necesita:

1. Ve nombre + descripcion breve del skill primero.
2. Evalua si es relevante para la tarea actual.
3. Si lo es, carga el contenido completo (checklist, objetivo, pasos detallados).

Esto reduce ruido y acelera la toma de decisiones.

**Full Disclosure (MCPs):** El agente ve TODAS las herramientas disponibles de una vez. Cuando se conecta a un sistema externo via MCP, recibe el catalogo completo de operaciones y decide cual usar. No hay carga progresiva — todo esta visible desde el inicio.

### 4. Iteracion de Skills

Un skill no es estatico. Evoluciona en ciclos:

- **Iteracion 1 — Setup basico:** El skill define la estructura inicial. Estado RED (los tests definen que hacer).
- **Iteracion 2 — Agregar contexto:** Actualizar con rutas de tests, scripts de verificacion (`npm test`, `npm run lint`), dependencias.
- **Iteracion 3 — Integracion:** Agregar referencias a otros skills, tipos compartidos, endpoints dependientes.

## Deep Dive Tecnico

### Sistema de Skills: Arquitectura

Un skill en Cursor es mas que un archivo. Es un sistema completo:

```
skill_name/
├── SKILL.md              # Definicion + prompt
├── tests/
│   ├── test_basico.ts    # Tests unitarios (TDD Red)
│   └── test_integracion.ts
├── src/
│   └── implementacion.ts  # Codigo que pasa tests
└── verificacion.sh        # Script que valida todo
```

### Reglas de Proyecto: Estructura Recomendada

Archivo: `.cursor/rules/forma_de_trabajo.md`

```markdown
# Forma de Trabajo - Clon de Twitter

## Stack Tecnologico
- Frontend: React 18 + Vite + TypeScript
- Styling: Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth)
- Testing: Vitest + React Testing Library

## Estructura de Carpetas
app/
  ├── pages/          # Paginas principales
  ├── components/     # Componentes reutilizables
  ├── hooks/          # Custom hooks
  ├── utils/          # Utilities
  └── styles/         # Estilos globales

api/
  ├── routes/         # Endpoints
  ├── middleware/     # Autenticacion, validacion
  ├── db/             # Migrations, seeds
  └── types.ts        # Tipos compartidos

tests/
  ├── unit/           # Tests unitarios
  ├── integration/    # Tests de integracion
  └── e2e/            # Tests end-to-end

## Principios
1. TDD: Tests primero, implementacion despues
2. Verificacion: Todo codigo debe pasar tests
3. Discovery: Agente descubre skills progresivamente
4. Convenciones: Nombres en presente continuo para skills
```

### Progressive Disclosure en Accion

**Paso 1 — El agente ve el "indice":**
```
Skill disponible: creating_twitter_clone
Descripcion: Establece estructura inicial del clon de Twitter
```

**Paso 2 — El agente evalua relevancia:**
- Es pertinente para mi tarea actual?
- Necesito el contenido completo o solo la descripcion?

**Paso 3 — Carga completa si es necesario:**
Accede al SKILL.md con el checklist, objetivo y pasos detallados.

## Timestamps de Referencia

| Tiempo | Tema |
|---|---|
| 00:00 - 00:18 | Intro: por que TDD es critico con IA |
| 00:18 - 00:42 | Ciclo Red -> Green, verificabilidad |
| 00:42 - 01:04 | El agente se auto-verifica vs supervision continua |
| 01:04 - 03:24 | Setup de Rules: `.cursor/rules/` con stack y estructura |
| 03:24 - 04:14 | Crear Skill con `/create skill` en Cursor |
| 04:14 - 05:07 | Demo ciclo TDD: test falla -> implementacion -> test pasa |
| 05:07 - 06:34 | Setup proyecto: carpetas, tests iniciales, scripts |
| 06:34 - 07:27 | Iterar skill: agregar contexto y comandos de verificacion |
| 07:27 - FIN | Reto: aplicar lo aprendido con extension propia |

## Puntos de Control

- *Por que TDD es especialmente util cuando trabajas con agentes IA?*
- *Que diferencia hay entre una rule y un skill en Cursor?*
- *Que significa Progressive Disclosure y como beneficia al agente?*
- *Como iteras un skill cuando descubres nuevos requisitos?*

## Reflexion Final

TDD con IA no es solo escribir tests. Es crear un contrato entre humano y maquina:

- **El test es el contrato:** define exactamente que esperas.
- **El agente es el ejecutor:** implementa para cumplir el contrato.
- **La maquina se verifica a si misma:** no necesita supervision continua.

Esto es lo que hace que los proyectos con IA sean mantenibles, escalables y auditables.

## Notas Personales

- Instale Cursor porque en el curso usan ese IDE y queria probarlo ya que tenia acceso a el (Ubuntu).
- Lo primero es crear las REGLAS de juego antes de cualquier implementacion.
- Cree mi propia version del `working-method.mdc` con TDD como centro del flujo, no solo como verificacion posterior.
