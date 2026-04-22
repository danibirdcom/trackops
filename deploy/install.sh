#!/usr/bin/env bash
# TrackOps — provisioning script for Ubuntu 22.04/24.04 EC2.
# Idempotent: safe to re-run. Only covers HTTP + sync server + static build.
# Certbot (HTTPS) is done manually after DNS is pointing to the instance.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/danibirdcom/trackops.git}"
DOMAIN="${DOMAIN:-staff.kdrtrail.com}"
APP_ROOT="/opt/trackops"
REPO_DIR="$APP_ROOT/repo"
DATA_DIR="$APP_ROOT/data"
SERVER_DIR="$APP_ROOT/server"
WWW_ROOT="/var/www/trackops"
SYNC_UNIT="/etc/systemd/system/trackops-sync.service"

log() { printf "\n\033[1;34m[trackops]\033[0m %s\n" "$*"; }

log "1/7 apt install (node 20, nginx, git, ufw, rsync)"
sudo apt update -y
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
fi
sudo apt install -y nodejs nginx git ufw rsync openssl

log "2/7 firewall"
sudo ufw allow OpenSSH >/dev/null || true
sudo ufw allow 'Nginx Full' >/dev/null || true
sudo ufw --force enable >/dev/null || true

log "3/7 dedicated user + clone/pull repo"
if ! id trackops >/dev/null 2>&1; then
  sudo adduser --system --group --home "$APP_ROOT" --shell /bin/bash trackops
fi
sudo mkdir -p "$APP_ROOT"
sudo chown -R "$USER":"$USER" "$APP_ROOT"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$REPO_DIR"
fi

log "4/7 build SPA"
cd "$REPO_DIR"
npm ci
npm run build

log "5/7 deploy static files to $WWW_ROOT"
sudo mkdir -p "$WWW_ROOT"
sudo rsync -a --delete "$REPO_DIR/dist/" "$WWW_ROOT/"
sudo chown -R www-data:www-data "$WWW_ROOT"

log "6/7 sync server + systemd unit"
sudo mkdir -p "$DATA_DIR"
sudo rsync -a --delete "$REPO_DIR/server/" "$SERVER_DIR/"
sudo chown -R trackops:trackops "$SERVER_DIR" "$DATA_DIR"

if [ ! -f "$SYNC_UNIT" ]; then
  SYNC_TOKEN="$(openssl rand -hex 24)"
  sudo cp "$REPO_DIR/deploy/trackops-sync.service" "$SYNC_UNIT"
  sudo sed -i "s|cambiame-por-un-token-largo-aleatorio|$SYNC_TOKEN|" "$SYNC_UNIT"
  echo "GENERATED_TOKEN=$SYNC_TOKEN" | sudo tee "$APP_ROOT/sync-token.txt" >/dev/null
  sudo chmod 600 "$APP_ROOT/sync-token.txt"
fi
sudo systemctl daemon-reload
sudo systemctl enable --now trackops-sync
sleep 1
sudo systemctl status trackops-sync --no-pager | head -6 || true

log "7/7 nginx http-only config (certbot runs later)"
NGINX_SRC="$REPO_DIR/deploy/nginx.conf.example"
NGINX_DST="/etc/nginx/sites-available/trackops"
sudo cp "$NGINX_SRC" "$NGINX_DST"
sudo sed -i "s/EXAMPLE_DOMAIN/$DOMAIN/g" "$NGINX_DST"
# Strip the HTTPS server block until certbot installs the cert
sudo python3 - "$NGINX_DST" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()
# Remove the second server block (listen 443)
import re
pattern = re.compile(r"\nserver\s*\{[^{}]*listen 443[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*", re.S)
new = pattern.sub("\n", src, count=1)
p.write_text(new)
PY
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt
sudo ln -sf "$NGINX_DST" /etc/nginx/sites-enabled/trackops
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

log "done"
echo
echo "=========================================================="
echo " Next step: point $DOMAIN -> this instance's public IP."
echo " Then run certbot:"
echo
echo "   sudo apt install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d $DOMAIN --redirect --agree-tos -m dani@birdcom.es"
echo
echo " Sync token saved to $APP_ROOT/sync-token.txt (readable by root)."
echo "=========================================================="
