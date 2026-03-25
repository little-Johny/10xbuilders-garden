---
name: executing-browser
description: Automatización de navegador con el CLI agent-browser (Vercel Labs): flujo snapshot/refs, screenshots (evidencia visual, --full/--annotate), comandos esenciales, encadenamiento, JSON para agentes, timeouts, CDP, perfiles y buenas prácticas de seguridad. Usar al probar UI en terminal, E2E ligeros, depurar flujos web, o cuando el usuario mencione agent-browser, browser automation CLI o executing-browser. Repositorio upstream: https://github.com/vercel-labs/agent-browser
---

# agent-browser (CLI)

CLI nativo (Rust) + daemon en segundo plano: control por CDP sobre **Chrome for Testing** (sin Playwright/Node en el daemon). Documentación viva: [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser).

## Instalación mínima

```bash
npm install -g agent-browser   # o: brew / cargo install
agent-browser install          # descarga Chrome (Chrome for Testing), primera vez
```

- **Linux:** `agent-browser install --with-deps` instala dependencias de sistema; si APT falla (repos rotos o nombres de paquetes), en este repo existe `scripts/fix-agent-browser-system-deps.sh` (Ubuntu 24.04 Noble).

## Flujo recomendado para agentes (refs)

1. `agent-browser open <url>` — navegar (alias: `goto`, `navigate`).
2. `agent-browser wait --load networkidle` — si la página es lenta o SPA.
3. `agent-browser snapshot` o `snapshot -i` — árbol de accesibilidad con **`[ref=eN]`**.
4. Actuar con **`@eN`**: `click @e2`, `fill @e3 "texto"`, `get text @e1`.
5. Tras cambios de DOM/navegación, **volver a `snapshot`** antes de nuevas acciones.

**Por qué refs:** deterministas, rápidos, encajan con LLM + snapshot.

### Opciones útiles de `snapshot`

| Flag | Efecto |
|------|--------|
| `-i`, `--interactive` | Solo controles interactivos (botones, enlaces, inputs). |
| `-c`, `--compact` | Menos ruido estructural. |
| `-d <n>` | Profundidad máxima del árbol. |
| `-s <selector>` | Acotar a un contenedor CSS. |

### Salida máquina

- `agent-browser snapshot --json` (y otros comandos con `--json`) para parsear en scripts/agentes.

## Encadenamiento en shell

El navegador **persiste** entre invocaciones (daemon). Encadenar con `&&`:

```bash
agent-browser open example.com && agent-browser wait --load networkidle && agent-browser snapshot -i
```

Separar comandos cuando haya que **interpretar** snapshot entre medias (refs desconocidos hasta leer salida).

## Comandos que más se usan

| Acción | Comando |
|--------|---------|
| Cerrar | `close` (alias `quit`, `exit`) |
| Captura pantalla | `screenshot [ruta]` — `--full` página completa; `--annotate` etiquetas alineadas con refs |
| PDF | `pdf <ruta>` |
| Esperar | `wait <selector>`, `wait <ms>`, `wait --text "…"`, `wait --url '**/ruta'`, `wait --load networkidle` |
| JS | `eval <js>` |
| Info | `get text\|html\|value\|attr\|title\|url …` |
| Semántico | `find role button click --name "Submit"`, `find text "Sign In" click`, etc. |

**Selectores:** además de `@eN`, CSS (`#id`, `.class`), `text=…`, `xpath=…`.

## Screenshots y evidencia visual

`snapshot` devuelve el árbol de accesibilidad (refs); **no guarda ningún archivo de imagen**. Si el usuario pide capturas, informes visuales o evidencia E2E, hay que ejecutar **`screenshot`** explícitamente.

```bash
agent-browser open http://localhost:5173/login
agent-browser screenshot ./capturas/login.png
# Vista completa (scroll):
agent-browser screenshot ./capturas/login-full.png --full
# Superponer etiquetas alineadas con los refs del snapshot:
agent-browser screenshot ./capturas/login-annotate.png --annotate
```

Convención útil: carpeta `capturas/` o `screenshots/` en el repo (añadir a `.gitignore` si no deben versionarse). Encadenar con `&&` tras `wait --load networkidle` si la SPA aún no pintó.

## Modo visible (depuración)

```bash
agent-browser open example.com --headed
# o env: AGENT_BROWSER_HEADED=1
```

## Timeouts

- Por defecto **~25 s** por acción (por debajo del timeout IPC ~30 s del CLI).
- `AGENT_BROWSER_DEFAULT_TIMEOUT=<ms>` — subir solo si hace falta; por encima de **30000** puede aparecer **EAGAIN** en operaciones lentas (el README lo advierte).

## Configuración persistente

Prioridad (baja → alta): `~/.agent-browser/config.json` → `./agent-browser.json` en cwd → variables `AGENT_BROWSER_*` → flags CLI.

- Claves en JSON en **camelCase** (`executablePath`, `ignoreHttpsErrors`, …).
- Booleanos: `--headed false` anula `"headed": true` en config.

## CDP y Chrome ya abierto

- Puerto: `agent-browser --cdp 9222 snapshot` o `connect 9222` una vez.
- WebSocket: `--cdp "wss://…"`.
- **Auto:** `--auto-connect` descubre Chrome con depuración remota (puertos habituales / `DevToolsActivePort`).
- Importar sesión: `--auto-connect state save ./auth.json` luego `--state ./auth.json` (ver README: riesgo de exponer control en localhost).

## Autenticación y estado

- **`--profile <dir>`** — perfil persistente (cookies, IndexedDB, caché).
- **`--session-name <nombre>`** — guardar/restaurar cookies + `localStorage` en `~/.agent-browser/sessions/`.
- **`--headers '<json>'`** — cabeceras HTTP **por origen** de la URL abierta; no se filtran a otros dominios (útil para Bearer sin login UI).

Cifrado en reposo de estados: `AGENT_BROWSER_ENCRYPTION_KEY` (hex 64 chars). No commitear archivos de estado; añadir a `.gitignore`.

## Seguridad (opt-in)

Para despliegues con LLM: `--content-boundaries`, `--max-output`, `--allowed-domains`, `--action-policy`, `--confirm-actions` (+ `AGENT_BROWSER_*` equivalentes). Revisar sección Security del README upstream.

## Sesiones aisladas

`agent-browser --session agent1 open …` — instancias separadas (cookies, historial). `agent-browser session list`.

## Batch (menos overhead)

Pipe de JSON array de arrays de strings a `agent-browser batch`; `--bail` para parar en el primer error.

## Actualizar el CLI

```bash
agent-browser upgrade
```

## Integración “skill” oficial del repo

El proyecto publica skill actualizable vía:

```bash
npx skills add vercel-labs/agent-browser
```

No copiar `SKILL.md` desde `node_modules` a mano (queda obsoleto). Este skill **executing-browser** del repo resume el flujo y reglas; para detalle de cada subcomando, `agent-browser --help` o el README en GitHub.

## Resumen operativo

1. Instalar Chrome: `agent-browser install` (y deps en Linux si aplica).
2. Bucle: **open → wait si hace falta → snapshot (-i) → actuar con @refs → re-snapshot si cambió la UI**.
3. Scripts/agentes: preferir **`--json`**.
4. Evidencia visual: **`screenshot <ruta>`** (`--full`, `--annotate`); `snapshot` no sustituye capturas.
5. Depuración: `--headed`, `inspect`, `console`, `errors`, `trace` / `profiler`.
6. CI o sin navegador local: proveedores `-p` (p. ej. browserless, browserbase) con API keys — ver README.
