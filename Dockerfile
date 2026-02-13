# FaaS Gateway - Pure Nginx with token authentication
FROM nginx:alpine

LABEL faas.gateway="true"

# Copy nginx config template
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

# Default to empty token (open mode)
ENV FAAS_AUTH_TOKEN=""

CMD ["/start.sh"]