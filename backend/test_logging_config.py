import json
import logging

from backend.logging_config import JSONFormatter


def _record(msg, level=logging.INFO):
    return logging.LogRecord(
        name="networth_tracker", level=level, pathname="app.py", lineno=1, msg=msg, args=(), exc_info=None
    )


def test_format_produces_valid_json_with_core_fields():
    line = JSONFormatter().format(_record("hello"))
    payload = json.loads(line)
    assert payload["event"] == "hello"
    assert payload["level"] == "INFO"
    assert payload["module"] == "app"
    assert "timestamp" in payload


def test_format_outside_request_context_omits_request_id_and_user_id():
    # No Flask app/request context is active in a plain unit test -- the
    # formatter must not raise (it did, before checking has_request_context()
    # explicitly, since accessing flask.g outside any context is a hard error).
    line = JSONFormatter().format(_record("import-time log"))
    payload = json.loads(line)
    assert "request_id" not in payload
    assert "user_id" not in payload
