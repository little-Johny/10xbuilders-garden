---
title: "Integración de la API de GitHub en Agentes de IA"
week: 4
lesson: 5
tags: [github, oauth, api, human-in-the-loop, langgraph, seguridad, tokens, openssl, telegram, stubs, client-id, client-secret]
date: 2026-04-23
status: done
---

# Integración de la API de GitHub en Agentes de IA

> **Síntesis.** Para que un agente de IA deje de ser un chatbot aislado y pueda operar sobre repositorios reales, necesita conectarse a la API de GitHub mediante OAuth, reemplazar sus funciones simuladas con llamadas auténticas e implementar un sistema de confirmación humana que impida que las acciones sensibles se ejecuten sin supervisión. Dominar este flujo —autenticación, integración y control— es lo que transforma al agente en una herramienta práctica de gestión de código.

## Introducción

En este módulo aprenderás a conectar un agente de inteligencia artificial con la API de GitHub mediante autenticación OAuth de forma segura. Descubrirás cómo reemplazar funciones simuladas con integraciones reales, configurar aplicaciones en el portal de desarrolladores y establecer flujos de confirmación humana (Human-in-the-Loop) para evitar bucles de ejecución al realizar acciones sensibles.

Al finalizar, serás capaz de dotar a tus agentes de capacidades prácticas como listar repositorios, crear nuevos proyectos y gestionar issues, validando todo el ecosistema tanto en interfaces web como en aplicaciones de mensajería como Telegram.

## Objetivos de aprendizaje

1. Planificar la integración de la API de GitHub en un agente de inteligencia artificial mediante el diseño de instrucciones detalladas en lenguaje natural.
2. Configurar una aplicación OAuth en el portal de desarrolladores de GitHub para gestionar la autenticación y obtener las credenciales de acceso requeridas.
3. Implementar variables de entorno y el almacenamiento seguro de tokens criptográficos utilizando herramientas como OpenSSL.
4. Desarrollar funciones específicas dentro del agente de IA que permitan listar repositorios, crear nuevos proyectos y gestionar issues de forma automatizada.
5. Validar el flujo de ejecución y los mecanismos de aprobación de seguridad del agente mediante pruebas prácticas en interfaces web y plataformas de mensajería como Telegram.

## Marco conceptual

### De funciones simuladas (stubs) a integración real

En las fases iniciales de desarrollo de un agente, es común utilizar **stubs**. Un stub es una función simulada que actúa como un marcador de posición; no ejecuta ninguna lógica real, sino que devuelve datos estáticos para probar el flujo de la aplicación.

La **transición a código real** constituye el primer paso en una integración: reemplazar estos stubs con llamadas auténticas a la API de GitHub, permitiendo que la IA extraiga y envíe datos verdaderos. Este cambio no es meramente cosmético; implica gestionar autenticación, manejar errores de red, parsear respuestas y respetar límites de tasa de la API.

Herramientas modernas de desarrollo (como el editor Cursor) incluyen modos de **planificación asistida por IA** donde, mediante lenguaje natural, se pueden definir los pasos exactos del desarrollo. Esto permite estructurar fácilmente qué endpoints consumir y cómo inyectar el código necesario en el proyecto, reduciendo la carga cognitiva de quien implementa la integración.

### Autenticación mediante GitHub OAuth

Para que un agente interactúe con GitHub en nombre de un usuario específico, debe usar un método seguro de delegación de permisos llamado **OAuth** (Open Authorization).

El proceso comienza registrando una **GitHub OAuth App** en el portal de desarrolladores de GitHub. Esto indica a la plataforma quién está haciendo las peticiones y bajo qué permisos opera. El registro genera dos credenciales fundamentales: el **Client ID** y el **Client Secret**. El primero es un identificador público que viaja en las URLs de autorización; el segundo funciona como una contraseña de la aplicación y jamás debe ser expuesto en repositorios públicos ni en código del lado del cliente.

Una vez que el usuario autoriza la aplicación a través del flujo OAuth, GitHub devuelve un **token de acceso**. Este token debe almacenarse de forma segura para que el agente lo use en futuras peticiones sin necesidad de solicitar permisos nuevamente en cada interacción. La gestión adecuada de este token —dónde se guarda, cómo se renueva, cuándo se revoca— es una de las decisiones de seguridad más críticas de la integración.

### Seguridad y prevención de bucles (Human-in-the-Loop)

Darle a una IA el poder de modificar código o crear repositorios conlleva riesgos significativos si comete un error o alucina.

