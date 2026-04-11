# Technical Brief — [Título de la tarea]

**Cómo usar este archivo — Ciclo BPIR**

Este documento es la **B** del ciclo **BPIR**: Brief → Plan → Implementación → Review.

| Fase | Qué haces |
|---|---|
| **B** — Brief | Completas este archivo. Le das contexto y restricciones a la IA. |
| **P** — Plan | La IA devuelve un plan paso a paso. Tú lo negocias antes de que empiece a codear. |
| **I** — Implementación | La IA implementa por bloques. Tú revisas cada uno antes de pedir el siguiente. |
| **R** — Review | Antes de integrar, pasas el código por el Protocolo de Review para código IA. |

**Pasos:**
1. Cópialo y renómbralo: `brief-[nombre-tarea].md`
2. Rellena cada sección. Borra las instrucciones y los bloques de ejemplos antes de pasarlo a la IA.
3. Las secciones marcadas como _(opcional)_ puedes omitirlas si la tarea es pequeña o no aplican.
4. Envíalo con este prompt inicial:
   *"Este es mi Technical Brief. Antes de escribir código: (1) critica el brief — ¿qué falta, qué está ambiguo? (2) devuélveme un plan paso a paso numerado."*
5. Negocia el plan. Solo entonces pide implementación por bloques.

---

## 0. Snapshot _(opcional)_

_Permite un vistazo rápido antes de leer el brief completo. Útil cuando lo compartes con otras personas o lo retomas días después._

| Campo | Valor |
|---|---|
| Fecha | |
| Tipo | `Frontend` / `Backend` / `Full-stack` / `Integración` / `Automatización` |
| Stack principal | |
| Estado | `Draft` / `Ready` / `En progreso` |

---

## 1. Contexto

_Es la sección más importante. Sin contexto, la IA asume y genera código genérico. Esta sección le dice a la IA dónde vive el problema y por qué se está resolviendo._

### ¿Qué existe hoy?

Describe el estado actual del sistema. ¿Arrancas de cero? ¿Hay código legacy? ¿Qué partes se tocan? Si es proyecto nuevo, escribe "proyecto desde cero" — eso también es contexto válido.

**Ejemplos**
- **Simple —** "Proyecto de landing page desde cero. Sin código existente. Stack: Next.js + TailwindCSS."
- **Complejo —** "Monolito en FastAPI que procesa pagos de manera síncrona en `/checkout`. Bloquea el hilo hasta recibir respuesta de Stripe, lo que provoca timeouts cuando la pasarela tarda más de 5 segundos."

### Problema

El dolor concreto. No "mejorar la experiencia" sino "hoy el usuario no puede hacer X porque Y." Mientras más específico, mejor guía a la IA.

**Ejemplos**
- **Simple —** "El carrusel actual usa `react-slick` (45kb) y no soporta swipe táctil. En móvil los usuarios no pueden deslizar imágenes y el Lighthouse score bajó a 68."
- **Complejo —** "Cuando la pasarela demora más de 5s, el usuario refresca la pantalla y genera pagos duplicados. El servidor no tiene mecanismo de idempotencia."

### Objetivo

Qué debe ser verdad al terminar esta tarea. Una o dos oraciones con intención técnica — no solo el "qué" sino el "cómo" a alto nivel.

**Ejemplos**
- **Simple —** "Reemplazar el carrusel con CSS Scroll Snap y hooks de React puros para eliminar la dependencia, habilitar swipe en móvil y pausar el autoplay en hover."
- **Complejo —** "Desacoplar la facturación para que el backend responda al cliente en <100ms, procese la confirmación vía webhook de Stripe y actualice la tabla de licencias de forma idempotente."

### Usuarios / Consumidores

¿Usuario final, equipo interno u otro servicio vía API? Define quién interactúa con lo que se construye — esto cambia toda la interfaz y las prioridades.

**Ejemplos**
- **Simple —** "Usuarios finales (visitantes del sitio). No requiere autenticación."
- **Complejo —** "Dos consumidores: el cliente web (recibe respuesta inmediata) y el webhook de Stripe (confirma el pago en background)."

---

## 2. Alcance _(opcional, recomendado en tareas medianas o grandes)_

_Nombrar explícitamente qué NO se hace es la herramienta más subestimada del brief. Evita que la IA (y tú) expandan el scope a mitad del camino._

