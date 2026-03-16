# Master Protocol — Review de Código IA

> **Principio rector:** No todo el código merece el mismo nivel de revisión. Escala el esfuerzo según el riesgo real de la tarea, no por ansiedad.

---

## Cuándo usar este protocolo

Antes de hacer commit o abrir un PR con código que vino (total o parcialmente) de una sesión con IA.

---

## Nivel 1 — Review Rápido _(tareas de UI, scripts aislados, componentes sin estado crítico)_

Tiempo estimado: **5-10 min**

- [ ] El código hace lo que pedí en el Brief — nada más, nada menos.
- [ ] No hay imports inventados o librerías que no usamos.
- [ ] No hay credenciales o valores hardcodeados visibles.
- [ ] Borré comentarios genéricos y código muerto dejado por la IA.
- [ ] Corre sin errores en local.

---

## Nivel 2 — Review Estándar _(features completas, integraciones, lógica de negocio)_

Tiempo estimado: **15-30 min**

Cubre todo el Nivel 1, más:

**Lógica**
- [ ] Revisé cálculos y condiciones clave a mano (especialmente floats, dinero, acumulaciones).
- [ ] Probé al menos un caso borde: `null`, vacío, valor fuera de rango.
- [ ] La implementación respeta las reglas de negocio del Brief sin "optimizaciones creativas".

**Seguridad**
- [ ] Queries parametrizadas — sin concatenación de strings SQL.
- [ ] Inputs validados en el servidor, no solo en el cliente.
- [ ] No se loguea información sensible (tokens, passwords, PII).

**Contexto**
- [ ] Respetó los constraints del Brief (dependencias permitidas, arquitectura, patrones).
- [ ] No introdujo scope creep (funciones extra que no pedí).

---

## Nivel 3 — Review Profundo _(autenticación, pagos, datos sensibles, cambios de arquitectura)_

Tiempo estimado: **30-60 min**

Cubre Nivel 1 + 2, más:

**Seguridad ampliada**
- [ ] Autenticación y manejo de sesiones alineados con el sistema existente.
- [ ] Revisé el flujo completo de permisos — no solo el happy path.
- [ ] Sin datos sensibles expuestos al cliente (response objects, logs, errores).

**Resiliencia**
- [ ] Qué pasa si falla la integración externa — hay manejo de errores o al menos no rompe silenciosamente.
- [ ] Idempotencia validada donde aplique (webhooks, operaciones de escritura repetibles).

**Tests**
- [ ] Existe al menos un test del caso feliz y uno de error/borde.
- [ ] Los tests existentes siguen pasando.

---

## Cómo elegir el nivel

| Tipo de tarea | Nivel |
|---|---|
| UI, estilos, scripts de apoyo | 1 |
| Features con lógica, APIs internas, CRUD | 2 |
| Auth, pagos, datos sensibles, integraciones críticas | 3 |
| No estoy seguro | Empieza en 2, sube si encuentras algo raro |

---

## Salida esperada

Al terminar el review, el código debe poder integrarse **sin deuda técnica visible**.
Si encontraste algo que no puedes resolver ahora, abre un ticket — no hagas commit con `// TODO: fix this`.

---

## Referencia

Para el detalle completo de cada punto: [protocolo-review-ia.md](protocolo-review-ia.md)
Para el contexto del ciclo completo BPIR: [plantilla-brief-ia.md](plantilla-brief-ia.md)
