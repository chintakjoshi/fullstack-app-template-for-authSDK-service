"""FastAPI downstream API protected by auth-service-sdk."""

from __future__ import annotations

from app.config import get_settings

from fastapi import FastAPI, Request

from sdk import CookieCSRFMiddleware, JWTAuthMiddleware


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
    CookieCSRFMiddleware,
    csrf_cookie_name=settings.csrf_cookie_name,
    csrf_header_name=settings.csrf_header_name,
    access_cookie_name=settings.access_cookie_name,
)
app.add_middleware(
    SampleJWTAuthMiddleware,
    auth_base_url=str(settings.auth_service_url),
    expected_audience=settings.expected_audience,
    token_sources=["authorization", "cookie"],
    access_cookie_name=settings.access_cookie_name,
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
