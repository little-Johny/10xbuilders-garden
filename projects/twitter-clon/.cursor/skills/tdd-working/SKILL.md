---
name: tdd-working
description: Guides Test-Driven Development (TDD) using Red-Green-Refactor with Jest. Requires acceptance criteria first, then test cases, then one Red-Green-Refactor cycle per case; production code is never written without a failing test first. Use when the user wants TDD, test-driven development, Red-Green-Refactor, or when implementing features with Jest and npm test.
npm---

# TDD Working (Red-Green-Refactor)

Procedimiento estricto de Test-Driven Development con Jest. El agente debe seguirlo cuando se aplique este skill.

## Contexto del repositorio (twitter-clon)

- **Ruta del proyecto:** `projects/twitter-clon/` (raíz del repo: workspace 10xbuilders-garden).
- **Estructura:**
  - **Raíz:** `package.json` con scripts que delegan en `app` y `api`.
  - **`app/src/`:** Solo código de producción (React, estilos, etc.).
  - **`app/test/`:** Tests Jest (`*.test.jsx`, `setupTests.js`); no mezclar con `src/`.
  - **`api/`:** Backend Express; Supabase (`@supabase/supabase-js`) solo aquí, nunca en `app/`.
- **Frontend → API:** En desarrollo, Vite hace proxy de `/api/*` a `http://localhost:3001` (sin CORS manual para rutas bajo `/api`).
- **Tests:** Jest en `app/`; archivos en **`app/test/`**. `npm test` desde la raíz o desde `app/`.
- **Comandos desde la raíz (`projects/twitter-clon/`):**
  - `npm run install:all` — Raíz, `app` y `api`.
  - `npm install` + `npm run install:app` + `npm run install:api` — Completo si no usas `install:all`.
  - `npm run dev` — **Vite + API** a la vez (`concurrently`).
  - `npm test` — Jest en `app/`.
  - `npm run supabase:gen` — Escribe `api/src/types/supabase.ts` (variable de entorno `SUPABASE_PROJECT_ID`).

### Cómo ejecutar el primer paso (setup inicial)

Desde la raíz del proyecto (`projects/twitter-clon/`):

1. **Instalar dependencias:**  
   `npm run install:all`  
   (o solo frontend: `npm install` y luego `npm run install:app`)

2. **Levantar frontend y API:**  
   `npm run dev`  
   Vite (p. ej. `http://localhost:5173`) y Express en `:3001`. Las peticiones del front a `/api/...` van al backend vía proxy.

3. **Ejecutar tests:**  
   `npm test`  
   Los tests de Jest se ejecutan en `app/`; desde la raíz este comando los lanza igualmente.

## Regla de oro

**Nunca escribir código de producción sin un test que falle primero.** Si no hay test rojo, no se escribe implementación.

## Flujo en 4 fases

### 1. Criterios de aceptación

Antes de escribir tests o código:

- Pedir o acordar con el usuario los **criterios de aceptación** del comportamiento deseado.
- Documentarlos brevemente (lista o párrafos cortos).
- No pasar a la fase 2 hasta tener criterios claros.

### 2. Casos de prueba

A partir de los criterios de aceptación:

- Definir **casos de prueba** concretos (uno o más por criterio).
- Cada caso debe ser comprobable: dado X, cuando Y, entonces Z.
- Escribir solo la lista de casos; no implementar tests todavía si se está planificando, o implementar los tests en la fase 3.

### 3. Ciclo Red-Green-Refactor por caso

Para **cada** caso de prueba, ejecutar un solo ciclo:

1. **Red**: Escribir el test en Jest que exprese el caso. Ejecutar `npm test` y comprobar que el test **falla** (rojo). Si pasa sin implementación, el test no es válido para TDD.
2. **Green**: Escribir el **mínimo** código de producción para que ese test pase. Ejecutar `npm test` y comprobar que el test pasa (verde).
3. **Refactor**: Si hace falta, mejorar el código (producción y/o test) sin cambiar el comportamiento. Volver a ejecutar `npm test` y asegurarse de que todo sigue en verde.

No añadir código de producción "por si acaso"; solo lo necesario para el caso actual.

### 4. Repetir

Pasar al siguiente caso de prueba y repetir el ciclo Red-Green-Refactor. No implementar varios casos en un solo paso sin haber visto rojo → verde para cada uno.

## Comando de tests

Siempre usar Jest mediante:

```bash
npm test
```

Ejecutar después de escribir un test (para ver rojo) y después de escribir o refactorizar código (para ver verde).

## Checklist por caso

- [ ] Criterios de aceptación claros
- [ ] Caso de prueba definido (dado/cuando/entonces)
- [ ] Test escrito y **fallando** (Red)
- [ ] `npm test` ejecutado → rojo
- [ ] Código mínimo para pasar el test (Green)
- [ ] `npm test` ejecutado → verde
- [ ] Refactor si aplica, tests siguen en verde

## Resumen

| Fase        | Acción                                              |
|------------|------------------------------------------------------|
| Criterios  | Obtener y fijar criterios de aceptación              |
| Casos      | Definir casos de prueba comprobables                 |
| Red        | Test que falle → `npm test` → rojo                   |
| Green      | Código mínimo → `npm test` → verde                   |
| Refactor   | Mejorar sin cambiar comportamiento → verde          |

Nunca saltarse Red: sin test fallando primero, no hay paso Green.
