"""
OpenAI backend for the AI features, used when AI_PROVIDER=openai.

It talks to the Chat Completions API with plain HTTPS requests (no extra
package). OPENAI_BASE_URL can point at any server that speaks the same
protocol. Written against OpenAI's public API docs and covered by tests that
fake the network; run it once against a real key before relying on it.

Settings: OPENAI_API_KEY (required), OPENAI_MODEL (default gpt-4o-mini, change
it to whichever model you want), OPENAI_BASE_URL (default https://api.openai.com/v1).
"""
import json
import logging
import os
import time
from typing import Dict, Iterator, List, Optional

import requests

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 70
_RETRYABLE = {500, 502, 503, 504}
_RETRY_DELAY_SECONDS = 1.5


class OpenAIQuotaError(RuntimeError):
    """The account is out of credit or over its limit."""


class OpenAIError(RuntimeError):
    """A failure with a message that is safe to show the user."""


def _key() -> Optional[str]:
    return os.environ.get("OPENAI_API_KEY")


def _model() -> str:
    return os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"


def _base() -> str:
    return (os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")


def is_configured() -> bool:
    return bool(_key())


def _error_from(resp) -> RuntimeError:
    code = ""
    try:
        body = resp.json().get("error", {})
        code = body.get("code") or body.get("type") or ""
    except (ValueError, AttributeError):
        pass
    if resp.status_code == 429 and code == "insufficient_quota":
        return OpenAIQuotaError("The AI account is out of credit. Try again later.")
    if resp.status_code == 429:
        return OpenAIError("The AI service is busy. Try again in a moment.")
    if resp.status_code in (401, 403):
        return OpenAIError("The AI key was rejected. Check the OpenAI key in settings.")
    return OpenAIError("The AI service had a problem. Try again.")


def _payload(messages: List[Dict], system: Optional[str], max_tokens: int, stream: bool) -> Dict:
    msgs = ([{"role": "system", "content": system}] if system else []) + [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]
    body = {"model": _model(), "messages": msgs, "max_completion_tokens": max_tokens}
    if stream:
        body["stream"] = True
    return body


def _post(body: Dict, stream: bool = False):
    headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}
    return requests.post(f"{_base()}/chat/completions", headers=headers, json=body, timeout=_TIMEOUT_SECONDS, stream=stream)


def generate_text(prompt: str, system: Optional[str] = None, max_tokens: int = 1024) -> Optional[str]:
    """One answer, or None for a failure the caller cannot act on. Raises OpenAIQuotaError when out of credit."""
    if not is_configured():
        return None
    body = _payload([{"role": "user", "content": prompt}], system, max_tokens, stream=False)
    for attempt in range(2):
        try:
            resp = _post(body)
        except requests.RequestException as exc:
            logger.warning("OpenAI call failed: %s: %s", type(exc).__name__, exc)
            return None
        if resp.status_code == 200:
            try:
                return resp.json()["choices"][0]["message"]["content"]
            except (KeyError, IndexError, ValueError, TypeError):
                logger.warning("OpenAI returned an unexpected response shape")
                return None
        if attempt == 0 and resp.status_code in _RETRYABLE:
            time.sleep(_RETRY_DELAY_SECONDS)
            continue
        err = _error_from(resp)
        if isinstance(err, OpenAIQuotaError):
            raise err
        logger.warning("OpenAI call failed with status %s", resp.status_code)
        return None
    return None


def stream_chat(messages: List[Dict], system: str, max_tokens: int = 1024) -> Iterator[str]:
    """Yields text pieces as they arrive. Raises OpenAIError or OpenAIQuotaError with a safe message."""
    if not is_configured():
        raise OpenAIError("AI features are not configured (OPENAI_API_KEY not set)")
    body = _payload(messages, system, max_tokens, stream=True)
    try:
        resp = _post(body, stream=True)
    except requests.RequestException as exc:
        logger.warning("OpenAI stream failed to start: %s", type(exc).__name__)
        raise OpenAIError("Could not reach the AI service. Try again.") from exc
    if resp.status_code != 200:
        raise _error_from(resp)
    for raw in resp.iter_lines():
        if not raw:
            continue
        line = raw.decode() if isinstance(raw, bytes) else raw
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            return
        try:
            delta = json.loads(data)["choices"][0]["delta"].get("content")
        except (ValueError, KeyError, IndexError, TypeError):
            continue
        if delta:
            yield delta
