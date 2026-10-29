# Quizzly API docs

`openapi.json` is the OpenAPI 3.1 spec for every route in `services/api`, generated from the code.
`index.html` shows it in Swagger UI.

## Viewing it

- **Live, with "Try it out":** run the API (`uv run uvicorn app.main:app --reload --host 0.0.0.0` in
  `services/api`) and open <http://localhost:8000/docs> (Swagger) or `/redoc`. Click **Authorize**
  and paste a Supabase access token. The live docs are off in production (FR-SEC-15).
- **Without the API running:** from the repo root, run `python -m http.server -d docs/api 8090`
  and open <http://localhost:8090>. Or paste `openapi.json` into <https://editor.swagger.io>.

## Keeping it current

After adding or changing a route, regenerate the file and commit it with your change:

```bash
cd services/api
uv run python -m app.api.openapi
```

`tests/test_openapi.py` fails if the file is out of date, if a route has no docstring (its
description in Swagger), or if a signed-in route doesn't document 401. The overview, tag
descriptions and error table live in `services/api/app/api/openapi.py`.
