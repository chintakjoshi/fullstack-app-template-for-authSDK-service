"""FastAPI BFF for the authSDK sample template."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth_service import SampleAuthClient, TokenPair, UpstreamServiceError
from app.config import Settings, get_settings
from app.schemas import (
    AuthenticatedPayload,
    ErrorResponse,
    LoginOTPChallengePayload,
    LoginRequest,
    OTPEnabledResponse,
    ProtectedDemoResponse,
    ReauthRequest,
    RequestVerifyEmailResendRequest,
    ResendLoginOTPRequest,
    SessionResponse,
    SignupRequest,
    VerifyLoginOTPRequest,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create and close shared HTTP clients."""
    settings = get_settings()
    app.state.auth_client = SampleAuthClient(settings)
    yield
    await app.state.auth_client.aclose()


app = FastAPI(title="authSDK sample BFF", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(settings.frontend_origin).rstrip("/")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_auth_client(request: Request) -> SampleAuthClient:
    """Return the shared auth client."""
    return request.app.state.auth_client  # type: ignore[return-value]


def _cookie_kwargs(settings: Settings) -> dict[str, Any]:
    """Return shared cookie options."""
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain or None,
        "path": "/",
    }


def _set_session_cookies(response: Response, settings: Settings, tokens: TokenPair) -> None:
    """Persist auth-service tokens in HttpOnly cookies."""
    cookie_options = _cookie_kwargs(settings)
    response.set_cookie(
        settings.cookie_access_name,
        tokens.access_token,
        max_age=settings.access_cookie_max_age_seconds,
        **cookie_options,
    )
    response.set_cookie(
        settings.cookie_refresh_name,
        tokens.refresh_token,
        max_age=settings.refresh_cookie_max_age_seconds,
        **cookie_options,
    )


def _set_access_cookie(response: Response, settings: Settings, access_token: str) -> None:
    """Refresh only the access-token cookie."""
    cookie_options = _cookie_kwargs(settings)
    response.set_cookie(
        settings.cookie_access_name,
        access_token,
        max_age=settings.access_cookie_max_age_seconds,
        **cookie_options,
    )


def _clear_session_cookies(response: Response, settings: Settings) -> None:
    """Clear auth cookies."""
    cookie_options = _cookie_kwargs(settings)
    response.delete_cookie(settings.cookie_access_name, **cookie_options)
    response.delete_cookie(settings.cookie_refresh_name, **cookie_options)


async def _refresh_from_request(
    request: Request,
    response: Response,
    auth_client: SampleAuthClient,
    settings: Settings,
) -> str | None:
    """Refresh the current session if a refresh cookie is available."""
    refresh_token = request.cookies.get(settings.cookie_refresh_name)
    if not refresh_token:
        _clear_session_cookies(response, settings)
        return None
    try:
        tokens = await auth_client.refresh(refresh_token)
    except UpstreamServiceError as exc:
        if exc.status_code != 401:
            raise
        _clear_session_cookies(response, settings)
        return None
    _set_session_cookies(response, settings, tokens)
    return tokens.access_token


async def _call_with_auto_refresh(
    request: Request,
    response: Response,
    operation,
    *,
    auth_client: SampleAuthClient,
    settings: Settings,
) -> dict[str, Any]:
    """Execute an access-token-backed call and refresh once on 401."""
    access_token = request.cookies.get(settings.cookie_access_name)
    if not access_token:
        raise UpstreamServiceError(401, "Not authenticated.", "not_authenticated")
    try:
        return await operation(access_token)
    except UpstreamServiceError as exc:
        if exc.status_code != 401:
            raise
    refreshed_access_token = await _refresh_from_request(request, response, auth_client, settings)
    if not refreshed_access_token:
        raise UpstreamServiceError(401, "Not authenticated.", "not_authenticated")
    return await operation(refreshed_access_token)


