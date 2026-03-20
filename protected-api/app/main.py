"""FastAPI downstream API protected by auth-service-sdk."""

from __future__ import annotations

import sys
from pathlib import Path

from app.config import get_settings


def _ensure_local_sdk_importable() -> None:
    """Add the sibling authSDK repository root to sys.path for local development."""
    settings = get_settings()
    repo_root = settings.resolved_authsdk_repo_path()
    if not (repo_root / "sdk" / "__init__.py").exists():
        return
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)

from fastapi import FastAPI, Request

_ensure_local_sdk_importable()

from sdk import JWTAuthMiddleware


class SampleJWTAuthMiddleware(JWTAuthMiddleware):
    """Allow public health checks while protecting application routes."""

    async def dispatch(self, request: Request, call_next):
        """Skip auth for the health endpoint only."""
        if request.url.path == "/healthz":
            return await call_next(request)
        return await super().dispatch(request, call_next)

settings = get_settings()

app = FastAPI(title="authSDK sample protected API")
app.add_middleware(
    SampleJWTAuthMiddleware,
    auth_base_url=str(settings.auth_service_url),
    expected_audience=settings.expected_audience,
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Basic health endpoint."""
    return {"status": "ok"}


@app.get("/me")
async def me(request: Request) -> dict[str, object]:
    """Return the trusted user identity injected by the SDK."""
    return dict(request.state.user)


@app.get("/demo")
async def demo(request: Request) -> dict[str, object]:
    """Return one personalized response from the protected API."""
    user = dict(request.state.user)
    return {
        "message": f"Token accepted by the SDK for {user['email']}.",
        "audience": settings.expected_audience,
        "user": user,
    }
