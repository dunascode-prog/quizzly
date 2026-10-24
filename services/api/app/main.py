import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import courses, documents, quizzes, study
from app.api.routes import router
from app.core import db
from app.core.config import get_settings
from app.core.logging import configure_logging

log = logging.getLogger("quizzly.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.database_url:
        await db.open_pool()
    else:
        log.warning("DATABASE_URL is not set; running without a database")
    yield
    await db.close_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="Quizzly API", version="0.1.0", lifespan=lifespan)

    # Native apps aren't subject to CORS; this only lets the Expo web preview call a local API.
    if get_settings().env == "local":
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response

    app.include_router(router)
    app.include_router(courses.router)
    app.include_router(documents.router)
    app.include_router(study.router)
    app.include_router(quizzes.router)
    return app


app = create_app()
