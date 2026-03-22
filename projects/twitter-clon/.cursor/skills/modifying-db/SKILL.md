---
name: modifying-db
description: Describe cómo crear y aplicar migraciones SQL de Supabase en el proyecto twitter-clon (flujo local con CLI), incluido el reset cuando el estado de migraciones está corrupto y la revisión antes de subir cambios. Usar al modificar el esquema de la base de datos, añadir tablas o migraciones, trabajar con Supabase en local, cuando sea requerido modificar el schema de la base de datos o cuando el usuario mencione modifying-db o migraciones de base de datos en este repositorio.
---

# Modificar la base de datos (Supabase, twitter-clon)

Procedimiento para cambios de esquema con el CLI de Supabase. **Directorio de trabajo obligatorio:** raíz del proyecto `projects/twitter-clon/` (no `app/` ni `api/`).

## Prerrequisitos

- Dependencia `supabase` en la raíz del proyecto; usar **`npx supabase`** desde esa raíz para alinear la versión con `package.json`.
- Para aplicar migraciones en local: stack local en ejecución (`npx supabase start` si aún no está levantado).

## 1. Crear una migración

```bash
cd /home/johny/dev/personal/10xbuilders-garden/projects/twitter-clon
npx supabase migration new nombre_descriptivo_snake_case
```

Esto genera un archivo SQL nuevo bajo `supabase/migrations/`. Editar ese archivo con el DDL/DML necesario (idempotencia y orden según buenas prácticas SQL).

## 2. Evaluar la migración antes de subirla

Antes de integrar en la rama remota o compartir el cambio:

1. **Revisar el SQL** a mano: coherencia con el modelo, índices, `IF NOT EXISTS` / políticas RLS si aplica, reversibilidad razonable.
2. **Probar en local:** aplicar con `migration up` (siguiente sección) y comprobar que la app/API o consultas esperadas funcionan.
3. Opcional: `npx supabase migration list` para ver estado local vs archivos.

Si quieres alinear el esquema con los tipos generados por Supabase (archivo `api/src/types/supabase.ts`, salida en TypeScript del CLI; el servidor del API sigue siendo JS), tras validar el cambio ejecutar desde la raíz (con `SUPABASE_PROJECT_ID` configurado): `npm run supabase:gen`.

## 3. Aplicar migraciones pendientes (base local)

```bash
npx supabase migration up
```

Aplica las migraciones pendientes al **Postgres local** gestionado por Supabase CLI.

## 4(Opcional). Si el estado de migraciones se corrompe

Cuando el historial o la base local quedan inconsistentes y no basta con `repair`:

```bash
npx supabase db reset
```

Reinicia la base local y **vuelve a aplicar todas** las migraciones desde `supabase/migrations/`. Úsalo con cuidado: borra datos locales en esa base.

## Resumen rápido

| Acción | Comando (desde raíz `twitter-clon/`) |
|--------|----------------------------------------|
| Nueva migración | `npx supabase migration new <nombre>` |
| Aplicar en local | `npx supabase migration up` |
| Reset local (corrupción / empezar limpio) | `npx supabase db reset` |

## Notas

- El frontend **no** toca la base directamente; los cambios de esquema alimentan el backend/API y las políticas que Supabase expone.
- Para despliegue o sincronización con un proyecto remoto de Supabase, el flujo concreto (p. ej. `db push`, enlaces, CI) depende de cómo esté enlazado el repo; este skill cubre los comandos locales indicados arriba.
