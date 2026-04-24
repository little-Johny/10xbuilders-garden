---
title: "Integración de un agente de IA local con Telegram"
week: 4
lesson: 4
tags: [telegram, bot-father, ngrok, webhook, token, variables-entorno, vinculacion-cuentas, sesiones-activas, omnicanal, integracion]
date: 2026-04-22
status: done
---

# Integración de un agente de IA local con Telegram

> **Síntesis.** Un agente que razona bien en la web solo se convierte en asistente real cuando también está donde el usuario ya vive: su mensajería. Integrar Telegram con un agente que corre en local exige dos piezas complementarias —una identidad de bot emitida por **BotFather** y un túnel público generado con **Ngrok**— y una coreografía precisa entre ambas: registrar un **webhook** que apunte del servidor de Telegram a tu máquina, y vincular la cuenta de usuario con el bot mediante un código de validación. Con esas piezas en su sitio, el mismo agente responde desde el navegador y desde el móvil sin perder contexto.

## Introducción

Las lecciones anteriores dejaron al agente hablando desde la interfaz web: autenticación, memoria y modelo convergían en un asistente utilizable. El siguiente paso natural no es mejorar ese canal, sino multiplicarlo. Telegram es una plataforma de mensajería que permite exponer un bot sin desplegar una app móvil propia y, al mismo tiempo, obliga a resolver dos problemas nuevos: cómo emitir la identidad del bot que hablará en su plataforma y cómo hacer que sus servidores puedan contactar a un agente que aún vive en `localhost`. Esta lección recorre ese camino paso a paso —creación del bot, exposición del entorno local, registro del webhook y vinculación de la cuenta— y cierra con la verificación de que las sesiones de web y Telegram coexisten contra la misma base de datos.

## Objetivos de aprendizaje

1. Crear un bot de Telegram mediante **BotFather**, obtener su **Access Token** y configurarlo como variable de entorno del proyecto local.
2. Instalar y autenticar **Ngrok** para generar una URL pública que exponga de forma segura el servidor de desarrollo a Internet.
3. Registrar un **webhook** mediante la API del proyecto para habilitar la comunicación bidireccional entre los servidores de Telegram y el agente local.
4. Vincular de forma segura la cuenta de la plataforma web con el bot de Telegram a través de un código de validación único.
5. Verificar la integración mediante pruebas conversacionales y comprobando que las **sesiones activas** de ambos canales conviven en la base de datos.

## Marco conceptual

### Creación del bot en Telegram mediante BotFather

**BotFather** es el bot oficial de Telegram dedicado a crear y administrar otros bots: funciona como un panel central al que se le habla por chat para emitir nuevas identidades, configurar nombres y avatares, definir comandos y, sobre todo, generar la credencial que cada bot necesita para operar. Desde el punto de vista del desarrollador, es la única puerta de entrada para que un bot exista en la plataforma, y su diseño conversacional vuelve trivial lo que en otras plataformas sería un formulario administrativo.

El artefacto clave que BotFather entrega es el **Access Token**: una cadena alfanumérica aleatoria que actúa como credencial única del bot frente a la API de Telegram. Cada petición que la aplicación haga —enviar un mensaje, consultar actualizaciones, registrar un webhook— va firmada con ese token, y quien lo posea puede operar como el bot sin distinción. Por esa razón el token no se pega en el código ni se comparte en chats: se almacena como variable de entorno en `.env.local`, siguiendo la misma higiene de seguridad ya aplicada a las credenciales de Supabase y OpenRouter. Una vez inyectado en el entorno, el proyecto tiene ya la identidad con la que hablará en Telegram; lo que todavía le falta es un canal público por donde recibir los mensajes dirigidos a ese bot.

### Exposición del entorno local con Ngrok

El obstáculo que aparece en cuanto se intenta conectar Telegram con una app en desarrollo es de red, no de código. Los servidores de Telegram necesitan poder enviar peticiones HTTP al backend del bot cada vez que un usuario le escribe, pero una dirección como `http://localhost:3000` solo es resoluble dentro de la propia máquina del desarrollador: para el resto de Internet, ese host sencillamente no existe. Mientras el servidor viva únicamente en la red privada del equipo, ningún evento externo puede llegar hasta él.

**Ngrok** es la herramienta que resuelve exactamente ese problema. Funciona como un túnel seguro entre Internet y la máquina local: tras registrarse en el servicio, instalar el cliente desde la terminal y autenticarlo con el token de la cuenta, Ngrok expone el puerto local al exterior a través de una URL pública —de la forma `https://xyz.ngrok-free.app` o equivalente— cuyas peticiones se redirigen de forma transparente al servidor de desarrollo. El efecto práctico es que Telegram deja de hablar con `localhost` para hablar con un dominio real, mientras el código sigue ejecutándose en la misma máquina donde se está iterando. Ngrok no es parte de la arquitectura final —en producción el dominio público lo aporta el despliegue— sino un intermediario operativo que desaparece en cuanto el proyecto sale del entorno local.

### Registro y configuración del webhook

Con la identidad del bot emitida y el servidor expuesto, queda conectar ambos extremos. Un **webhook** es un mecanismo de comunicación *event-driven*: en lugar de que el bot pregunte continuamente a Telegram si hay mensajes nuevos —el patrón conocido como *polling*, costoso y poco oportuno—, Telegram es quien notifica al bot cada vez que ocurre un evento relevante enviando una petición HTTP a una URL previamente registrada. El webhook invierte la dirección habitual cliente-servidor y la convierte en bidireccional: el agente puede enviar mensajes a Telegram y Telegram puede empujar eventos al agente sin latencia innecesaria.

