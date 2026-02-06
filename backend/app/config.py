"""
Demo Mode Configuration
Handles demo API keys and model eligibility
"""
import os

# Demo keys stored as Railway environment variables
# These keys are NEVER exposed in API responses or logs
DEMO_KEYS = {
    "google": os.getenv("DEMO_GOOGLE_KEY"),
    "groq": os.getenv("DEMO_GROQ_KEY"),
}

# Only these models can be used in demo mode
# Maps model ID to provider name
DEMO_MODELS = {
    "gemini/gemini-2.0-flash": "google",
    "groq/llama-3.3-70b-versatile": "groq",
}


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
