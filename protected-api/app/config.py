"""Configuration for the protected API."""

from pathlib import Path
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
    authsdk_repo_path: str | None = None

    def resolved_authsdk_repo_path(self) -> Path:
        """Return the authSDK repository root used for local sample development."""
        if self.authsdk_repo_path:
            return Path(self.authsdk_repo_path).expanduser().resolve()
        current_file = Path(__file__).resolve()
        parent_chain = current_file.parents
        repo_anchor = parent_chain[3] if len(parent_chain) > 3 else parent_chain[len(parent_chain) - 1]
        return repo_anchor / "authSDK"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings."""
    return Settings()
