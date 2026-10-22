"""Tesseract OCR for photos and scanned pages (FR-DOC-07). Runs on CPU inside the worker."""

import io
import os
import shutil
from dataclasses import dataclass
from functools import lru_cache

import pytesseract
from PIL import Image, ImageOps

# A page is processed but flagged "hard to read" when its words average below LOW_CONFIDENCE,
# or when more than WEAK_SHARE of them are individually below WEAK_WORD (blur often scores a
# decent average while garbling words).
LOW_CONFIDENCE = 70.0
WEAK_WORD = 60.0
WEAK_SHARE = 0.25
MIN_WIDTH = 1600  # small photos are upscaled; Tesseract wants roughly 300 dpi text
MAX_SIDE = 3500  # huge scans are shrunk so a page doesn't take minutes

_WINDOWS_DEFAULT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


@dataclass
class OcrResult:
    text: str
    confidence: float  # 0–100, mean over recognised words; 0 when nothing was read
    weak_share: float = 0.0  # fraction of words below WEAK_WORD

    @property
    def low(self) -> bool:
        return self.confidence < LOW_CONFIDENCE or self.weak_share > WEAK_SHARE


class OcrUnavailable(RuntimeError):
    pass


@lru_cache
def _configure() -> None:
    cmd = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if not cmd and os.path.exists(_WINDOWS_DEFAULT):
        cmd = _WINDOWS_DEFAULT
    if not cmd:
        raise OcrUnavailable(
            "Tesseract isn't installed. Install it (services/api/README.md) or set TESSERACT_CMD."
        )
    pytesseract.pytesseract.tesseract_cmd = cmd


def prepare(image: Image.Image) -> Image.Image:
    """Upright, greyscale, a sensible size and stretched contrast: cheap steps that help a lot."""
    image = ImageOps.exif_transpose(image)  # phone photos store their rotation in EXIF
    image = ImageOps.grayscale(image)
    w, h = image.size
    if w < MIN_WIDTH:
        scale = MIN_WIDTH / w
        image = image.resize((MIN_WIDTH, round(h * scale)), Image.LANCZOS)
    elif max(w, h) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return ImageOps.autocontrast(image, cutoff=1)


def ocr_image(image: Image.Image) -> OcrResult:
    """Blocking; call from a thread in the worker."""
    _configure()
    image = prepare(image)
    data = pytesseract.image_to_data(
        image, lang="eng", config="--psm 3", output_type=pytesseract.Output.DICT
    )
    return _from_data(data)


def _from_data(data: dict) -> OcrResult:
    """Text with line/paragraph breaks and the mean word confidence, from one Tesseract pass."""
    lines: dict[tuple[int, int, int], list[str]] = {}
    confs: list[float] = []
    for i, word in enumerate(data["text"]):
        conf = float(data["conf"][i])
        if not word.strip() or conf < 0:
            continue
        confs.append(conf)
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
    out: list[str] = []
    previous: tuple[int, int] | None = None
    for (block, par, _), words in lines.items():
        if previous is not None and previous != (block, par):
            out.append("")  # blank line between paragraphs
        out.append(" ".join(words))
        previous = (block, par)
    confidence = sum(confs) / len(confs) if confs else 0.0
    weak = sum(c < WEAK_WORD for c in confs) / len(confs) if confs else 1.0
    return OcrResult(
        text="\n".join(out).strip(), confidence=round(confidence, 1), weak_share=round(weak, 2)
    )


def ocr_bytes(data: bytes) -> OcrResult:
    with Image.open(io.BytesIO(data)) as img:
        img.load()
        return ocr_image(img)
