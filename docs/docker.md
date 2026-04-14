# Docker Guide

This sample now runs as one self-contained Docker Compose stack.

What changed:

- auth-service is pulled directly from GHCR as
  `ghcr.io/chintakjoshi/auth-service:v1.4.3`
- the frontend container proxies `/_auth/*` to the in-stack `auth-service`
  container
- the protected API container talks to the same in-stack `auth-service`
  container for session validation
- the stack also starts Postgres, Redis, and Mailhog locally

You no longer need a sibling `../authSDK` checkout just to run this sample.

## Build and Run

From the root of this repository:

```powershell
docker compose up --build
```

Compose will:

- pull the published auth-service image from GHCR
- build the local `frontend` image
- build the local `protected-api` image

The sample app will be available at:

- frontend app origin: `http://127.0.0.1:5173`
- auth service: `http://127.0.0.1:8000`
- protected API debug port: `http://127.0.0.1:8200`
- Mailhog: `http://127.0.0.1:8025`

## Runtime Notes

- The frontend container proxies auth traffic to `http://auth-service:8000`.
- The protected API container validates browser-session cookies against
  `http://auth-service:8000`.
- Browser-session cookies are still set by auth-service, not by this repo's
  frontend or protected API containers.
- The auth-service startup command runs `alembic upgrade head` before launching
  Uvicorn, mirroring the upstream local Docker flow.

## SDK Source

The protected API no longer copies `../authSDK/sdk` into its image build.
Instead:

- Docker installs `auth-service-sdk` from the public GitHub repository at tag
  `v1.4.3`
- local `uv sync` does the same through `protected-api/pyproject.toml`

## Optional Overrides

The compose file includes defaults for local development. If you want to
override them, create a repo-root `.env` file and set values such as:

- `AUTH_SERVICE_IMAGE`
- `APP__PORT`
- `POSTGRES_PASSWORD`
- `MAILHOG_HTTP_PORT`
- `MAILHOG_SMTP_PORT`

The default auth-service image is pinned to:

- `ghcr.io/chintakjoshi/auth-service:v1.4.3`
