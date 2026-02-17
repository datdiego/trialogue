"""
Demo Mode Configuration
Handles demo API keys, model eligibility, and session call limits
"""
import os
import time
from collections import defaultdict

# Demo keys stored as Railway environment variables
# These keys are NEVER exposed in API responses or logs
DEMO_KEYS = {
    "groq": os.getenv("DEMO_GROQ_KEY"),
}

# Only these models can be used in demo mode
# Both on Groq free tier — no billing required
DEMO_MODELS = {
    "groq/llama-3.3-70b-versatile": "groq",
    "groq/llama-3.1-8b-instant": "groq",
    "groq/moonshotai/kimi-k2-instruct-0905": "groq",
    "groq/openai/gpt-oss-120b": "groq",
    "groq/qwen/qwen-3-32b": "groq",
}

# Demo session limits
# 5 API calls per session allows: 1 parallel chat (2 models = 2 calls)
# + 1 debate round 1 (2 calls) + partial round 2 (1 call) = 5
# Or: 1 parallel chat (2 calls) + 1 debate with 1 model (3 rounds = 3 calls) = 5
DEMO_CALLS_PER_SESSION = 5
DEMO_SESSION_WINDOW = 3600  # 1 hour window per IP

# In-memory tracker: {ip: [(timestamp, call_count), ...]}
_demo_call_tracker: dict[str, list[float]] = defaultdict(list)
_request_rate_tracker: dict[str, list[float]] = defaultdict(list)

# Per-IP request rate limits
DEMO_REQUESTS_PER_MINUTE = 3
BYOK_REQUESTS_PER_MINUTE = 10
REQUEST_RATE_WINDOW_SECONDS = 60


def check_demo_limit(client_ip: str, num_calls: int = 1) -> tuple[bool, int]:
    """
    Check if a demo session has remaining API calls.

    Args:
        client_ip: Client IP address
        num_calls: Number of calls about to be made

    Returns:
        (allowed, remaining) — whether the calls are allowed and how many remain
    """
    now = time.time()
    cutoff = now - DEMO_SESSION_WINDOW

    # Prune old entries
    _demo_call_tracker[client_ip] = [
        t for t in _demo_call_tracker[client_ip] if t > cutoff
    ]

    used = len(_demo_call_tracker[client_ip])
    remaining = DEMO_CALLS_PER_SESSION - used

    if num_calls > remaining:
        return False, remaining

    return True, remaining


def record_demo_calls(client_ip: str, num_calls: int = 1):
    """Record demo API calls for rate tracking."""
    now = time.time()
    _demo_call_tracker[client_ip].extend([now] * num_calls)


def check_request_rate_limit(client_ip: str, is_demo: bool) -> tuple[bool, int, int]:
    """
    Check per-IP request rate limits for demo and BYOK requests.

    Returns:
        (allowed, remaining, retry_after_seconds)
    """
    now = time.time()
    cutoff = now - REQUEST_RATE_WINDOW_SECONDS
    tracker_key = f"{client_ip}:{'demo' if is_demo else 'byok'}"

    _request_rate_tracker[tracker_key] = [
        t for t in _request_rate_tracker[tracker_key] if t > cutoff
    ]

    used = len(_request_rate_tracker[tracker_key])
    limit = DEMO_REQUESTS_PER_MINUTE if is_demo else BYOK_REQUESTS_PER_MINUTE
    remaining = max(limit - used, 0)

    if used >= limit:
        oldest = min(_request_rate_tracker[tracker_key]) if _request_rate_tracker[tracker_key] else now
        retry_after = max(int((oldest + REQUEST_RATE_WINDOW_SECONDS) - now), 1)
        return False, 0, retry_after

    return True, remaining - 1, 0


def record_request(client_ip: str, is_demo: bool):
    """Record one request in the per-minute rate tracker."""
    tracker_key = f"{client_ip}:{'demo' if is_demo else 'byok'}"
    _request_rate_tracker[tracker_key].append(time.time())


def get_demo_key(model: str) -> str | None:
    """
    Get demo key for a model, or None if not available.

    Args:
        model: Model ID (e.g., "gemini/gemini-2.0-flash")

    Returns:
        Demo API key if available, None otherwise
    """
    provider = DEMO_MODELS.get(model)
    if provider:
        return DEMO_KEYS.get(provider)
    return None


def is_demo_model(model: str) -> bool:
    """
    Check if a model is eligible for demo mode.

    Args:
        model: Model ID

    Returns:
        True if model can be used in demo mode
    """
    return model in DEMO_MODELS
