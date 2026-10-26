from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[2]


ENVIRONMENTS = ("local", "test", "staging", "production")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVICE_ROOT / ".env", extra="ignore")

    # Must be set explicitly (FR-SEC-15): local, test, staging or production. The API and the
    # worker refuse to start without it, so a missing value can't silently mean "development".
    env: str = ""
    # Websites allowed to call the API from a browser (CORS). Native apps aren't subject to CORS.
    cors_origins: list[str] = []
    log_level: str = "info"
    timezone: str = "Africa/Lagos"

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # Legacy HS256 projects only; new projects sign tokens with asymmetric keys (JWKS).
    supabase_jwt_secret: str = ""
    database_url: str = ""
    storage_bucket: str = "documents"
    # Bump when the Terms or Privacy Policy change; stored on the profile at consent (FR-AUTH-03).
    terms_version: str = "2026-10-22"

    # Free-plan limits (PRD §9, FR-DOC-02, FR-LIM-01).
    max_upload_bytes: int = 25 * 1024 * 1024
    max_document_pages: int = 150
    daily_uploads: int = 5
    daily_explanations: int = 30
    daily_question_sets: int = 15
    daily_markings: int = 20  # theory / short answers marked by the LLM (PRD §9)
    daily_chat_messages: int = 40

    models_config_path: Path = SERVICE_ROOT / "config" / "models.yaml"
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    sentry_dsn: str = ""

    @property
    def production(self) -> bool:
        return self.env == "production"

    def require_env(self) -> None:
        if self.env not in ENVIRONMENTS:
            raise RuntimeError(
                f"Set ENV to one of {', '.join(ENVIRONMENTS)} (got {self.env!r}). "
                "Quizzly won't start without knowing where it runs."
            )

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