El **problema de los bucles infinitos** aparece cuando un agente desarrollado con frameworks como LangChain o LangGraph intenta ejecutar una acción sensible y la API la rechaza. Sin mecanismos de control, el agente puede intentar reescribir la petición y reenviarla una y otra vez, entrando en un ciclo que consume recursos técnicos y económicos sin resolver el problema original.

Para evitar esto, se implementa un **sistema de confirmación** basado en el patrón **Human-in-the-Loop**. Antes de que el agente ejecute una acción de escritura (como crear un repositorio o un issue), el flujo del programa se detiene y solicita al usuario que apruebe la acción explícitamente. Solo tras la validación humana el agente procede con la llamada a la API. Este patrón no elimina la autonomía del agente, sino que la acota: las acciones de lectura pueden ejecutarse sin intervención, mientras que las de escritura requieren supervisión.

### Configuración de variables de entorno y seguridad local

Las credenciales de configuración técnica requieren un manejo estricto para evitar vulnerabilidades.

Los **archivos `.env`** se utilizan para almacenar variables de entorno de forma local durante el desarrollo, separando la configuración sensible del código fuente. Estos archivos nunca deben subirse al repositorio; por eso se incluyen en `.gitignore`. El Client ID, el Client Secret, el token de acceso y cualquier otra credencial viven exclusivamente en este archivo durante el desarrollo local.

**OpenSSL** es una herramienta de criptografía que permite generar secuencias de caracteres aleatorias y altamente seguras. En el contexto de los agentes, se utiliza para generar **claves secretas** (secret keys) que encriptan las sesiones de los usuarios y protegen los tokens de GitHub almacenados localmente. Un comando como `openssl rand -hex 32` genera una cadena hexadecimal de 64 caracteres con entropía suficiente para uso criptográfico en producción.

### Pruebas de integración y casos de uso

Una integración robusta debe validarse en diferentes entornos e interfaces para confirmar que cada capa del sistema funciona correctamente.

Las **acciones de lectura**, como el listado de repositorios, constituyen la prueba inicial de conexión. Verifican que el token OAuth funciona correctamente y que el agente es capaz de extraer información sin modificar el estado de la cuenta. Si esta prueba falla, el problema está en la autenticación o en la configuración de permisos, no en la lógica del agente.

Las **acciones de escritura**, como la creación de repositorios e issues, validan el mecanismo de seguridad completo. El usuario solicita mediante lenguaje natural (por ejemplo, vía Telegram) crear un issue; el agente prepara la llamada a la API, pausa su ejecución, muestra el botón de confirmación en el chat y, solo tras la validación humana, emite la orden final a GitHub. Este flujo demuestra que el patrón Human-in-the-Loop funciona de extremo a extremo, desde la intención del usuario hasta la acción ejecutada en el servicio externo.

## Síntesis

Integrar la API de GitHub en un agente de IA es mucho más que conectar endpoints: es establecer un flujo completo de autenticación delegada, control de acceso y supervisión humana. La transición de stubs a código real exige gestionar credenciales OAuth con rigor, proteger tokens mediante criptografía adecuada y garantizar que ninguna acción de escritura se ejecute sin aprobación explícita. El patrón Human-in-the-Loop cierra el circuito de seguridad, convirtiendo al agente en una herramienta confiable que opera sobre repositorios reales sin sacrificar el control del desarrollador.

## Preguntas de repaso

1. ¿Qué es un stub y por qué es útil en las fases iniciales del desarrollo de un agente, antes de implementar la integración real con la API de GitHub?
2. ¿Cuál es la diferencia entre el Client ID y el Client Secret en una aplicación OAuth de GitHub, y por qué el segundo requiere protección especial?
3. Describe el flujo completo del patrón Human-in-the-Loop cuando un usuario solicita al agente crear un issue en GitHub a través de Telegram.
4. ¿Por qué se utiliza OpenSSL para generar claves secretas en lugar de inventar manualmente una cadena de caracteres?
5. ¿Qué ventaja tiene validar primero las acciones de lectura (listar repositorios) antes de probar las acciones de escritura (crear issues)?

## Recursos

- [Autorización de aplicaciones OAuth en GitHub](https://docs.github.com/es/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Documentación oficial de la API REST de GitHub](https://docs.github.com/es/rest)
- [LangGraph: Patrón Human-in-the-loop](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/)
- [GitHub Tool (repositorio)](https://github.com/langchain-ai/langchain/tree/master/libs/community/langchain_community/tools/github)

## Notas personales


