"""Export the OpenAPI schema without enabling the public docs routes.

The production app intentionally serves /docs, /redoc and /openapi.json as
404 (a hard requirement asserted by tests). This script builds the same app,
calls FastAPI's schema generator and writes the JSON to
backend/docs/openapi.json so frontend work can be typed against it.

Usage:
    python scripts/export_openapi.py [output_path]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from specwatt_api.app import create_app  # noqa: E402


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parents[1] / 'docs' / 'openapi.json'
    with tempfile_database() as database:
        app = create_app(database)
        schema = app.openapi()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'wrote {output} ({len(schema["paths"])} paths)')


def tempfile_database():
    import tempfile
    holder = tempfile.TemporaryDirectory(prefix='specwatt-openapi-')
    path = Path(holder.name) / 'schema.sqlite3'
    return _TempDirContext(holder, path)


class _TempDirContext:
    def __init__(self, holder, path):
        self._holder = holder
        self.path = str(path)

    def __enter__(self):
        return self.path

    def __exit__(self, *exc):
        self._holder.cleanup()
        return False


if __name__ == '__main__':
    main()
