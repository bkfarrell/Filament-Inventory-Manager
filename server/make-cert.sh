#!/bin/bash
# Creates the HTTPS certificate Track My Filament uses on your home network, so phones can
# use the camera (browsers only allow it on secure https:// pages).
#
# It makes a small certificate authority ("Track My Filament Home CA") that is only allowed
# to vouch for local names (*.local, localhost) and private home-network addresses, and uses
# it to sign a certificate for this computer. Install the CA once on each phone/computer
# (see the README) and the site shows as secure.
#
#   ./server/make-cert.sh            create (keeps an existing CA, renews this computer's cert)
#   DATA_DIR=/path ./server/make-cert.sh
set -euo pipefail

cd "$(dirname "$0")/.."
DATA_DIR="${DATA_DIR:-$(pwd)/data}"
TLS="$DATA_DIR/tls"
mkdir -p "$TLS"
chmod 700 "$TLS"
command -v openssl >/dev/null || { echo "openssl is required."; exit 1; }

# This computer's local name and current network addresses.
if command -v scutil >/dev/null; then
  NAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
else
  NAME="$(hostname -s)"
fi
IPS=()
if command -v ipconfig >/dev/null && [[ "$(uname)" == "Darwin" ]]; then
  for i in en0 en1 en2 en3 en4 en5 en6 en7 en8; do
    ip="$(ipconfig getifaddr "$i" 2>/dev/null || true)"
    [[ -n "$ip" ]] && IPS+=("$ip")
  done
else
  for ip in $(hostname -I 2>/dev/null || true); do [[ "$ip" == *.* ]] && IPS+=("$ip"); done
fi

# Only private home-network addresses (the CA isn't allowed to vouch for anything else).
is_private() {
  [[ "$1" =~ ^10\. || "$1" =~ ^192\.168\. || "$1" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]]
}
SAN="DNS:localhost,DNS:${NAME}.local,IP:127.0.0.1"
for ip in "${IPS[@]+"${IPS[@]}"}"; do is_private "$ip" && SAN="$SAN,IP:$ip"; done

# 1. The home CA (created once, then reused so devices only need to trust it once).
if [[ ! -f "$TLS/ca.key" || ! -f "$TLS/ca.crt" ]]; then
  cat > "$TLS/ca.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ca_ext
prompt = no
[dn]
CN = Track My Filament Home CA
O = Track My Filament
[ca_ext]
basicConstraints = critical, CA:true, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
# Only valid for local names and private home-network addresses.
nameConstraints = critical, permitted;DNS:localhost, permitted;DNS:.local, permitted;DNS:local, permitted;IP:127.0.0.0/255.0.0.0, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0, permitted;IP:192.168.0.0/255.255.0.0
EOF
  openssl req -x509 -new -newkey rsa:3072 -nodes -sha256 -days 3650 \
    -keyout "$TLS/ca.key" -out "$TLS/ca.crt" -config "$TLS/ca.cnf" 2>/dev/null
  chmod 600 "$TLS/ca.key"
  echo "Created the Track My Filament Home CA: $TLS/ca.crt"
fi

# 2. This computer's certificate (renewed each time; 825 days is the most Apple accepts).
cat > "$TLS/server.cnf" <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = ${NAME}.local
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${SAN}
EOF
openssl req -new -newkey rsa:2048 -nodes -keyout "$TLS/server.key" -out "$TLS/server.csr" \
  -config "$TLS/server.cnf" 2>/dev/null
openssl x509 -req -in "$TLS/server.csr" -CA "$TLS/ca.crt" -CAkey "$TLS/ca.key" -CAcreateserial \
  -out "$TLS/server.crt" -days 825 -sha256 -extfile "$TLS/server.cnf" -extensions ext 2>/dev/null
chmod 600 "$TLS/server.key"
rm -f "$TLS/server.csr"
echo "Certificate for: ${SAN//DNS:/}" | sed 's/IP://g'
