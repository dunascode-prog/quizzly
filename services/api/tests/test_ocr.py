import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.rag import extract, ocr

LINES = [
    "Stack operations",
    "push(x): add x to the top.",
    "pop(): remove and return the top item.",
    "All four operations run in O(1) time.",
]


def _tesseract_available() -> bool:
    try:
        ocr._configure()
        return True
    except ocr.OcrUnavailable:
        return False


needs_tesseract = pytest.mark.skipif(not _tesseract_available(), reason="Tesseract not installed")


def page_image() -> Image.Image:
    img = Image.new("RGB", (1400, 700), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 40)
    except OSError:
        font = ImageFont.truetype("DejaVuSans.ttf", 40)
    for i, line in enumerate(LINES):
        draw.text((60, 60 + i * 80), line, fill="black", font=font)
    return img


def test_lines_and_paragraphs_are_rebuilt_from_word_data():
    data = {
        "text": ["Stacks", "are", "LIFO", "", "Queues"],
        "conf": ["95", "90", "40", "-1", "85"],
        "block_num": [1, 1, 1, 1, 2],
        "par_num": [1, 1, 1, 1, 1],
        "line_num": [1, 1, 2, 2, 1],
    }
    result = ocr._from_data(data)
    assert result.text == "Stacks are\nLIFO\n\nQueues"
    assert result.confidence == 77.5
    assert result.weak_share == 0.25  # "LIFO" at 40 is the weak word


def test_low_confidence_rules():
    assert not ocr.OcrResult("x", 92.0, 0.05).low
    assert ocr.OcrResult("x", 65.0, 0.1).low  # weak average
    assert ocr.OcrResult("x", 82.0, 0.4).low  # decent average, many garbled words


def test_photos_must_be_real_images():
    buf = io.BytesIO()
    page_image().save(buf, "PNG")
    extract.check_image(buf.getvalue())
    with pytest.raises(extract.ExtractionError) as exc:
        extract.check_image(b"not an image at all")
    assert exc.value.reason == "corrupt"


@needs_tesseract
def test_clean_photo_is_read_confidently():
    buf = io.BytesIO()
    page_image().save(buf, "JPEG", quality=85)
    result = ocr.ocr_bytes(buf.getvalue())
    assert "Stack operations" in result.text
    assert "remove and return the top item" in result.text
    assert not result.low


@needs_tesseract
def test_unreadable_photo_is_flagged():
    blurred = page_image().resize((180, 90)).resize((1400, 700))
    assert ocr.ocr_image(blurred).low


@needs_tesseract
def test_scanned_pdf_page_has_no_text_layer_but_is_read_by_ocr():
    buf = io.BytesIO()
    page_image().save(buf, "PDF", resolution=150)  # an image-only PDF, like a scanner makes
    data = buf.getvalue()
    pages = extract.extract(data, extract.PDF_MIME)
    assert len(pages[0].text.strip()) < extract.SCANNED_PAGE_CHARS
    (number, image), *_ = extract.render_pdf_pages(data, [1])
    assert number == 1
    assert "push(x)" in ocr.ocr_image(image).text
