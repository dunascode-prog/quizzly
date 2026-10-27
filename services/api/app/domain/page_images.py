"""Images of source pages for the in-app viewer (FR-DOC-10).

A PDF page is rendered the first time someone opens it and cached under `pages/{sha256}/`; a photo
set's page is the photo itself. Slides have no image (the viewer shows their text). The app only
gets a 5-minute signed URL for the student's own document; shared-course members get the quote
view instead (FR-SHARE-02), never a storage URL.
"""

import asyncio
import io

import httpx

from app.core.storage import Storage
from app.rag.extract import IMAGES_MIME, PDF_MIME, _open_pdf

URL_TTL = 300  # seconds
MAX_WIDTH = 1400  # pixels; sharp on a phone, small enough to load on mobile data
JPEG_QUALITY = 80


def cache_folder(sha256: str) -> str:
    return f"pages/{sha256}/"


def render_page(data: bytes, number: int) -> bytes:
    """One PDF page as a JPEG at most MAX_WIDTH wide (2x at most)."""
    pdf = _open_pdf(data)
    try:
        page = pdf[number - 1]
        try:
            scale = min(2.0, MAX_WIDTH / max(page.get_width(), 1))
            image = page.render(scale=scale).to_pil().convert("RGB")
        finally:
            page.close()
    finally:
        pdf.close()
    out = io.BytesIO()
    image.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


async def image_url(storage: Storage, source: dict, number: int) -> str | None:
    """A signed URL for page `number` of a source file, or None if it has no page image."""
    mime = source["mime_type"]
    if mime == IMAGES_MIME:
        photos = await storage.list_folder(source["storage_path"])
        if not 1 <= number <= len(photos):
            return None
        return await storage.signed_url(photos[number - 1], URL_TTL)
    if mime != PDF_MIME:
        return None
    cached = f"{cache_folder(source['sha256'])}{number}.jpg"
    try:
        return await storage.signed_url(cached, URL_TTL)
    except httpx.HTTPStatusError:
        pass  # not rendered yet
    data = await storage.download(source["storage_path"])
    jpeg = await asyncio.to_thread(render_page, data, number)
    await storage.upload(cached, jpeg, "image/jpeg")
    return await storage.signed_url(cached, URL_TTL)
