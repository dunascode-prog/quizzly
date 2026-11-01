import asyncio
import hmac
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    auth_bridge,
    chat,
    courses,
    documents,
    home,
    invites,
    notifications,
    openapi,
    plans,
    quizzes,
    sharing,
    study,
)
from app.api.routes import router
from app.core import db
from app.core.config import get_settings
from app.core.logging import configure_logging, request_id_var
from app.core.observability import init_sentry
from app.rag import embed

log = logging.getLogger("quizzly.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.require_env()  # FR-SEC-15: no silent defaults about where we run
    configure_logging(settings.log_level)
    if settings.database_url:
        await db.open_pool()
        # Load the embedding model now, not on the first chat question (FR-CHAT-04).
        app.state.warm_embeddings = asyncio.create_task(
            asyncio.to_thread(embed.load, settings.embedding_model)
        )
    else:
        log.warning("DATABASE_URL is not set; running without a database")
    yield
    await db.close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    init_sentry(settings, "api")  # NFR-09; off without SENTRY_DSN
    # FR-SEC-15: the interactive docs and schema only where it's explicitly not production.
    docs = settings.env in ("local", "test", "staging")
    app = FastAPI(
        title="Quizzly API",
        version=openapi.VERSION,
        description=openapi.DESCRIPTION,
        openapi_tags=openapi.TAGS,
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    # Native apps aren't subject to CORS. Browsers may call only from the allowlist, plus the
    # Expo web preview on localhost when running locally.
    local = settings.env == "local"
    if settings.cors_origins or local:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?" if local else None,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.exception_handler(RequestValidationError)
    async def readable_validation_errors(_: Request, exc: RequestValidationError):
        """Too-long input gets a plain message the app shows as-is (FR-SEC-10)."""
        errors = list(exc.errors())
        # A union field (e.g. an answer: number, true/false or text) reports one error per
        # option; when one of them is "too long", that's the one that matters.
        long = [e for e in errors if e.get("type") == "string_too_long"]
        if long:
            errors = [
                {
                    **e,
                    "msg": f"That's too long. Keep it under {e['ctx']['max_length']:,} characters.",
                }
                for e in long
            ]
        return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        """NFR-09: one structured line per request, and the request id on every log line."""
        rid = (request.headers.get("x-request-id") or uuid.uuid4().hex)[:64]
        token = request_id_var.set(rid)
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["x-request-id"] = rid
            return response
        finally:
            route = request.scope.get("route")
            # The route's template ("/v1/documents/{document_id}"), never ids or query strings.
            path = getattr(route, "path", None) or "unmatched"
            log.info(
                "request",
                extra={
                    "method": request.method,
                    "path": path,
                    "status": status,
                    "ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id_var.reset(token)

    @app.get("/internal/metrics", include_in_schema=False)
    async def internal_metrics(request: Request):
        """Job queue metrics for monitoring (NFR-09). Needs METRICS_TOKEN; off without it."""
        token = request.headers.get("x-metrics-token", "")
        if not settings.metrics_token or not hmac.compare_digest(token, settings.metrics_token):
            raise HTTPException(404, "Not Found")
        from app.worker.metrics import job_metrics

        async with db.get_pool().connection() as conn:
            return await job_metrics(conn)

    app.include_router(auth_bridge.router)
    app.include_router(router)
    app.include_router(courses.router)
    app.include_router(documents.router)
    app.include_router(study.router)
    app.include_router(quizzes.router)
    app.include_router(home.router)
    app.include_router(notifications.router)
    app.include_router(sharing.router)
    app.include_router(invites.router)
    app.include_router(plans.router)
    app.include_router(chat.router)
    openapi.install(app)
    return app


app = create_app()
