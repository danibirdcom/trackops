# Despliegue de TrackOps en AWS EC2

Guía paso a paso para publicar TrackOps en un dominio propio usando una única instancia EC2 con Nginx + Node. Cubre la SPA estática, el backend de sincronización, HTTPS y arranque automático.

## Arquitectura

```
Internet ──► CloudFront (opcional) ──► EC2 ──► Nginx :443
                                              ├── dist/ (estáticos)
                                              └── /api/* ──► Node :8787 (sync server)
```

- Todo va en una sola EC2. t3.micro vale para arrancar.
- HTTPS obligatorio: el service worker no se registra en HTTP.
- El sync server escucha solo en 127.0.0.1. Nginx hace reverse proxy.

---

## 0. Prerrequisitos

- Cuenta AWS con un par de claves SSH creado en la región elegida.
- Dominio registrado (Route 53, Namecheap, lo que sea).
- El repo disponible en git (GitHub, GitLab…) o vía `scp`.

---

## 1. Crear la instancia EC2

1. **EC2 → Launch instance**.
2. Nombre: `trackops-prod`.
3. AMI: **Ubuntu Server 22.04 LTS** (64 bits, x86).
4. Tipo: **t3.micro** (free tier) o **t3.small** si esperas carga.
5. Key pair: selecciona el tuyo.
6. **Network settings → Edit**:
   - Allow SSH (22) — limita a tu IP si puedes.
   - Allow HTTP (80) — todo internet.
   - Allow HTTPS (443) — todo internet.
   - NO abras el 8787; el sync server vive solo detrás de Nginx.
7. Storage: 20 GB gp3 está bien.
8. Launch instance.

## 2. Elastic IP + DNS

1. **EC2 → Elastic IPs → Allocate** (gratis mientras esté asociada).
2. Associate a la instancia recién creada.
3. En tu DNS, crea un registro **A**:
   - `trackops.tu-dominio.com` → IP elástica.
   - (opcional) CNAME de `www` al dominio principal.
4. Espera a que propague (`dig trackops.tu-dominio.com +short`).

## 3. Primera conexión SSH

```bash
ssh -i ~/ruta/mi-key.pem ubuntu@IP_ELASTICA
```

Actualiza todo y crea un usuario dedicado para la app:

```bash
sudo apt update && sudo apt upgrade -y
sudo adduser --system --group --home /opt/trackops --shell /bin/bash trackops
```

## 4. Instalar dependencias

Node 20 LTS desde el repositorio oficial de NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git ufw
node --version   # v20.x
```

Firewall a nivel SO (cinturón + tirantes del SG de AWS):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

## 5. Traer el código

```bash
sudo mkdir -p /opt/trackops
sudo chown -R $USER:$USER /opt/trackops
cd /opt/trackops
git clone https://github.com/TU_USUARIO/TU_REPO.git repo
cd repo
```

## 6. Build de la SPA

```bash
cd /opt/trackops/repo
npm ci
npm run build
```

Al terminar tienes `dist/` con los estáticos y `dist/sw.js`.

```bash
sudo mkdir -p /var/www/trackops
sudo cp -r dist/* /var/www/trackops/
sudo chown -R www-data:www-data /var/www/trackops
```

## 7. Backend de sincronización

Copia la carpeta `server/` a su ubicación definitiva y prepara el directorio de datos:

```bash
sudo cp -r /opt/trackops/repo/server /opt/trackops/server
sudo mkdir -p /opt/trackops/data
sudo chown -R trackops:trackops /opt/trackops/server /opt/trackops/data
```

### systemd unit

```bash
sudo cp /opt/trackops/repo/deploy/trackops-sync.service /etc/systemd/system/
sudoedit /etc/systemd/system/trackops-sync.service
# Cambia TRACKOPS_TOKEN por algo aleatorio y guarda
```

Arranca y habilita al boot:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trackops-sync
sudo systemctl status trackops-sync
curl http://127.0.0.1:8787/api/projects   # debe devolver []
```

## 8. Configurar Nginx

```bash
sudo cp /opt/trackops/repo/deploy/nginx.conf.example \
        /etc/nginx/sites-available/trackops
sudo sed -i 's/EXAMPLE_DOMAIN/trackops.tu-dominio.com/g' \
        /etc/nginx/sites-available/trackops

# Crear el directorio para los desafíos ACME
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt

# Activar el sitio y desactivar el default
sudo ln -sf /etc/nginx/sites-available/trackops /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

Todavía fallará al recargar porque los certificados no existen. Temporalmente comenta las líneas `ssl_certificate*` y el bloque `listen 443`. Recarga y comprueba que el HTTP 80 sirve el challenge dir:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 9. HTTPS con Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
    -d trackops.tu-dominio.com -d www.trackops.tu-dominio.com \
    --redirect --agree-tos -m tu@email.com
```

Certbot edita la conf para añadir los `ssl_certificate*` correctos. Después descomenta el bloque 443 si lo habías comentado, guarda, y:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Comprueba renovación automática:

```bash
sudo certbot renew --dry-run
```

## 10. Verificar

- `https://trackops.tu-dominio.com` carga la app.
- DevTools → Application → Service Workers: registrado.
- Crea un proyecto. Importa un KML.
- En el header, botón nube → endpoint `https://trackops.tu-dominio.com` + el token que pusiste. Push/pull deberían funcionar.
- SSE: abre dos pestañas con el mismo proyecto, edita en una y mira si la otra refleja el cambio (debería).

## 11. Redeploy (después de cambios en el código)

Una sola línea desde tu máquina (si el remoto tiene el repo actualizado):

```bash
ssh ubuntu@trackops.tu-dominio.com '
  set -e
  cd /opt/trackops/repo
  git pull
  npm ci
  npm run build
  sudo rsync -a --delete dist/ /var/www/trackops/
  sudo systemctl restart trackops-sync    # solo si tocaste server/
'
```

No hace falta reiniciar Nginx para cambios puramente de `dist/`.

## 12. Extras recomendados

- **CloudFront** delante para caché global + DDoS protection (opcional).
- **Amazon S3** para backup del `data/` (cron diario con `aws s3 sync`).
- **CloudWatch logs** del `journalctl -u trackops-sync` vía agente.
- **Snapshots EBS** automáticos de la instancia.
- **Fail2ban** para SSH si dejas 22 abierto a todo internet.

## Solución a problemas comunes

| Síntoma | Causa típica |
|---|---|
| SW no se registra | Estás en HTTP. Fuerza HTTPS con certbot `--redirect`. |
| 404 al refrescar en rutas internas | Falta `try_files $uri /index.html` en Nginx. |
| SSE corta a los 60 s | Falta `proxy_read_timeout 24h` y `proxy_buffering off`. |
| `413 Request Entity Too Large` al pushear | Sube `client_max_body_size` en Nginx. |
| Tiles OSM dan 403 | Nominatim/OSM bloquean por abuso. Cambia a MapTiler o Thunderforest. |
