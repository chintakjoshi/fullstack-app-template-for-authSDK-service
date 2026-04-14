"""Auth and protected API client helpers for the sample BFF."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings


class UpstreamServiceError(Exception):
    """Raised when an upstream service responds with an application error."""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code


@dataclass(frozen=True)
class TokenPair:
    """Access and refresh tokens issued by the auth service."""

    access_token: str
    refresh_token: str


class SampleAuthClient:
    """HTTP client used by the sample BFF."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._auth_client = httpx.AsyncClient(
            base_url=str(settings.auth_service_url).rstrip("/"),
            timeout=httpx.Timeout(10.0),
        )
        self._protected_client = httpx.AsyncClient(
            base_url=str(settings.protected_api_url).rstrip("/"),
            timeout=httpx.Timeout(10.0),
        )

    async def aclose(self) -> None:
        """Close managed HTTP clients."""
        await self._auth_client.aclose()
        await self._protected_client.aclose()

    async def signup(self, email: str, password: str) -> dict[str, Any]:
        """Create a user with email and password."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/signup",
            json={"email": email, "password": password},
        )
        return await self._json_or_raise(response)

    async def login(self, email: str, password: str) -> dict[str, Any]:
        """Attempt password login for the protected API audience."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/login",
            json={
                "email": email,
                "password": password,
                "audience": self._settings.protected_api_audience,
            },
        )
        return await self._json_or_raise(response)

    async def verify_login_otp(self, challenge_token: str, code: str) -> TokenPair:
        """Complete login with an OTP code."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/otp/verify/login",
            json={"challenge_token": challenge_token, "code": code},
        )
        payload = await self._json_or_raise(response)
        return TokenPair(
            access_token=str(payload["access_token"]),
            refresh_token=str(payload["refresh_token"]),
        )

    async def resend_login_otp(self, challenge_token: str) -> dict[str, Any]:
        """Resend a login OTP."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/otp/resend/login",
            json={"challenge_token": challenge_token},
        )
        return await self._json_or_raise(response)

    async def refresh(self, refresh_token: str) -> TokenPair:
        """Refresh the session and rotate the refresh token."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/token",
            json={"refresh_token": refresh_token},
        )
        payload = await self._json_or_raise(response)
        return TokenPair(
            access_token=str(payload["access_token"]),
            refresh_token=str(payload["refresh_token"]),
        )

    async def logout(self, access_token: str, refresh_token: str) -> None:
        """Logout and revoke the current session."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/logout",
            json={"refresh_token": refresh_token},
            headers={"authorization": f"Bearer {access_token}"},
        )
        if response.status_code not in {200, 204}:
            await self._raise_upstream(response)

    async def resend_verify_email(self, access_token: str) -> dict[str, Any]:
        """Resend the email verification link."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/verify-email/resend",
            headers={"authorization": f"Bearer {access_token}"},
        )
        return await self._json_or_raise(response)

    async def request_verify_email_resend(self, email: str) -> dict[str, Any]:
        """Request a verification email resend without requiring a session."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/verify-email/resend/request",
            json={"email": email},
        )
        return await self._json_or_raise(response)

    async def reauth(self, access_token: str, password: str) -> str:
        """Refresh auth_time with password step-up."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/reauth",
            json={"password": password},
            headers={"authorization": f"Bearer {access_token}"},
        )
        payload = await self._json_or_raise(response)
        return str(payload["access_token"])

    async def enable_login_otp(self, access_token: str) -> dict[str, Any]:
        """Enable email OTP for the current user."""
        response = await self._request(
            self._auth_client,
            "POST",
            "/auth/otp/enable",
            headers={"authorization": f"Bearer {access_token}"},
        )
        return await self._json_or_raise(response)

    async def get_authenticated_user(self, access_token: str) -> dict[str, Any]:
        """Validate an access token online, then derive the user payload from its claims."""
        response = await self._request(
            self._auth_client,
            "GET",
            "/auth/validate",
            headers={"authorization": f"Bearer {access_token}"},
        )
        if response.status_code >= 400:
            await self._raise_upstream(response)
        return self._user_from_access_token(access_token)

    async def get_current_user(self, access_token: str) -> dict[str, Any]:
        """Call the SDK-protected API and return the trusted user identity."""
        response = await self._request(
            self._protected_client,
            "GET",
            "/me",
            headers={"authorization": f"Bearer {access_token}"},
        )
        return await self._json_or_raise(response)

    async def get_demo(self, access_token: str) -> dict[str, Any]:
        """Call the SDK-protected demo endpoint."""
        response = await self._request(
            self._protected_client,
            "GET",
            "/demo",
            headers={"authorization": f"Bearer {access_token}"},
        )
        return await self._json_or_raise(response)

    async def _request(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """Execute an HTTP request and normalize connection-level failures."""
        headers = dict(kwargs.pop("headers", {}))
        if client is self._auth_client:
            # This sample expects raw token-pair responses from authSDK, so opt out
            # of browser-session cookie transport even when the upstream can infer it.
            headers.setdefault("X-Auth-Session-Transport", "token")
        if headers:
            kwargs["headers"] = headers
        try:
            return await client.request(method, url, **kwargs)
        except httpx.RequestError as exc:
            service_name = "auth service" if client is self._auth_client else "protected API"
            raise UpstreamServiceError(
                503,
                f"Unable to reach the sample {service_name}. Confirm it is running and reachable.",
                "upstream_unavailable",
            ) from exc

    def _user_from_access_token(self, access_token: str) -> dict[str, Any]:
        """Extract the sample UI user shape from a validated access token."""
        claims = self._decode_access_token_claims(access_token)
        user_id = str(claims.get("sub", "")).strip()
        email = str(claims.get("email", "")).strip()
        role = str(claims.get("role", "")).strip()
        email_verified = claims.get("email_verified")
        email_otp_enabled = claims.get("email_otp_enabled")
        auth_time = claims.get("auth_time")
        raw_scopes = claims.get("scopes", [])

        if not user_id or not email:
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )
        if role not in {"admin", "user", "service"}:
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )
        if not isinstance(email_verified, bool) or not isinstance(email_otp_enabled, bool):
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )
        if not isinstance(auth_time, int):
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )
        if not isinstance(raw_scopes, list) or not all(isinstance(item, str) for item in raw_scopes):
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )

        return {
            "type": "user",
            "user_id": user_id,
            "email": email,
            "email_verified": email_verified,
            "email_otp_enabled": email_otp_enabled,
            "role": role,
            "scopes": list(raw_scopes),
            "auth_time": auth_time,
        }

    @staticmethod
    def _decode_access_token_claims(access_token: str) -> dict[str, Any]:
        """Decode access-token claims without re-verifying the signature."""
        parts = access_token.split(".")
        if len(parts) != 3:
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )
        payload_segment = parts[1]
        padded_payload = payload_segment + ("=" * (-len(payload_segment) % 4))
        try:
            decoded_payload = base64.urlsafe_b64decode(padded_payload.encode("ascii"))
            payload = json.loads(decoded_payload.decode("utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as exc:
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            ) from exc
        if not isinstance(payload, dict):
            raise UpstreamServiceError(
                503,
                "Auth service returned an unexpected access token payload.",
                "upstream_error",
            )
        return payload

    async def _json_or_raise(self, response: httpx.Response) -> dict[str, Any]:
        """Return JSON on success or raise a normalized application error."""
        if response.status_code >= 400:
            await self._raise_upstream(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamServiceError(503, "Upstream returned invalid JSON.", "upstream_error") from exc
        if not isinstance(payload, dict):
            raise UpstreamServiceError(503, "Upstream returned invalid JSON.", "upstream_error")
        return payload

    async def _raise_upstream(self, response: httpx.Response) -> None:
        """Raise a normalized upstream error."""
        try:
            payload = response.json()
        except ValueError:
            raise UpstreamServiceError(
                response.status_code,
                "Upstream service unavailable.",
                "upstream_error",
            )
        if isinstance(payload, dict):
            detail = str(payload.get("detail", "Upstream request failed."))
            code = str(payload.get("code", "upstream_error"))
        else:
            detail = "Upstream request failed."
            code = "upstream_error"
        raise UpstreamServiceError(response.status_code, detail, code)
