#!/usr/bin/env sh
# Generate a self-signed TLS certificate for local/staging use.
# For production: replace ssl/analy.crt + ssl/analy.key with a real cert
# (e.g. from Let's Encrypt via certbot).
set -e

DIR="$(cd "$(dirname "$0")" && pwd)/ssl"
mkdir -p "$DIR"

openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "$DIR/analy.key" \
  -out "$DIR/analy.crt" \
  -sha256 \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=Dev/L=Dev/O=Analy/OU=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Self-signed cert written to $DIR/"
echo "  Certificate: $DIR/analy.crt"
echo "  Private key: $DIR/analy.key"
echo ""
echo "For production, replace these files with a cert from Let's Encrypt:"
echo "  certbot certonly --webroot -w /var/www/certbot -d yourdomain.com"
