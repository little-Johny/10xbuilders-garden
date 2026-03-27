---
title: "Skills en Practica: TDD y Setup del Clon de Twitter"
week: 2
lesson: 3
tags: [skills, tdd, cursor, rules, progressive-disclosure]
date: 2026-03-18
status: done
---

# Skills en Practica: TDD y Setup del Clon de Twitter

> **Síntesis.** Dominar la creación, implementación e iteración de **skills** en un entorno real permite pasar de la teoría a la práctica mediante **TDD** (desarrollo guiado por tests) y reglas de proyecto. El **skill** actúa como contrato verificable entre humano y agente; las **reglas** fijan el «cerebro» compartido del repositorio para un clon de red social u otro proyecto largo.

## Introducción

Trabajar con agentes en un codebase serio exige **verificabilidad**: el modelo debe poder comprobar si cumplió el encargo sin depender de supervisión continua línea a línea. El **TDD** (ciclo rojo → verde → refactor) y los tests como especificación se convierten en el lenguaje común. En paralelo, las **reglas** en `.cursor/rules/` estabilizan stack, carpetas y comandos de verificación. Los **skills** encapsulan procedimientos con **progressive disclosure** para no inundar el contexto. La sesión práctica recorre setup inicial, creación de skill con `/create skill` en Cursor e iteración cuando aparecen nuevos requisitos.

## Objetivos de aprendizaje

1. Explicar por qué el TDD es especialmente valioso cuando el implementador es un **agente**.
2. Crear **reglas de proyecto** en `.cursor/rules/` que guíen comportamiento, stack y verificación.
3. Definir un skill usando el flujo de creación en Cursor y aplicar el ciclo **Red → Green → Refactor**.
4. Explicar **progressive disclosure** frente a cargar todo el manual en cada mensaje.
5. **Iterar** skills al añadir rutas de tests, scripts (`npm test`, `npm run lint`) o dependencias nuevas.
6. Usar **tests como guía de debugging**: reproducir el bug en un test antes de «arreglar a ciegas».
7. Configurar la **estructura inicial** del proyecto: carpetas, convenios y stack acordado.

## Marco conceptual

### TDD con agentes como contrato

El TDD es central con IA porque los **tests** fijan comportamiento esperado —entradas, salidas y errores— de forma que el agente puede **autoverificar**. Cuando algo falla, el test aislado acota la causa. El ciclo clásico es: **Red**, escribir un test que falla porque la funcionalidad aún no existe; **Green**, implementar lo mínimo para pasar; **Refactor**, mejorar el código manteniendo los tests verdes. En conjunto, el test funciona como **contrato**: el humano define qué debe cumplirse; el agente propone implementaciones; la suite demuestra si se cumplen.

### Reglas de proyecto

Las **reglas** son instrucciones persistentes sobre cómo debe comportarse el agente en ese repositorio. Suelen incluir **stack** (por ejemplo React, Vite, Tailwind, Supabase), **estructura de carpetas** (`app/`, `api/`, `tests/`), **principios** (TDD, lint, convenciones de nombres) y **comandos de verificación** que el agente puede ejecutar para validar su trabajo. Colocarlas antes de implementar reduce discusiones implícitas sobre «cómo se hace acá».

### Progressive disclosure frente a full disclosure

En **progressive disclosure** (típico de skills bien diseñados), el agente ve primero **nombre y descripción breve** del skill, evalúa relevancia y solo entonces carga el cuerpo completo (checklist, pasos, detalles). Eso reduce ruido y tokens. En **full disclosure** (habitual en algunos catálogos **MCP**), el modelo ve todas las herramientas disponibles de una vez y elige cuál invocar; es adecuado para integraciones externas, pero no es el mismo patrón que un skill con índice liviano.

### Iteración de skills

Un skill **no** es estático. Un primer ciclo puede definir solo **estructura** y dejar tests en rojo que marcan el trabajo pendiente. Un segundo ciclo añade **contexto operativo**: rutas de tests, scripts de verificación, dependencias. Un tercero puede **integrar** referencias a otros skills o tipos compartidos. Esa evolución es normal cuando el proyecto crece.

### Arquitectura típica de un skill

En la práctica, un skill puede organizarse como carpetas con `SKILL.md`, tests de ejemplo, código de referencia y scripts de verificación. La forma exacta depende del repo; lo importante es que **SKILL.md** describa objetivo y pasos de forma que el agente los descubra con progressive disclosure.

### Referencia de tiempos de la sesión

La grabación sigue aproximadamente este orden: introducción al TDD con IA (0:00–0:18); ciclo Red/Green y **autoverificación** frente a supervisión continua (0:18–1:04); configuración de **rules** en `.cursor/rules/` con stack y estructura (1:04–3:24); creación de skill con `/create skill` (3:24–4:14); demostración del ciclo TDD (4:14–5:07); setup de carpetas, tests iniciales y scripts (5:07–6:34); iteración del skill con más contexto y comandos (6:34–7:27); cierre y reto (7:27 en adelante).

## Síntesis

TDD con IA no es solo «escribir tests»: es un **contrato explícito** entre humano y máquina. El test define **qué** se espera; el agente **implementa** para cumplirlo; la suite permite que la **máquina** verifique su trabajo de forma repetible. Ese trío hace que el proyecto sea más mantenible, escalable y auditable que un flujo solo de prompts.

## Preguntas de repaso

1. ¿Por qué el TDD encaja especialmente bien cuando quien programa es un agente?
2. ¿Qué distingue una **rule** de un **skill** en Cursor en términos de cuándo se carga y qué contiene?
3. ¿Qué problema resuelve el **progressive disclosure** para el contexto del agente?
4. ¿Cómo iterarías un skill cuando descubrís nuevos requisitos o comandos de verificación?

## Notas Personales

- Instale Cursor porque en el curso usan ese IDE y queria probarlo ya que tenia acceso a el (Ubuntu).
- Lo primero es crear las REGLAS de juego antes de cualquier implementacion.
- Cree mi propia version del `working-method.mdc` con TDD como centro del flujo, no solo como verificacion posterior.
