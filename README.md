# authSDK Full-Stack Sample Template

This template shows a production-aligned way to consume the sibling `authSDK`
service:

- `frontend/`: React + TypeScript + Tailwind UI
- `backend/`: FastAPI backend-for-frontend (BFF)
- `protected-api/`: FastAPI downstream API protected by `auth-service-sdk`
- `compose.yml`: Docker Compose stack for the sample app services

The browser talks only to the BFF. The BFF talks to `authSDK` and stores the
issued access/refresh tokens in `HttpOnly` cookies. The downstream API trusts
the auth service through the SDK and enforces the token audience locally.

![Sample interface](docs/interface.png)

## Flows Covered

- email/password signup
- email/password login
- login OTP verification and resend
- refresh rotation handled by the BFF
- logout
- resend email verification before or after login
- enable login OTP
- one SDK-protected downstream route

Google OAuth is intentionally not included in this first version.

## Repository Layout

```text
fullstack-app-template-for-authSDK-service/
  backend/
  frontend/
  protected-api/
```

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

## 3. Run the BFF

```powershell
cd .\backend
Copy-Item .env.example .env
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

## 4. Run the Frontend

```powershell
cd .\frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend URL:

- `http://127.0.0.1:5173`

## Docker Run

This repository now includes Dockerfiles for:

- `frontend`
- `backend`
- `protected-api`

Because this sample still depends on the sibling `../authSDK` repository, the
Docker flow assumes:

- the `authSDK` repo is checked out next to this repository
- the `authSDK` stack is already running and publishing `http://127.0.0.1:8000`

To build and run the sample app containers:

```powershell
docker compose build
docker compose up
```

Containerized app URLs:

- frontend: `http://127.0.0.1:5173`
- backend BFF: `http://127.0.0.1:8100`
- protected API: `http://127.0.0.1:8200`

More detail: [docs/docker.md](/c:/Users/chint/Desktop/fullstack-app-template-for-authSDK-service/docs/docker.md)

## How the Sample Works

1. The frontend calls the BFF on `http://127.0.0.1:8100`.
2. The BFF calls `authSDK` for signup, login, verification-email resend, OTP
   verification, refresh, and logout.
3. The BFF stores auth tokens in `HttpOnly` cookies.
4. The BFF forwards the access token to `protected-api`.
5. `protected-api` validates that token with `auth-service-sdk` using audience
   `sample-protected-api`.

Because the browser never calls the auth service directly, the auth service
does not need CORS for this sample.

## OTP + Mailhog Notes

- OTP emails and verification emails land in Mailhog.
- Use Mailhog to inspect the verification link and OTP codes.
- Password login is blocked until the account email has been verified.
- If you want to enable login OTP, verify the email address first.
- The sample UI can resend the verification email even before the first login.

## Environment Files

- [backend/.env.example](/c:/Users/chint/Desktop/fullstack-app-template-for-authSDK-service/backend/.env.example)
- [protected-api/.env.example](/c:/Users/chint/Desktop/fullstack-app-template-for-authSDK-service/protected-api/.env.example)
- [frontend/.env.example](/c:/Users/chint/Desktop/fullstack-app-template-for-authSDK-service/frontend/.env.example)

## GitHub Push Hygiene

This repo now ignores common local-only files so you can push cleanly:

- `frontend/node_modules/`
- `frontend/dist/`
- service `.env` files
- service `.venv/` folders
- TypeScript build info files

Keep the `.env.example` files in git and leave real `.env` values local only.

## No Sample Database

This template does not add its own Postgres database. The auth state stays in
the central auth service, which already owns Postgres and Redis.
