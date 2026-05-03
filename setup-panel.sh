#!/bin/bash
# setup-panel.sh — installation initiale sur un nouveau tableau
# Usage : bash setup-panel.sh
#
# Ce script clone/met à jour le repo, installe les dépendances,
# et configure le lancement automatique au démarrage.

set -e

REPO_URL="https://github.com/JordanQui/screen.git"
BRANCH="distribution"
INSTALL_DIR="$HOME/Desktop/screen"
CRON_RESTART="0 */8 * * * $INSTALL_DIR/restart-chromium.sh >> /tmp/chromium-cron.log 2>&1"
AUTOSTART_DIR="$HOME/.config/autostart"
AUTOSTART_FILE="$AUTOSTART_DIR/wav-screen.desktop"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── 1. Cloner ou mettre à jour le repo ──────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Repo déjà présent — mise à jour..."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout distribution
  git -C "$INSTALL_DIR" pull origin distribution
else
  log "Clonage du repo..."
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# ── 2. Dépendances Node ──────────────────────────────────────────────────────
log "Installation des dépendances Node..."
cd "$INSTALL_DIR"
npm install

# ── 3. Autostart au démarrage (XDG) ─────────────────────────────────────────
log "Configuration du démarrage automatique..."
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_FILE" << 'EOF'
[Desktop Entry]
Type=Application
Name=Wav Screen Kiosk
Exec=/bin/bash -c "sleep 5 && /home/orangepi/Desktop/screen/start-kiosk.sh"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF
chmod +x "$AUTOSTART_FILE"

# ── 4. Cron redémarrage toutes les 8h ───────────────────────────────────────
log "Configuration du cron de redémarrage..."
# Ajouter le cron uniquement s'il n'existe pas déjà
(crontab -l 2>/dev/null | grep -qF "restart-chromium.sh") || \
  (crontab -l 2>/dev/null; echo "$CRON_RESTART") | crontab -

# ── 5. Rendre les scripts exécutables ───────────────────────────────────────
chmod +x "$INSTALL_DIR/start-kiosk.sh"
chmod +x "$INSTALL_DIR/restart-chromium.sh"

log ""
log "✔ Installation terminée."
log "  Redémarre le tableau pour lancer le kiosk automatiquement."
log "  Ou lance manuellement : $INSTALL_DIR/start-kiosk.sh"