### Dentro del alcance

**Ejemplos**
- **Simple —** Solo el componente `<Carousel />`. No incluye rediseño de la sección Hero.
- **Complejo —** Endpoint de webhook, validación de firma HMAC, guardado idempotente en tabla `payments`.

- [ ] ...
- [ ] ...

### Fuera del alcance

**Ejemplos**
- **Simple —** Internacionalización, animaciones complejas, integración con CMS.
- **Complejo —** Portal de reembolsos, dashboard de reportes, lógica de reintentos automáticos.

- [ ] ...
- [ ] ...

---

## 3. Stack & Arquitectura

_Delimita cómo debe implementarse la solución. Evita que la IA invente enfoques incompatibles con tu ecosistema o proponga librerías que no usas._

### 3.1 Stack

Borra las filas que no apliquen. Si algo no está en la lista, agrégalo.

| Capa | Tecnología |
|---|---|
| Frontend | React + Next.js + TypeScript |
| Estilos | TailwindCSS + shadcn/ui |
| Backend | Node.js + TypeScript |
| Backend (datos/ML) | Python + FastAPI |
| Base de datos | PostgreSQL vía Supabase |
| IA / LLM | Claude API |
| Automatización | n8n |
| Mensajería | Twilio (WhatsApp / SMS) |
| Deploy frontend | Vercel |
| Deploy backend | AWS / Docker |

### 3.2 Arquitectura — diagrama en texto _(opcional)_

_Un mapa visual de cómo se conectan las piezas. Imprescindible en tareas full-stack o con múltiples servicios. Puedes omitirlo si es un componente o módulo aislado._

**Ejemplo simple** — No aplica, componente UI aislado sin comunicación con backend.

**Ejemplo complejo**
```
[Cliente web]
      ↓ POST /api/v1/checkout
[FastAPI — responde 202 inmediato]
      ↓
[Cola de tareas — Celery / Redis]
      ↓
[Worker de pagos]
      ↓
[Stripe Webhook → POST /api/v1/webhooks/stripe]
      ↓
[Validación HMAC → Guardado idempotente → Supabase]
```

```
[Usuario / Cliente]
        ↓
[Frontend — Next.js / Vercel]
        ↓
[API / Endpoints — /api/v1/...]
        ↓
 ┌──────┴──────┐
[Servicio A]  [Servicio B]
        ↓
[Supabase / PostgreSQL]
        ↓
[Integraciones externas: Twilio | Claude API | n8n]
```

### 3.3 Contratos de datos _(opcional para tareas solo-frontend, recomendado si hay API)_

_Define qué entra y qué sale por cada endpoint o función crítica. Si no lo defines, la IA los inventa — y luego hay que corregirlos._

**Ejemplos**

Simple — El componente recibe props: `images: { url: string, alt: string }[]` y `autoPlayMs?: number`. No hay endpoint.

Complejo —
```
Endpoint: POST /api/v1/webhooks/stripe
Input headers: { "Stripe-Signature": string }
Input body:    { "type": "invoice.paid", "data": { "id": string, "amount": number } }
Output 200:    { "received": true }
Output 400:    { "error": "Invalid signature", "code": 400 }
```

```
Endpoint: [MÉTODO] /api/v1/[ruta]

Input:
{
  campo: tipo   // descripción
}

Output (200):
{
  campo: tipo
}

Error:
{
  error: string,
  code: number
}
```

---

## 4. Constraints

_Reglas que la IA debe respetar ciegamente. Las "reglas fijas" son estándares del stack que aplican siempre. Las "reglas específicas" son los requerimientos únicos de esta tarea._

### Reglas fijas (no negociables en todos los proyectos)

**Arquitectura**
- Servicios desacoplados: cada dominio en su módulo. Sin acceso directo a lógica interna de otro servicio.
- Adapter Pattern para cada integración externa. Si cambias de proveedor, solo tocas el adaptador.
- Strategy Pattern cuando haya variantes de lógica (por país, plan, tipo). Sin cadenas de `if/else`.
- Sin valores hardcodeados: precios, textos, reglas de negocio → base de datos, `.env`, o config.
- API REST versionada: prefijos `/api/v1/`.

**Calidad de código**
- TypeScript estricto. Sin `any`. Interfaces definidas.
- Type hints completos en Python (si aplica).
- Linter activo sin errores (ESLint / ruff).

