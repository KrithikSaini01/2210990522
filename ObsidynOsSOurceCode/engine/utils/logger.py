"""Minimal runtime logging with privacy-first defaults."""
import os
import sys
import traceback


_LEVELS = {
    "ERROR": 0,
    "INFO": 1,
    "DEBUG": 2,
}


def _enabled_level():
    raw_level = os.environ.get("OBSIDYN_LOG_LEVEL", "ERROR").upper()
    level = _LEVELS.get(raw_level, _LEVELS["ERROR"])
    if os.environ.get("OBSIDYN_DEBUG", "0") == "1":
        return _LEVELS["DEBUG"]
    return level


def _should_log(level):
    return _LEVELS.get(level.upper(), _LEVELS["ERROR"]) <= _enabled_level()


def log(message, level="INFO"):
    """Write a log line to stderr when the configured level allows it."""
    if _should_log(level):
        sys.stderr.write(f"{message}\n")
        sys.stderr.flush()


def log_exception(message, exc=None):
    """Log an error and only include tracebacks in explicit debug mode."""
    log(message, level="ERROR")
    if exc is not None and os.environ.get("OBSIDYN_DEBUG", "0") == "1":
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()


def mask_path(path):
    """Return only the final path segment for user-visible metadata."""
    normalized = (path or "").rstrip("/\\")
    return os.path.basename(normalized) or normalized
