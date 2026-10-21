from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter()


@router.get("/healthz", tags=["ops"])
async def healthz() -> dict:
    return {"status": "ok"}


@router.get("/v1/me", tags=["account"])
async def me(user: Annotated[CurrentUser, Depends(get_current_user)]) -> dict:
    return {"id": str(user.id), "email": user.email}