@app.exception_handler(UpstreamServiceError)
async def upstream_error_handler(_: Request, exc: UpstreamServiceError) -> JSONResponse:
    """Normalize upstream failures to the frontend contract."""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=exc.detail, code=exc.code).model_dump(),
    )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Basic health endpoint."""
    return {"status": "ok"}


@app.post("/api/auth/signup")
async def signup(
    payload: SignupRequest,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> dict[str, Any]:
    """Create a new password user."""
    return await auth_client.signup(email=payload.email, password=payload.password)


@app.post("/api/auth/login")
async def login(
    payload: LoginRequest,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> JSONResponse:
    """Login with email and password, or begin OTP login."""
    result = await auth_client.login(email=payload.email, password=payload.password)
    if result.get("otp_required") is True:
        body = LoginOTPChallengePayload(
            challenge_token=str(result["challenge_token"]),
            masked_email=str(result["masked_email"]),
        ).model_dump()
        return JSONResponse(status_code=200, content=body)

    tokens = TokenPair(
        access_token=str(result["access_token"]),
        refresh_token=str(result["refresh_token"]),
    )
    user = await auth_client.get_authenticated_user(tokens.access_token)
    response = JSONResponse(
        status_code=200,
        content=AuthenticatedPayload(user=user).model_dump(),
    )
    _set_session_cookies(response, settings, tokens)
    return response


@app.post("/api/auth/otp/verify-login")
async def verify_login_otp(
    payload: VerifyLoginOTPRequest,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> JSONResponse:
    """Complete login with the OTP code from Mailhog."""
    tokens = await auth_client.verify_login_otp(
        challenge_token=payload.challenge_token,
        code=payload.code,
    )
    user = await auth_client.get_authenticated_user(tokens.access_token)
    response = JSONResponse(
        status_code=200,
        content=AuthenticatedPayload(user=user).model_dump(),
    )
    _set_session_cookies(response, settings, tokens)
    return response


@app.post("/api/auth/otp/resend-login")
async def resend_login_otp(
    payload: ResendLoginOTPRequest,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> dict[str, Any]:
    """Resend the login OTP email."""
    return await auth_client.resend_login_otp(challenge_token=payload.challenge_token)


@app.get("/api/session")
async def session(
    request: Request,
    response: Response,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> SessionResponse:
    """Return the current authenticated user when a session exists."""
    try:
        user = await _call_with_auto_refresh(
            request,
            response,
            auth_client.get_authenticated_user,
            auth_client=auth_client,
            settings=settings,
        )
    except UpstreamServiceError as exc:
        if exc.status_code != 401:
            raise
        _clear_session_cookies(response, settings)
        return SessionResponse(authenticated=False)
    return SessionResponse(authenticated=True, user=user)


@app.post("/api/auth/verify-email/resend")
async def resend_verify_email(
    request: Request,
    response: Response,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> dict[str, Any]:
    """Resend the verification email for the current user."""
    return await _call_with_auto_refresh(
        request,
        response,
        auth_client.resend_verify_email,
        auth_client=auth_client,
        settings=settings,
    )


@app.post("/api/auth/verify-email/resend/request")
async def request_verify_email_resend(
    payload: RequestVerifyEmailResendRequest,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> dict[str, Any]:
    """Request a verification email resend without requiring a session."""
    return await auth_client.request_verify_email_resend(email=payload.email)


@app.post("/api/auth/reauth")
async def reauth(
    payload: ReauthRequest,
    request: Request,
    response: Response,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> dict[str, Any]:
    """Refresh auth_time for the current session."""

    async def do_reauth(access_token: str) -> dict[str, Any]:
        fresh_access_token = await auth_client.reauth(access_token, payload.password)
        _set_access_cookie(response, settings, fresh_access_token)
        return {"reauthenticated": True}

    return await _call_with_auto_refresh(
        request,
        response,
        do_reauth,
        auth_client=auth_client,
        settings=settings,
    )


@app.post("/api/auth/otp/enable")
async def enable_otp(
    request: Request,
    response: Response,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> OTPEnabledResponse:
    """Enable email OTP for the current user."""
    result = await _call_with_auto_refresh(
        request,
        response,
        auth_client.enable_login_otp,
        auth_client=auth_client,
        settings=settings,
    )
    return OTPEnabledResponse(email_otp_enabled=bool(result.get("email_otp_enabled", False)))


@app.post("/api/auth/logout")
async def logout(
    request: Request,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> JSONResponse:
    """Logout and clear local cookies."""
    access_token = request.cookies.get(settings.cookie_access_name)
    refresh_token = request.cookies.get(settings.cookie_refresh_name)
    if access_token and refresh_token:
        try:
            await auth_client.logout(access_token, refresh_token)
        except UpstreamServiceError:
            pass
    response = JSONResponse(status_code=200, content={"logged_out": True})
    _clear_session_cookies(response, settings)
    return response


@app.get("/api/protected/demo")
async def protected_demo(
    request: Request,
    response: Response,
    auth_client: SampleAuthClient = Depends(get_auth_client),
) -> ProtectedDemoResponse:
    """Proxy a request into the SDK-protected downstream API."""
    payload = await _call_with_auto_refresh(
        request,
        response,
        auth_client.get_demo,
        auth_client=auth_client,
        settings=settings,
    )
    return ProtectedDemoResponse(**payload)
