from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVICE_ROOT / ".env", extra="ignore")

    env: str = "local"
    log_level: str = "info"
    timezone: str = "Africa/Lagos"

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # Legacy HS256 projects only; new projects sign tokens with asymmetric keys (JWKS).
    supabase_jwt_secret: str = ""
    database_url: str = ""
    storage_bucket: str = "documents"

    models_config_path: Path = SERVICE_ROOT / "config" / "models.yaml"
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    sentry_dsn: str = ""

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
