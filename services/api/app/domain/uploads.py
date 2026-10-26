"""Server-owned upload paths and checks on what was uploaded (FR-SEC-02, FR-SEC-17).

The app never names a storage path: every document's files live under
`uploads/{user_id}/{document_id}/`, named `1.pdf` / `1.pptx`, or `001.jpg`… for photo sets
(zero-padded so they sort in page order).
"""

from datetime import datetime, timedelta
from uuid import UUID

# Supabase fixes signed upload URLs at 2 hours, so the 10 minutes are enforced here: an object
# written later than this after its URL was issued is rejected.
UPLOAD_URL_TTL = timedelta(minutes=10)

MAGIC = {
    ".pdf": (b"%PDF-",),
    ".pptx": (b"PK\x03\x04",),  # a zip container
    "photo": (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n"),  # JPEG, PNG
}

# Failure codes returned by check(), with the message the student sees.
MESSAGES = {
    "upload_missing": "The upload didn't finish. Try adding the file again.",
    "wrong_type": "This file isn't a readable PDF or PowerPoint. Try exporting it again.",
    "too_large": "This file is too big. Documents can be up to 25 MB and 150 pages.",
    "upload_expired": "The upload took too long. Try adding the file again.",
}


def prefix(user_id: UUID, document_id: UUID) -> str:
    return f"uploads/{user_id}/{document_id}/"


def new_path(user_id: UUID, document_id: UUID, ext: str | None) -> str:
    """A file upload's path (ext like '.pdf'), or the folder of a photo set (ext None)."""
    folder = prefix(user_id, document_id)
    return folder if ext is None else f"{folder}1{ext}"


def photo_paths(folder: str, count: int) -> list[str]:
    return [f"{folder}{i:03d}.jpg" for i in range(1, count + 1)]


def files(doc: dict) -> list[str]:
    """Every object the document's upload consists of."""
    if doc["image_count"]:
        return photo_paths(doc["upload_path"], doc["image_count"])
    return [doc["upload_path"]]


def owned(doc: dict, user_id: UUID) -> bool:
    """The stored path is inside this user's folder for this document."""
    return doc["upload_path"].startswith(prefix(user_id, doc["id"]))


def kind(doc: dict) -> str:
    if doc["image_count"]:
        return "photo"
    return "." + doc["upload_path"].rsplit(".", 1)[-1].lower()


def _created(info: dict) -> datetime | None:
    raw = info.get("created_at") or info.get("last_modified")
    return datetime.fromisoformat(raw.replace("Z", "+00:00")) if raw else None


async def check(storage, doc: dict, max_bytes: int) -> str | None:
    """None when every file is there, in time, within size and really of its type; otherwise a
    failure code from MESSAGES."""
    issued = doc.get("upload_url_issued_at")
    signatures = MAGIC.get(kind(doc), ())
    for path in files(doc):
        info = await storage.info(path)
        if info is None:
            return "upload_missing"
        size = int(info.get("size") or (info.get("metadata") or {}).get("size") or 0)
        if size <= 0:
            return "upload_missing"
        if size > max_bytes:
            return "too_large"
        created = _created(info)
        if issued and created and created > issued + UPLOAD_URL_TTL:
            return "upload_expired"
        head = await storage.head(path, 16)
        if not any(head.startswith(sig) for sig in signatures):
            return "wrong_type"
    return None
