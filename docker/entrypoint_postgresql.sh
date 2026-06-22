#!/bin/sh

cp -f "${PATH_ROOT}certificate/tls."* "/var/lib/postgresql/"
chown postgres:postgres "/var/lib/postgresql/tls."*
chmod 0600 "/var/lib/postgresql/tls.key"

exec docker-entrypoint.sh \
-c ssl=on \
-c ssl_cert_file="/var/lib/postgresql/tls.crt" \
-c ssl_key_file="/var/lib/postgresql/tls.key"
