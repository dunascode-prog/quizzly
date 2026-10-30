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
    # NFR-09: error tracking (Sentry free tier); off when empty. A release name (e.g. the git sha)
    # groups errors by deploy; traces are off unless a sample rate is set.
    sentry_dsn: str = ""
    sentry_traces_rate: float = 0.0
    release: str = ""
    # GET /internal/metrics needs this token in X-Metrics-Token; the route is off when empty.
    metrics_token: str = ""
    timezone: str = "Africa/Lagos"
    # Optional: Expo push security token (FR-NOTIF-03). Pushes work without it unless the
    # Expo project requires one.
    expo_access_token: str = ""

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # Legacy HS256 projects only; new projects sign tokens with asymmetric keys (JWKS).
    supabase_jwt_secret: str = ""
    database_url: str = ""
    storage_bucket: str = "documents"
    # Profile photos (FR-PROF-04): a separate private bucket the API alone writes to.
    avatars_bucket: str = "avatars"
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
    daily_share_recipients: int = 20  # people a student can send courses to per day (FR-SHARE-10)
    daily_avatar_uploads: int = 10  # profile photo changes per day (FR-SEC-22)
    # Monthly AI allowance per plan, at paid-tier list prices (FR-LIM-06). Typical free use is
    # about $0.10 a month; these stop one account from costing more than its plan brings in.
    monthly_ai_ceiling_free_usd: float = 0.60
    monthly_ai_ceiling_student_usd: float = 2.00
    monthly_ai_ceiling_premium_usd: float = 3.50
    # Total stored upload size per plan, in MB (FR-LIM-05).
    storage_free_mb: int = 500
    storage_student_mb: int = 2000
    storage_premium_mb: int = 5000
    # API requests per student per minute (FR-SEC-20); far above what the app makes.
    requests_per_minute: int = 120
    # Host of share and invite links (PRD Q4): https://{invite_domain}/c/{code}
    invite_domain: str = "quizzly.app"  # the same placeholder as apps/web and the app (WEB.md)
    # FR-SEC-08: a day's AI spend across all students; reaching either pauses new AI work.
    daily_llm_token_budget: int = 5_000_000
    daily_llm_cost_budget_usd: float = 2.0

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
