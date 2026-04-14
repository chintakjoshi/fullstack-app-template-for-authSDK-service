"""Configuration for the protected API."""

from functools import lru_cache

from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Protected API settings."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_host: str = "127.0.0.1"
    app_port: int = 8200
    auth_service_url: HttpUrl = "http://127.0.0.1:8000"
    expected_audience: str = "sample-protected-api"
    access_cookie_name: str = "auth_access"
    csrf_cookie_name: str = "auth_csrf"
    csrf_header_name: str = "X-CSRF-Token"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings."""
    return Settings()
