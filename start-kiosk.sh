#!/bin/bash
# start-kiosk.sh — lance Nuxt + Chromium kiosk au démarrage
# Usage : ./start-kiosk.sh

export DISPLAY=:0.0
export XAUTHORITY=/home/orangepi/.Xauthority

SCREEN_DIR="$(cd "$(dirname "$0")" && pwd)"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── 1. Nuxt dev ─────────────────────────────────────────────────────────────
if pgrep -f "nuxt dev" > /dev/null; then
  log "Nuxt déjà en cours ($(pgrep -f 'nuxt dev' | head -1))"
else
  log "Démarrage Nuxt dev..."
  cd "$SCREEN_DIR"
  nohup npm run dev >> /tmp/nuxt.log 2>&1 &
  log "Nuxt lancé (PID: $!), attente démarrage serveur..."
  sleep 8
fi

# ── 2. Chromium kiosk ───────────────────────────────────────────────────────
if pgrep -f "chromium-bin" > /dev/null; then
  log "Chromium déjà en cours, rien à faire."
else
  log "Lancement Chromium kiosk..."
  nohup /usr/lib/chromium/chromium-wrapper \
    --kiosk \
    --remote-debugging-port=9222 \
    --use-fake-ui-for-media-stream \
    --autoplay-policy=no-user-gesture-required \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --disable-background-networking \
    --disable-dev-shm-usage \
    --force-color-profile=srgb \
    --renderer-process-limit=1 \
    --disk-cache-size=10485760 \
    --disable-gpu-shader-disk-cache \
    http://localhost:3000 \
    >> /tmp/chromium.log 2>&1 &
  log "Chromium lancé (PID: $!)"
fi

log "Kiosk démarré. Restarts automatiques toutes les 8h via cron."
