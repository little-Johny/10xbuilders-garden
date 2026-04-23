---
title: "Configuración inicial de un agente de IA con Supabase"
week: 4
lesson: 2
tags: [supabase, nodejs, npm, postgres, autenticacion, migraciones-sql, env, onboarding, open-router, backend]
date: 2026-04-22
status: done
---

# Configuración inicial de un agente de IA con Supabase

> **Síntesis.** Antes de que un agente pueda razonar, necesita una base: un backend que gestione identidad, sesiones y contexto. Configurar correctamente Supabase como capa de datos y autenticación —con sus credenciales en `.env.local`, sus migraciones aplicadas y el onboarding completado— es el paso que convierte un repositorio clonado en una aplicación realmente ejecutable, y la condición previa obligatoria para integrar modelos de lenguaje después.

## Introducción

El atractivo visible de un agente es su conversación, pero su esqueleto es infraestructura. Para que una interacción funcione —aun antes de invocar a un LLM— hacen falta usuarios autenticados, sesiones persistentes y un contexto que defina cómo se comporta la IA. Esta lección recorre ese montaje inicial de forma práctica: se parte del repositorio ya clonado, se instancia el backend en Supabase, se inyectan las credenciales en el entorno local, se aplican las migraciones SQL que modelan la base y se levanta la app en el navegador para personalizar el agente y comprobar que los datos se guardan como se espera.

## Objetivos de aprendizaje

1. Enumerar las herramientas del ecosistema que el proyecto requiere (Node.js, npm, Supabase, Open Router, Telegram) y justificar el rol de cada una.
2. Crear un proyecto en Supabase y trasladar sus credenciales (Project URL, Anon Key, Service Role Key) al archivo `.env.local` entendiendo el alcance de cada clave.
3. Aplicar una migración SQL desde el editor de Supabase para crear tablas y políticas de seguridad, y ajustar la configuración de autenticación para desarrollo local.
4. Instalar dependencias, levantar el servidor de desarrollo y completar el onboarding para dejar el agente personalizado y verificado contra la base.

## Marco conceptual

### Herramientas del entorno y por qué cada una importa

El stack de esta etapa combina piezas de propósitos distintos que conviene delimitar antes de tocar nada. **Node.js** (versión 20 o superior) es el runtime de JavaScript que ejecuta el proyecto fuera del navegador, y **npm** es el gestor que resuelve e instala las librerías declaradas en `package.json`. **Supabase** es una plataforma *Backend-as-a-Service* construida sobre PostgreSQL que aporta, en un solo lugar, base de datos relacional, autenticación y reglas de seguridad; en este proyecto hace las veces de backend completo. **Open Router** aparece en escena como enrutador de APIs de modelos de lenguaje: unifica el acceso a varios proveedores (GPT-4, entre otros) detrás de una interfaz común, aunque su integración se aborda en una lección posterior. **Telegram**, por último, se reserva para la fase multicanal, donde el mismo agente se expondrá como bot.

Entender esta división evita confusiones típicas: Supabase no "habla" con el modelo, y Open Router no persiste datos. Cada pieza tiene su frontera, y la arquitectura funciona porque esas fronteras están bien definidas.

### Supabase como backend y la lógica de las credenciales

Crear un proyecto en Supabase (por ejemplo, llamado `AI Agent`) genera automáticamente una instancia de Postgres, un endpoint de API REST y un sistema de autenticación. Para que el código local pueda dialogar con esa instancia, necesita tres credenciales, y cada una existe por una razón distinta.

La **Project URL** es la dirección única de la API del proyecto: el "dónde". La **Anon Key** es una clave pública pensada para usarse desde el cliente; no concede privilegios por sí sola, sino que queda sometida a las políticas de seguridad (Row Level Security) definidas en la base. La **Service Role Key**, en cambio, es una clave privada de uso administrativo que ignora esas políticas y, por lo tanto, solo debe vivir en el servidor: exponerla en el frontend equivale a dar acceso total a la base.

