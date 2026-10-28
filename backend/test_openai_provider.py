from unittest.mock import patch

import pytest

from backend import ai_service, openai_provider


class Resp:
    def __init__(self, status=200, body=None, lines=None):
        self.status_code = status
        self._body = body if body is not None else {}
        self._lines = lines or []

    def json(self):
        return self._body

    def iter_lines(self):
        return iter(self._lines)


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)


def test_not_configured_without_a_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY")
    assert openai_provider.is_configured() is False
    assert openai_provider.generate_text("hi") is None
    with pytest.raises(openai_provider.OpenAIError):
        list(openai_provider.stream_chat([{"role": "user", "content": "hi"}], "sys"))


def test_generate_text_sends_expected_request_and_returns_content():
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None, stream=False):
        seen.update(url=url, headers=headers, body=json)
        return Resp(200, {"choices": [{"message": {"content": "Hello"}}]})

    with patch.object(openai_provider.requests, "post", fake_post):
        assert openai_provider.generate_text("Hi", system="Be brief", max_tokens=50) == "Hello"
    assert seen["url"] == "https://api.openai.com/v1/chat/completions"
    assert seen["headers"]["Authorization"] == "Bearer sk-test"
    assert seen["body"]["model"] == "gpt-4o-mini"
    assert seen["body"]["max_completion_tokens"] == 50
    assert seen["body"]["messages"] == [{"role": "system", "content": "Be brief"}, {"role": "user", "content": "Hi"}]


def test_model_and_base_url_are_configurable(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "my-model")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://example.test/v1/")
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None, stream=False):
        seen.update(url=url, model=json["model"])
        return Resp(200, {"choices": [{"message": {"content": "x"}}]})

    with patch.object(openai_provider.requests, "post", fake_post):
        openai_provider.generate_text("Hi")
    assert seen == {"url": "https://example.test/v1/chat/completions", "model": "my-model"}


def test_one_retry_on_a_server_error(monkeypatch):
    monkeypatch.setattr(openai_provider, "_RETRY_DELAY_SECONDS", 0)
    replies = [Resp(503), Resp(200, {"choices": [{"message": {"content": "ok"}}]})]
    with patch.object(openai_provider.requests, "post", lambda *a, **k: replies.pop(0)):
        assert openai_provider.generate_text("Hi") == "ok"


def test_out_of_credit_raises_a_quota_error():
    with patch.object(openai_provider.requests, "post", lambda *a, **k: Resp(429, {"error": {"code": "insufficient_quota"}})):
        with pytest.raises(openai_provider.OpenAIQuotaError):
            openai_provider.generate_text("Hi")


def test_a_bad_key_is_a_safe_message_when_streaming():
    with patch.object(openai_provider.requests, "post", lambda *a, **k: Resp(401, {"error": {"code": "invalid_api_key"}})):
        with pytest.raises(openai_provider.OpenAIError, match="key was rejected"):
            list(openai_provider.stream_chat([{"role": "user", "content": "hi"}], "sys"))


def test_stream_yields_pieces_until_done():
    lines = [
        b'data: {"choices":[{"delta":{"role":"assistant"}}]}',
        b"",
        b'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        b'data: {"choices":[{"delta":{"content":"lo"}}]}',
        b"data: [DONE]",
    ]
    with patch.object(openai_provider.requests, "post", lambda *a, **k: Resp(200, lines=lines)):
        assert "".join(openai_provider.stream_chat([{"role": "user", "content": "hi"}], "sys")) == "Hello"


def test_ai_service_uses_openai_when_selected():
    with patch.object(ai_service, "AI_PROVIDER", "openai"):
        assert ai_service.is_configured() is True
        with patch.object(openai_provider, "generate_text", return_value="from openai") as gen:
            assert ai_service.generate_text("Hi", system="s") == "from openai"
            gen.assert_called_once()
        with patch.object(openai_provider.requests, "post", lambda *a, **k: Resp(429, {"error": {"code": "insufficient_quota"}})):
            with pytest.raises(ai_service.QuotaExceededError):
                ai_service.generate_text("Hi")


def test_chat_stream_goes_through_openai_and_includes_the_snapshot():
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None, stream=False):
        captured["system"] = json["messages"][0]["content"]
        return Resp(200, lines=[b'data: {"choices":[{"delta":{"content":"Hi"}}]}', b"data: [DONE]"])

    with patch.object(ai_service, "AI_PROVIDER", "openai"), patch.object(openai_provider.requests, "post", fake_post):
        out = "".join(ai_service.chat_stream([{"role": "user", "content": "hello"}], {"total": 123}))
    assert out == "Hi"
    assert '"total": 123' in captured["system"]


def test_gemini_stays_the_default():
    assert ai_service.AI_PROVIDER in ("gemini", "openai")
    with patch.object(ai_service, "AI_PROVIDER", "gemini"), patch.object(ai_service, "GEMINI_API_KEY", None):
        assert ai_service.is_configured() is False