El registro, sin embargo, exige un orden preciso. Primero hace falta que el servidor de desarrollo lea las nuevas variables de entorno —el token del bot y la URL pública de Ngrok—, cosa que solo ocurre al arrancar el proceso; por eso cada modificación del `.env.local` obliga a reiniciar el servidor, siguiendo la misma regla vista con la clave de OpenRouter. Una vez el servidor está corriendo con el entorno actualizado, el proyecto expone un endpoint propio cuya única responsabilidad es invocar a la API de Telegram y decirle: «de ahora en adelante, envía los eventos de este bot a esta URL». Telegram responde confirmando el alta, y desde ese instante cada mensaje dirigido al bot viaja automáticamente por el túnel de Ngrok hasta el handler correspondiente del agente local.

### Vinculación de cuentas y gestión de sesiones

Que el bot reciba mensajes no basta: el agente necesita saber *quién* le está hablando para servirle el historial y las herramientas correctas. La vinculación entre la cuenta de la plataforma web y la cuenta de Telegram se resuelve con un **código de vinculación**: la interfaz web genera un código único y de un solo uso, el usuario lo envía como mensaje al bot, y el backend reconoce en esa coincidencia una prueba suficiente de que ambos identificadores —el de la sesión web y el del chat de Telegram— corresponden a la misma persona. A partir de ese emparejamiento, el perfil de Telegram queda asociado al perfil de la aplicación, y cualquier mensaje posterior se procesa en el contexto del usuario correcto.

La prueba de que la vinculación funcionó es conversacional: el bot reconoce al usuario por nombre —el mismo que definió durante el onboarding— y es capaz de enumerar las herramientas habilitadas para su cuenta, exactamente como ocurre en la web. Ese mismo reconocimiento abre la puerta a lo que da sentido a todo el módulo: la **omnicanalidad**. La base de datos mantiene **sesiones activas** en paralelo por cada canal, de modo que el usuario puede escribir desde el navegador y desde Telegram sin que un hilo contamine al otro, pero compartiendo el perfil y el contexto general del agente. Inspeccionar la tabla de sesiones tras una prueba cruzada deja a la vista dos registros simultáneos por el mismo `userId` —uno por `web` y otro por `telegram`—, evidencia directa de que la arquitectura multicanal descrita en la primera lección del módulo ya está operando como se prometió.

## Síntesis

Integrar Telegram con un agente local es, bien mirada, una sucesión de acoplamientos bien ordenados: BotFather emite una identidad, Ngrok provee un dominio público temporal, el webhook conecta ambos mundos y el código de vinculación ata la cuenta del usuario a su chat. Cada pieza resuelve un problema distinto —identidad, alcance de red, bidireccionalidad, identificación de usuario— y solo cuando las cuatro están en su sitio el mismo agente aparece donde el usuario ya estaba. A partir de este punto, la conversación deja de depender del navegador y la multicanalidad deja de ser un diagrama de arquitectura para volverse comportamiento observable contra la base de datos.

## Preguntas de repaso

1. ¿Qué rol cumple BotFather en el ecosistema de Telegram y por qué el Access Token que emite debe vivir exclusivamente como variable de entorno?
2. ¿Qué problema concreto resuelve Ngrok cuando se intenta integrar un servicio externo con una aplicación que corre en `localhost`, y qué le aporta frente a simplemente publicar el puerto en la red local?
3. ¿En qué se diferencia un webhook de una estrategia de polling y por qué es el modelo de comunicación adecuado para un bot conversacional?
4. ¿Qué función cumple el código de vinculación al asociar la cuenta web con la cuenta de Telegram y qué garantía de seguridad aporta que sea de un solo uso?
5. ¿Qué evidencia concreta confirma, en la base de datos, que el agente está operando de forma verdaderamente omnicanal tras completar la integración?

## Notas personales

- Me costó un buen rato descubrir por qué el login de la web dejaba de funcionar al entrar por la URL de Ngrok. El `next.config.ts` tenía `allowedDevOrigins: ["*.ngrok-free.app"]`, pero el túnel que levantó Ngrok usaba el TLD `.dev` (`*.ngrok-free.dev`). Ese simple mismatch bastaba para que Next.js bloqueara recursos *cross-origin* del dev server (HMR y compañía), lo que impactaba más allá del recargado en caliente: el `router.refresh()` que dispara el flujo de login necesita re-hidratar la sesión vía RSC contra ese mismo origen, así que al bloquearse las peticiones la sesión no terminaba de establecerse en el cliente. Lo arreglé ampliando la allowlist a `*.ngrok-free.app`, `*.ngrok-free.dev`, `*.ngrok.app` y `*.ngrok.dev`, y dejé además `NEXT_ALLOWED_DEV_ORIGINS` como *env var* de escape para poder whitelistear hosts puntuales sin tocar código. Detalle clave que casi me hace perder la noche: `next.config.ts` **no** hace hot reload, así que hasta que no reinicié el dev server la nueva allowlist no se aplicó y seguía viendo el mismo error.
- Recursos de referencia que me quedan anotados para reconsultar: la documentación oficial de Telegram sobre [BotFather y creación de bots](https://core.telegram.org/bots#botfather), la [guía de inicio rápido de Ngrok](https://ngrok.com/docs/getting-started/), y la muy recomendada [Marvin's Marvellous Guide to All Things Webhook](https://core.telegram.org/bots/webhooks) para entender el lado de Telegram en detalle.
