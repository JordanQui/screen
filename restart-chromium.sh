#!/bin/bash
# restart-chromium.sh — redémarre Chromium sans exposer le bureau, sur la même page
# Rideau GTK noir → sauvegarde URL → kill → reset GPU → relance → retire rideau
# Cron : 0 */8 * * * /home/orangepi/Desktop/screen/restart-chromium.sh >> /tmp/chromium-cron.log 2>&1

export DISPLAY=:0.0
export XAUTHORITY=/home/orangepi/.Xauthority

URL_FILE=/tmp/last-chromium-url
DEFAULT_URL=http://localhost:3000

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── 1. Rideau noir plein écran par-dessus Chromium ──────────────────────────
log "Ouverture rideau noir..."
python3 - &<<"PYEOF"
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk

win = Gtk.Window()
win.fullscreen()
win.set_keep_above(True)
win.set_decorated(False)
css = b"window { background-color: black; }"
provider = Gtk.CssProvider()
provider.load_from_data(css)
win.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
win.show_all()
Gtk.main()
PYEOF
CURTAIN_PID=$!

sleep 1

# ── 2. Sauvegarde l'URL active via l'API debug de Chromium ──────────────────
CURRENT_URL=$(curl -s --max-time 2 http://localhost:9222/json 2>/dev/null \
  | python3 -c "
import sys, json
try:
    tabs = json.load(sys.stdin)
    url = next((t['url'] for t in tabs if t.get('type') == 'page'), '')
    print(url)
except:
    pass
" 2>/dev/null)

if [[ -n "$CURRENT_URL" && "$CURRENT_URL" == http://localhost:3000* ]]; then
  echo "$CURRENT_URL" > "$URL_FILE"
  log "URL sauvegardée : $CURRENT_URL"
else
  CURRENT_URL=$(cat "$URL_FILE" 2>/dev/null || echo "$DEFAULT_URL")
  log "URL depuis fichier : $CURRENT_URL"
fi

# ── 3. Arrêt Chromium ───────────────────────────────────────────────────────
log "Arrêt Chromium..."
pkill -f "chromium-bin" 2>/dev/null
sleep 4

# ── 4. Libère les caches noyau (best-effort) ────────────────────────────────
sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

# ── 5. Relance Chromium sur la même page ────────────────────────────────────
log "Relance Chromium sur : $CURRENT_URL"
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
  "$CURRENT_URL" \
  >> /tmp/chromium.log 2>&1 &

# ── 6. Attend le chargement puis retire le rideau ───────────────────────────
log "Attente chargement page (~15s)..."
sleep 15

log "Retrait rideau noir..."
kill "$CURTAIN_PID" 2>/dev/null
wait "$CURTAIN_PID" 2>/dev/null

log "Redémarrage terminé sur $CURRENT_URL"
