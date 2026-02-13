#!/bin/sh
set -e

# Compute auth enabled flag (always "0" or "1", never empty)
if [ -z "$FAAS_AUTH_TOKEN" ]; then
    export FAAS_AUTH_ENABLED=0
    echo "FaaS Gateway starting in OPEN mode (no authentication)"
else
    export FAAS_AUTH_ENABLED=1
    echo "FaaS Gateway starting with token authentication enabled"
fi

# Substitute environment variables into nginx config
# Only substitute these two to avoid breaking nginx variables like $host, $remote_addr etc.
envsubst '${FAAS_AUTH_TOKEN} ${FAAS_AUTH_ENABLED}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx
exec nginx -g 'daemon off;'