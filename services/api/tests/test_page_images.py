"""Source page images for the in-app viewer (FR-DOC-10)."""

import io
import uuid

import httpx
import pypdfium2 as pdfium
from PIL import Image

from app.domain import page_images, study
from app.rag.extract import IMAGES_MIME, PDF_MIME, PPTX_MIME
from tests.test_chat import DOC, auth


def tiny_pdf(pages: int = 2) -> bytes:
    pdf = pdfium.PdfDocument.new()
    for _ in range(pages):
        pdf.new_page(595, 842)  # A4 in points
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


class FakeStorage:
    def __init__(self, files: dict[str, bytes]):
        self.files = files
        self.downloads = 0

    async def signed_url(self, path, expires_in=300):
        if path not in self.files:
            req = httpx.Request("POST", "http://storage")
            raise httpx.HTTPStatusError("missing", request=req, response=httpx.Response(400))
        return f"https://signed/{path}?ttl={expires_in}"

    async def download(self, path):
        self.downloads += 1
        return self.files[path]

    async def upload(self, path, data, content_type):
        self.files[path] = data

    async def list_folder(self, folder):
        return sorted(p for p in self.files if p.startswith(folder) and "/" not in p[len(folder) :])


async def test_a_pdf_page_is_rendered_once_then_served_from_the_cache():
    storage = FakeStorage({"shared/abc": tiny_pdf()})
    source = {"sha256": "abc", "mime_type": PDF_MIME, "storage_path": "shared/abc"}
    url = await page_images.image_url(storage, source, 2)
    assert url == "https://signed/pages/abc/2.jpg?ttl=300"
    with Image.open(io.BytesIO(storage.files["pages/abc/2.jpg"])) as img:
        assert img.format == "JPEG" and img.width <= page_images.MAX_WIDTH
    assert await page_images.image_url(storage, source, 2) == url
    assert storage.downloads == 1


async def test_a_photo_set_page_is_the_photo_itself():
    storage = FakeStorage({"uploads/u/d/001.jpg": b"1", "uploads/u/d/002.jpg": b"2"})
    source = {"sha256": "x", "mime_type": IMAGES_MIME, "storage_path": "uploads/u/d/"}
    assert await page_images.image_url(storage, source, 2) == (
        "https://signed/uploads/u/d/002.jpg?ttl=300"
    )
    assert await page_images.image_url(storage, source, 3) is None


async def test_slides_have_no_image():
    source = {"sha256": "x", "mime_type": PPTX_MIME, "storage_path": "shared/x"}
    assert await page_images.image_url(FakeStorage({}), source, 1) is None


def test_the_route_checks_the_document_and_the_page_number(client, monkeypatch):
    async def ready_document(conn, user_id, document_id):
        if document_id != DOC:
            return None
        return {"id": DOC, "title": "Stacks", "source_file_id": uuid.uuid4(), "page_count": 3}

    async def source_file(conn, source_file_id):
        return {"sha256": "abc", "mime_type": PDF_MIME, "storage_path": "shared/abc"}

    async def image_url(storage, source, number):
        return f"https://signed/{number}"

    monkeypatch.setattr(study, "ready_document", ready_document)
    monkeypatch.setattr(study, "source_file", source_file)
    monkeypatch.setattr(page_images, "image_url", image_url)
    r = client.get(f"/v1/documents/{DOC}/pages/2/image", headers=auth())
    assert r.status_code == 200 and r.json() == {"url": "https://signed/2"}
    assert client.get(f"/v1/documents/{DOC}/pages/4/image", headers=auth()).status_code == 404
    assert client.get(f"/v1/documents/{DOC}/pages/0/image", headers=auth()).status_code == 404
    other = uuid.uuid4()
    assert client.get(f"/v1/documents/{other}/pages/1/image", headers=auth()).status_code == 404
