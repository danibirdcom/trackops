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
# Stamp a unique build version into the service worker so each deploy
# invalidates the previous cache on activate.
BUILD_VERSION="$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 3)"
if [ -f "$WWW_ROOT/sw.js" ]; then
  sudo sed -i "s|__TRACKOPS_BUILD__|$BUILD_VERSION|g" "$WWW_ROOT/sw.js"
fi
sudo chown -R www-data:www-data "$WWW_ROOT"

log "6/7 sync server + systemd unit"
sudo mkdir -p "$DATA_DIR"
sudo rsync -a --delete "$REPO_DIR/server/" "$SERVER_DIR/"
sudo chown -R trackops:trackops "$SERVER_DIR" "$DATA_DIR"

sudo cp "$REPO_DIR/deploy/trackops-sync.service" "$SYNC_UNIT"
sudo mkdir -p /etc/trackops
if [ ! -f /etc/trackops/env ]; then
  sudo tee /etc/trackops/env > /dev/null <<'ENVEOF'
# Opcional: API key de Google Gemini para generar los briefings del voluntario.
# Regístrate en https://aistudio.google.com/app/apikey y descomenta la línea:
# GEMINI_API_KEY=tu-clave-aqui
# GEMINI_MODEL=gemini-2.0-flash
ENVEOF
  sudo chmod 600 /etc/trackops/env
fi
sudo systemctl daemon-reload
sudo systemctl enable trackops-sync >/dev/null
sudo systemctl restart trackops-sync
sleep 1
sudo systemctl status trackops-sync --no-pager | head -6 || true

log "7/7 nginx config"
NGINX_DST="/etc/nginx/sites-available/trackops"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt

if sudo test -f "$CERT_DIR/fullchain.pem"; then
  log "cert found, installing HTTP+HTTPS config"
  sudo cp "$REPO_DIR/deploy/nginx.conf.example" "$NGINX_DST"
  sudo sed -i "s/EXAMPLE_DOMAIN/$DOMAIN/g" "$NGINX_DST"
else
  log "no cert yet, installing HTTP-only config (serves ACME challenges)"
  sudo tee "$NGINX_DST" > /dev/null <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 503 "TrackOps: HTTPS not provisioned yet. Run certbot --webroot -w /var/www/letsencrypt -d $DOMAIN";
        add_header Content-Type text/plain;
    }
}
CONF
fi

sudo ln -sf "$NGINX_DST" /etc/nginx/sites-enabled/trackops
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

log "done"
echo
echo "=========================================================="
if sudo test -f "$CERT_DIR/fullchain.pem"; then
  echo " HTTPS activo en https://$DOMAIN"
else
  echo " Ahora emite el certificado con certbot en modo webroot"
  echo " (no uses --nginx, corrompe el config):"
  echo
  echo "   sudo apt install -y certbot"
  echo "   sudo certbot certonly --webroot -w /var/www/letsencrypt \\"
  echo "       -d $DOMAIN --agree-tos -m dani@birdcom.es -n"
  echo
  echo " Después vuelve a ejecutar este install.sh para activar HTTPS."
fi
echo " Auth: contraseña por proyecto (se define al crear cada proyecto)."
echo " IA: edita /etc/trackops/env y define GEMINI_API_KEY para activar"
echo "     los briefings generados por Gemini en la vista de voluntario."
echo "     Tras editar: sudo systemctl restart trackops-sync"
echo "=========================================================="
