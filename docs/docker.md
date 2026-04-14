# Docker Guide

This sample now uses the browser-session architecture:

- the frontend container serves the browser-facing app origin
- `/_auth/*` is proxied from the frontend container to the running sibling
  `authSDK` service on `host.docker.internal:8000`
- `/api/*` is proxied from the frontend container to the `protected-api`
  container

The sample still depends on the sibling `../authSDK` repository for:

- the running auth service stack on `http://127.0.0.1:8000`
- the local `sdk/` source copied into the protected API image build

## Prerequisites

1. Check out `authSDK` next to this repository.
2. Start the auth service stack from `../authSDK`.
3. Confirm Docker Desktop or Docker Engine with Compose is available.

## Build and Run

From the root of this repository:

```powershell
docker compose build
docker compose up
```

The sample app will be available at:

- frontend app origin: `http://127.0.0.1:5173`
- protected API debug port: `http://127.0.0.1:8200`

## Notes

- The frontend container proxies auth traffic to `host.docker.internal:8000`.
- On Linux, the provided `extra_hosts` entry maps `host.docker.internal` to the
  Docker host gateway.
- The protected API build uses Docker `additional_contexts` to copy the sibling
  `../authSDK/sdk` package into the image.
- Browser-session cookies are set by `authSDK`, not by this repo’s containers.
