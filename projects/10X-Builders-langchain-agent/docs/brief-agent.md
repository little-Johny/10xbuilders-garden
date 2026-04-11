# Brief del Agente Didáctico

## 1. Título de la tarea

Fortalecer y documentar un agente didáctico en español que responda preguntas de forma clara y pueda apoyarse en herramientas simples para calcular y consultar la hora actual.

---

## 2. Contexto

Hoy el proyecto ya cuenta con una base funcional: recibe una pregunta desde consola, decide si necesita usar una herramienta y entrega una respuesta al usuario en español.

El valor principal del proyecto es educativo: mostrar de forma sencilla cómo construir un agente que razona, usa herramientas y mantiene una estructura ordenada para poder crecer sin romper lo existente.

El reto actual no está en “hacer que funcione”, sino en dejar una guía más clara de propósito, límites y criterios de calidad para que cualquier persona del equipo pueda continuar el trabajo con rapidez.

También existen puntos a cuidar a corto plazo:

- La herramienta de cálculo resuelve bien casos simples, pero su enfoque actual no es ideal para escenarios de producción.
- La configuración depende de variables de entorno correctas; si faltan, la ejecución falla (lo cual es deseable, pero requiere buena documentación).
- El proyecto está listo para crecer con nuevas herramientas, pero necesita mantener una forma de trabajo consistente para no perder claridad.

El objetivo de este brief es alinear al equipo en una visión compartida: mantener el agente simple, útil y fácil de extender, con foco en calidad, pruebas y comunicación clara.

---

## 3. Requerimientos del proyecto

### Lenguaje y stack

- El proyecto está construido con TypeScript sobre Node.js moderno.
- Usa LangChain para componer el agente y orquestar el uso de herramientas.
- Se conecta a OpenRouter para acceder al modelo de lenguaje.
- Usa validación de configuración para asegurar que el entorno esté completo antes de ejecutar.
- Cuenta con pruebas automatizadas y validaciones de calidad para mantener estabilidad.

### Arquitectura y enfoque

La solución está dividida en capas claras para que cada parte tenga una responsabilidad concreta:

- Una capa de entrada recibe la pregunta del usuario.
- Una capa de ejecución coordina el proceso de respuesta.
- Una capa de composición arma el agente con su modelo, prompt y herramientas.
- Una capa de capacidades concentra las herramientas del dominio (cálculo y hora).
- Una capa de configuración centraliza y valida variables de entorno.

Este enfoque permite:

- Entender rápido qué hace cada módulo.
- Agregar nuevas herramientas sin reescribir todo.
- Probar piezas de forma aislada.
- Reducir riesgos al evolucionar el proyecto.

### Input esperado

El sistema espera preguntas escritas en lenguaje natural por parte del usuario.

Tipos de solicitudes contempladas hoy:

- Preguntas que requieren operaciones matemáticas sencillas.
- Preguntas sobre la hora actual.
- Preguntas mixtas que combinan ambos tipos.

Resultado esperado para el usuario:

- Respuesta en español.
- Explicación breve de lo que hizo el agente.
- Uso de herramientas solo cuando realmente aporta valor.

---

## 4. Restricciones

- Mantener el enfoque pedagógico: primero claridad, luego complejidad.
- Evitar agregar componentes que no aporten al objetivo principal del aprendizaje.
- No introducir dependencias innecesarias sin justificación funcional.
- Cuidar que cualquier mejora preserve compatibilidad con la ejecución por consola y pruebas existentes.
- Documentar claramente cualquier cambio en configuración, comportamiento o límites del agente.

---

## 5. Definition of Done (DoD)

El trabajo se considera terminado cuando:

- El brief refleja con precisión el estado actual del proyecto y su dirección inmediata.
- El lenguaje del documento es claro, humano y comprensible para perfiles no profundamente técnicos.
- Se explican propósito, funcionamiento general, límites y próximos pasos sin usar código.
- La información está alineada con la estructura real del repositorio, documentación y pruebas actuales.
- Queda claro cómo evaluar calidad mínima en cada cambio futuro (ejecución correcta, pruebas, consistencia y documentación).
