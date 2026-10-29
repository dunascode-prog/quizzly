"""The Swagger docs cover every route, and the exported copy in docs/api matches the code."""

from app.api import openapi


def _operations(client):
    schema = client.get("/openapi.json").json()
    return [
        (f"{method.upper()} {path}", op)
        for path, ops in schema["paths"].items()
        for method, op in ops.items()
    ]


def test_every_route_is_described_and_tagged_once(client):
    for name, op in _operations(client):
        assert op.get("description"), f"{name} needs a docstring"
        assert len(op.get("tags", [])) == 1, f"{name} is listed under {op.get('tags')}"


def test_every_signed_in_route_documents_401(client):
    for name, op in _operations(client):
        if name != "GET /healthz":
            assert op.get("security"), f"{name} should need a token"
            assert "401" in op["responses"], name


def test_exported_openapi_is_up_to_date(client):
    assert openapi.EXPORT_PATH.read_text(encoding="utf-8") == openapi.export(client.app), (
        "docs/api/openapi.json is out of date: run `uv run python -m app.api.openapi`"
    )
