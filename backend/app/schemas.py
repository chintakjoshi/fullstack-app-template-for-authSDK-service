"""Shared request and response schemas for the sample BFF."""

from typing import Literal

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    """Frontend signup payload."""

    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    """Frontend login payload."""

    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class VerifyLoginOTPRequest(BaseModel):
    """OTP verification payload."""

    challenge_token: str = Field(min_length=16)
    code: str = Field(min_length=4, max_length=12)


class ResendLoginOTPRequest(BaseModel):
    """OTP resend payload."""

    challenge_token: str = Field(min_length=16)


class ReauthRequest(BaseModel):
    """Password re-authentication payload."""

    password: str = Field(min_length=8, max_length=256)


class RequestVerifyEmailResendRequest(BaseModel):
    """Public verification-resend payload."""

    email: str = Field(min_length=3, max_length=320)


class AuthenticatedUser(BaseModel):
    """User data returned by the protected API."""

    type: Literal["user"]
    user_id: str
    email: str
    email_verified: bool
    email_otp_enabled: bool
    role: Literal["admin", "user", "service"]
    scopes: list[str]
    auth_time: int


class SessionResponse(BaseModel):
    """Current session response returned to the frontend."""

    authenticated: bool
    user: AuthenticatedUser | None = None


class ErrorResponse(BaseModel):
    """Standardized error payload for the frontend."""

    detail: str
    code: str


class LoginOTPChallengePayload(BaseModel):
    """Login response when OTP is required."""

    otp_required: Literal[True] = True
    challenge_token: str
    masked_email: str


class AuthenticatedPayload(BaseModel):
    """Login response when authentication has completed."""

    authenticated: Literal[True] = True
    user: AuthenticatedUser


class OTPEnabledResponse(BaseModel):
    """OTP enablement response."""

    email_otp_enabled: bool


class ProtectedDemoResponse(BaseModel):
    """Downstream demo response shape."""

    message: str
    audience: str
    user: AuthenticatedUser
