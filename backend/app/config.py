"""Configuration for the sample BFF."""

from functools import lru_cache
from typing import Literal

from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_host: str = "127.0.0.1"
    app_port: int = 8100
    frontend_origin: HttpUrl = "http://127.0.0.1:5173"

    auth_service_url: HttpUrl = "http://127.0.0.1:8000"
    protected_api_url: HttpUrl = "http://127.0.0.1:8200"
    protected_api_audience: str = "sample-protected-api"

    cookie_access_name: str = "sample_access_token"
    cookie_refresh_name: str = "sample_refresh_token"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None
    access_cookie_max_age_seconds: int = 900
    refresh_cookie_max_age_seconds: int = 604800


@lru_cache
def get_settings() -> Settings:
    """Return cached settings."""
    return Settings()
