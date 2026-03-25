#!/usr/bin/env bash
# Repara APT (repo Supabase en apt.fury.io → 404) e instala librerías para Chromium
# usado por agent-browser. En Ubuntu 24.04 Noble, algunos nombres que usa
# `agent-browser install --with-deps` (libcairo2t64, libpango-1.0-0t64, libdbus-1-3t64)
# no existen como paquetes; aquí se usan los equivalentes correctos.
#
# Uso: sudo bash scripts/fix-agent-browser-system-deps.sh

set -euo pipefail

if [[ "${EUID:-}" -ne 0 ]]; then
  echo "Este script debe ejecutarse como root. Ejemplo:" >&2
  echo "  sudo bash scripts/fix-agent-browser-system-deps.sh" >&2
  exit 1
fi

SUPABASE_LIST=/etc/apt/sources.list.d/supabase.list
if [[ -f "$SUPABASE_LIST" ]] && grep -qE '^[[:space:]]*deb[[:space:]].*apt\.fury\.io/supabase' "$SUPABASE_LIST"; then
  echo "Respaldando y deshabilitando $SUPABASE_LIST (404 en apt.fury.io/supabase)."
  cp -a "$SUPABASE_LIST" "${SUPABASE_LIST}.bak.$(date +%Y%m%d%H%M%S)"
  cat >"$SUPABASE_LIST" <<'EOF'
# Deshabilitado: https://apt.fury.io/supabase devuelve 404.
# Instalar Supabase CLI: npx supabase, npm o .deb desde GitHub releases.
# deb [trusted=yes] https://apt.fury.io/supabase/ /
EOF
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update

# Equivalente corregido a la lista que intenta `agent-browser install --with-deps`
# en Ubuntu 24.04 (noble).
CHROMIUM_DEPS=(
  libxcb-shm0 libx11-xcb1 libx11-6 libxcb1 libxext6 libxrandr2 libxcomposite1
  libxcursor1 libxdamage1 libxfixes3 libxi6 libgtk-3-0t64 libpangocairo-1.0-0
  libpango-1.0-0 libatk1.0-0t64 libcairo-gobject2 libcairo2 libgdk-pixbuf-2.0-0
  libxrender1 libasound2t64 libfreetype6 libfontconfig1 libdbus-1-3 libnss3
  libnspr4 libatk-bridge2.0-0t64 libdrm2 libxkbcommon0 libatspi2.0-0t64
  libcups2t64 libxshmfence1 libgbm1
)

apt-get install -y "${CHROMIUM_DEPS[@]}"

echo
echo "Listo. Comprueba con:"
echo "  agent-browser open https://example.com && agent-browser snapshot -c"
