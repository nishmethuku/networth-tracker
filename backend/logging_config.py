"""
JSON log formatting so Render's log search can filter/group by field
(request_id, user_id, level, module) instead of grepping plain text.
"""
import json
import logging
from datetime import datetime

from flask import g, has_request_context


class JSONFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "event": record.getMessage(),
            "module": record.module,
        }
        # has_request_context() is False (not an exception) for import-time
        # logging and for any script that calls into backend code outside a
        # real Flask request (e.g. the app-context verification scripts
        # used throughout this project's development) -- both routinely
        # log before/without a request ever existing.
        if has_request_context():
            payload["request_id"] = getattr(g, "request_id", None)
            payload["user_id"] = getattr(g, "user_id", None)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)
