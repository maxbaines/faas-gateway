# FaaS Gateway - Nginx + Bun orchestrator
FROM oven/bun:alpine AS orchestrator

WORKDIR /app
COPY orchestrator/package.json ./
RUN bun install --production
COPY orchestrator/index.ts ./index.ts

FROM nginx:alpine

LABEL faas.gateway="true"

# Copy bun runtime from builder
COPY --from=orchestrator /usr/local/bin/bun /usr/local/bin/bun

# Copy orchestrator app
COPY --from=orchestrator /app /opt/orchestrator

# Copy nginx config template
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

# Default to empty token (open mode) + S3 defaults
ENV FAAS_AUTH_TOKEN=""
ENV S3_ENDPOINT=""
ENV S3_BUCKET=""
ENV S3_REGION="us-east-1"
ENV S3_ACCESS_KEY=""
ENV S3_SECRET_KEY=""

CMD ["/start.sh"]