**Seguridad**
- Inputs validados y sanitizados en el servidor. Nunca confiar en el cliente.
- Queries parametrizadas. Nunca concatenar strings SQL.
- Credenciales en variables de entorno. Nunca en código. `.env` en `.gitignore`.
- No logear datos sensibles (tokens, contraseñas, PII).

**Frontend (cuando aplique)**
- Mobile-first, responsive: probar en 375px / 768px / 1280px.
- HTML semántico (`<nav>`, `<main>`, `<article>`) — no todo `<div>`.
- Accesibilidad: contraste ≥4.5:1, `alt` en imágenes, foco visible, ARIA donde aplique.
- Imágenes en WebP con lazy loading. Usar `<Image>` de Next.js.
- Contenido indexable vía SSR/SSG — nunca client-side fetch para contenido SEO-crítico.
- Lighthouse Performance y SEO >90 (mobile).

**Testing**
- Cobertura mínima 80%. Cubrir: caso feliz, casos borde (vacío, null, tipo incorrecto), y errores.

**Observabilidad**
- Logs estructurados en backend.
- Sentry (o equivalente) para errores en producción.

### Reglas específicas de esta tarea

Lo que es único aquí: limitaciones de librerías, compatibilidades, reglas de negocio especiales, estándares del cliente.

**Ejemplos**
- **Simple —** "Prohibido usar librerías de animación o carrusel externas. Implementar con CSS Scroll Snap nativo."
- **Complejo —** "El webhook NUNCA debe registrar un pago dos veces — validar idempotencia por `stripe_event_id`. Si falla el guardado en BD, loguear el error y responder HTTP 200 igual (Stripe reintenta por su cuenta)."

- [ ] ...
- [ ] ...

---

## 5. Riesgos & Supuestos _(opcional, recomendado en tareas complejas)_

_Nombrar los riesgos antes de codear evita sorpresas a mitad del camino. Un supuesto no validado es un bug en potencia. Esta sección también ayuda a la IA a priorizar el manejo de errores._

**Ejemplo simple** — Generalmente no aplica para tareas de UI aisladas.

**Ejemplo complejo**

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | Stripe puede enviar el mismo evento dos veces | Alta | Validar idempotencia por `stripe_event_id` antes de insertar |
| 2 | La BD puede estar caída al momento del webhook | Media | Loguear fallo, responder 200 a Stripe, reintentar con job |
| 3 | Supabase no tiene la columna `stripe_event_id` aún | Alta | Incluir migración en el scope de esta tarea |

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | | Alta / Media / Baja | |
| 2 | | | |

---

## 6. Definition of Done

_Transforma el objetivo en criterios medibles. ¿Cómo sabes que terminaste? Sin esta sección, "listo" significa cosas distintas para ti y para la IA._

### Siempre se cumplen

- [ ] Linter pasa sin errores
- [ ] Cobertura de tests ≥80%, incluyendo casos borde
- [ ] TypeScript estricto, sin `any`
- [ ] Sin valores hardcodeados en lógica
- [ ] Inputs validados y sanitizados
- [ ] Credenciales en variables de entorno
- [ ] `.env.example` presente con todas las variables (sin valores reales)

**Frontend:**
- [ ] Responsive probado en 375px, 768px, 1280px
- [ ] Lighthouse Performance >90 y SEO >90 (mobile)
- [ ] HTML semántico y accesible
- [ ] Imágenes optimizadas

**Deploy:**
- [ ] App desplegada en el ambiente correcto
- [ ] Migraciones de BD aplicadas (si aplica)
- [ ] README con setup, variables de entorno y cómo correr tests

### Criterios específicos de esta tarea

**Ejemplos**
- **Simple —** "El carrusel pausa el autoplay al hacer hover. Funciona con swipe en Chrome DevTools mobile (375px). El bundle del componente no supera 5kb."
- **Complejo —** "El webhook responde HTTP 200 en menos de 100ms. Un evento duplicado no genera dos registros en `payments`. El log muestra el bloqueo del duplicado con el `stripe_event_id`."

- [ ] ...
- [ ] ...

---

## 7. Referencias & Notas _(opcional)_

_Cualquier contexto que no encaje arriba: links a Figma, tickets de Linear, decisiones de negocio previas, conversaciones anteriores con la IA, o restricciones que vienen de fuera del equipo técnico._

- ...
