# FaaS Gateway

A lightweight API gateway for your FaaS functions with token authentication.
Uses pure nginx - no additional dependencies.

## Quick Start

```bash
# Create the Docker network
docker network create faas-network

# Build the gateway
docker build -t faas-gateway .

# Run with authentication
docker run -d \
  --name faas-gateway \
  --network faas-network \
  -p 8080:8080 \
  -e FAAS_AUTH_TOKEN=your-secret-token \
  faas-gateway

# Or run in open mode (no auth)
docker run -d \
  --name faas-gateway \
  --network faas-network \
  -p 8080:8080 \
  faas-gateway
```

## Usage

Call your functions through the gateway:

```bash
# With authentication
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:8080/my-function-name

# The path after the function name is forwarded
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:8080/my-function-name/api/users

# Health check (no auth required)
curl http://localhost:8080/health
```

## Deploying Functions

Make sure your function containers:
1. Are on the `faas-network` Docker network
2. Have a container name matching the URL path

```bash
# Example: Deploy a function named "hello"
docker run -d \
  --name hello \
  --network faas-network \
  --label faas.fn=true \
  my-hello-function:latest

# Call it through the gateway
curl -H "Authorization: Bearer token" http://localhost:8080/hello
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FAAS_AUTH_TOKEN` | Bearer token for authentication. If empty, gateway runs in open mode. | (empty) |

## How It Works

1. Requests come in to `http://gateway:8080/<container-name>/path`
2. If `FAAS_AUTH_TOKEN` is set, validates `Authorization: Bearer <token>` header
3. Proxies request to `http://<container-name>:8080/path` on the Docker network
4. Returns response from the function container

## Production Deployment

Deploy the gateway as a Docker container on your server. For HTTPS and domain management,
use `faas proxy init` to set up a Caddy reverse proxy in front of the gateway.

```bash
# On your server
docker network create faas-network
docker build -t faas-gateway .
docker run -d \
  --name faas-gateway \
  --network faas-network \
  -p 8080:8080 \
  -e FAAS_AUTH_TOKEN=your-secret-token \
  --restart unless-stopped \
  faas-gateway
```

Or use docker-compose:

```bash
# Set your token
export FAAS_AUTH_TOKEN=your-secret-token

# Create network and start
docker network create faas-network
docker compose up -d
```