Estas tres credenciales se almacenan en un archivo **`.env.local`**, que guarda **variables de entorno**: valores parametrizables que el proceso lee al arrancar y que mantienen fuera del código fuente información sensible o dependiente del entorno (URLs, claves, tokens). El archivo se construye a partir de un template incluido en el repositorio, lo que asegura que el listado de variables esperadas esté siempre documentado.

### Autenticación en modo desarrollo y migraciones SQL

Supabase, por defecto, pide confirmación por email para cada usuario nuevo. Ese comportamiento es correcto en producción, pero entorpece el desarrollo local: cada cuenta de prueba exigiría abrir el correo y hacer clic en un enlace. Desactivar temporalmente la confirmación de email en el panel de Supabase es una práctica habitual mientras se itera en local, siempre asumiendo que se volverá a habilitar antes de exponer el sistema.

Con la autenticación flexibilizada, falta modelar la base. Una **migración SQL** es, en esencia, un conjunto de instrucciones que modifica la estructura de una base de datos de forma reproducible: crear tablas, definir columnas, establecer relaciones, aplicar políticas de acceso. En este proyecto, el repositorio trae el script de migración ya escrito; basta con copiarlo al **SQL Editor** de Supabase y ejecutarlo. El resultado es la creación de las tablas que soportan usuarios, sesiones y configuración del agente, junto con las reglas de seguridad que la aplicación asume como premisa. Sin esta migración, el frontend intentará leer y escribir contra tablas inexistentes.

### Puesta en marcha local y onboarding del agente

Una vez conectado el backend, el ciclo local es estándar: `npm install` descarga las dependencias declaradas en el proyecto y el script de desarrollo levanta el servidor, que queda accesible en un puerto local (típicamente `3001`). A partir de ahí, el navegador ya muestra la interfaz de la app.

Lo que sigue es el **onboarding**: el flujo guiado que la aplicación presenta la primera vez que un usuario entra. Incluye el alta de cuenta y la definición del **contexto del agente**, es decir, los parámetros que condicionan su comportamiento: nombre (por ejemplo, `Nia 2`), idioma principal, zona horaria y qué herramientas externas tiene habilitadas (como la integración con GitHub para operar sobre repositorios). Este contexto no es cosmético: es lo que después alimentará al modelo para que sus respuestas sean consistentes con la identidad del agente.

### Verificación contra el Table Editor

El cierre de la configuración no se hace "confiando" en que todo salió bien, sino inspeccionando la base. El **Table Editor** de Supabase ofrece una vista tabular —parecida a una hoja de cálculo— de cada tabla del proyecto. Tras completar el onboarding, el perfil del usuario recién creado debe aparecer en la tabla de perfiles, y la configuración del agente, en la tabla correspondiente de sesiones/contexto. Esa inspección visual confirma dos cosas a la vez: que las credenciales y las políticas están bien, y que el frontend está escribiendo donde se espera. Solo con esta verificación tiene sentido avanzar hacia la integración con Open Router y el comportamiento generativo del agente.

## Síntesis

La configuración inicial no es burocracia previa: es la que decide si el agente existirá como sistema o solo como prototipo. Preparar el entorno con Node.js y npm, instanciar Supabase con sus tres credenciales bien ubicadas, aplicar la migración SQL, relajar la autenticación para desarrollo y completar el onboarding son pasos encadenados cuyo resultado visible —un perfil y una sesión persistidos en la base— es la señal de que la infraestructura de datos ya está lista para sostener la inteligencia que vendrá encima.

## Preguntas de repaso

1. ¿Qué diferencia hay entre la Anon Key y la Service Role Key de Supabase y por qué esta última nunca debe vivir en el frontend?
2. ¿Qué problema concreto resuelve aplicar una migración SQL desde el repositorio en el SQL Editor antes de usar la aplicación?
3. ¿Por qué se desactiva la confirmación de email en desarrollo y qué habría que revertir antes de ir a producción?
4. ¿Qué información debería aparecer en el Table Editor después de un onboarding exitoso y qué significa su presencia?