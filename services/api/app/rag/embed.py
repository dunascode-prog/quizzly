"""Chunk embeddings on CPU with bge-small (384 dims), as the chunks.embedding column expects."""

from functools import lru_cache

from fastembed import TextEmbedding

BATCH_SIZE = 64


@lru_cache
def _model(name: str) -> TextEmbedding:
    # First use downloads the model (~130 MB) and keeps it in memory for the process.
    return TextEmbedding(name)


def embed_passages(texts: list[str], model: str) -> list[list[float]]:
    """Blocking; call from a thread (asyncio.to_thread) inside the worker."""
    return [vec.tolist() for vec in _model(model).embed(texts, batch_size=BATCH_SIZE)]


def to_pgvector(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
