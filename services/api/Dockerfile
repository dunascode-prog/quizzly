FROM python:3.12-slim

# Tesseract for OCR on scanned pages (FR-DOC-07)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /usr/local/bin/uv

WORKDIR /srv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/srv/.venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 1001 --create-home quizzly     && mkdir -p /srv/models && chown quizzly /srv/models

# The embedding model (~130 MB) is part of the image: downloading it at runtime failed (no writable
# cache) and would repeat on every start. Keep the name in step with EMBEDDING_MODEL (config.py).
ENV FASTEMBED_CACHE_PATH=/srv/models HF_HOME=/tmp/huggingface
ARG EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
USER quizzly
RUN python -c "import sys; from fastembed import TextEmbedding; TextEmbedding(sys.argv[1])" "$EMBEDDING_MODEL"

COPY app ./app
COPY config ./config
COPY prompts ./prompts

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
