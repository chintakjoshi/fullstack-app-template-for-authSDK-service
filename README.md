# authSDK Full-Stack Sample Template

This template now demonstrates the browser-session integration model for the
sibling `authSDK` service:

- `frontend/`: React + TypeScript + Tailwind UI served on one browser origin
- `protected-api/`: FastAPI downstream API protected by `auth-service-sdk`
- `compose.yml`: Docker Compose stack for the frontend and protected API
- `backend/`: legacy token-mode BFF reference kept in the repo, but no longer
  used in the primary browser-session flow

The browser now talks to one app origin only:

- `/_auth/*` is proxied to `authSDK`
- `/api/*` is proxied to `protected-api`

`authSDK` owns the `HttpOnly` access and refresh cookies. The frontend reads
only the CSRF cookie, and the downstream API trusts the auth service through
the SDK with cookie extraction enabled.

![Sample interface](docs/interface.png)

## Flows Covered

- email/password signup
- email/password login with browser-session cookies
- login OTP verification and resend
- refresh rotation through `POST /_auth/token`
- logout
- resend email verification before or after login
- enable login OTP
- one SDK-protected downstream route

Google OAuth is intentionally not included in this first version.

## Browser-Session Topology

```text
Browser
  |
  +--> http://127.0.0.1:5173/_auth/*  -> proxied to authSDK
  |
  +--> http://127.0.0.1:5173/api/*    -> proxied to protected-api
```

The browser never stores tokens in JavaScript-managed storage. `authSDK`
sets the access and refresh cookies itself, and the frontend attaches the
double-submit CSRF token on unsafe requests.

## Prerequisites

- the sibling `authSDK` service repo available at `../authSDK`
- Docker running for the auth service stack
- Python 3.11+
- Node.js 18+
- `uv`

## 1. Start authSDK

From the `authSDK` repo:

```powershell
cd ..\authSDK
Copy-Item .env-sample .env
docker compose -f docker\docker-compose.yml up --build
```

The current `authSDK/.env-sample` already enables browser sessions with the
local HTTP cookie baseline:

- `auth_access`
- `auth_refresh`
- `auth_csrf`
- refresh-cookie path `/_auth`

Useful local URLs:

- auth service: `http://127.0.0.1:8000`
- auth docs: `http://127.0.0.1:8000/docs`
- Mailhog: `http://127.0.0.1:8025`

## 2. Run the Protected API

```powershell
cd .\protected-api
Copy-Item .env.example .env
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8200
```

## 3. Run the Frontend

```powershell
cd .\frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend URL:

- `http://127.0.0.1:5173`

## How the Sample Works

1. The frontend bootstraps CSRF from `GET /_auth/csrf`.
2. Login and OTP verification go to `/_auth/*` with `credentials: "include"`.
3. `authSDK` sets the access and refresh cookies on the frontend origin.
4. The frontend calls `/api/me` and `/api/demo` through the same origin.
5. `protected-api` accepts the cookie-authenticated request and validates the
   session with `auth-service-sdk`.

Because the browser stays on one origin, this sample does not need frontend
code that stores or forwards raw access or refresh tokens.

## OTP + Mailhog Notes

- OTP emails and verification emails land in Mailhog.
- Use Mailhog to inspect the verification link and OTP codes.
- Password login is blocked until the account email has been verified.
- If you want to enable login OTP, verify the email address first.
- The sample UI can resend the verification email even before the first login.
- The default authSDK local email links still point at the auth service on
  port `8000`, which is fine for this sample.

## Docker Run

This repository now containerizes:

- `frontend`
- `protected-api`

The Docker flow assumes:

- the `authSDK` repo is checked out next to this repository
- the `authSDK` stack is already running and publishing `http://127.0.0.1:8000`

To build and run the sample app containers:

```powershell
docker compose build
docker compose up
```

Containerized app URLs:

- frontend app origin: `http://127.0.0.1:5173`
- protected API debug port: `http://127.0.0.1:8200`

The frontend container proxies:

- `/_auth/*` -> `host.docker.internal:8000/auth/*`
- `/api/*` -> `protected-api:8200/*`

More detail: [docs/docker.md](docs/docker.md)

## Environment Files

- [frontend/.env.example](frontend/.env.example)
- [protected-api/.env.example](protected-api/.env.example)
- [backend/.env.example](backend/.env.example)

## No Sample Database

This template does not add its own Postgres database. The auth state stays in
the central auth service, which already owns Postgres and Redis.
