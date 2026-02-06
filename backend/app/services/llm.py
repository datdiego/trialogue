"""
LLM Service using LiteLLM
Wrapper around LiteLLM for consistent multi-provider access
"""

from typing import AsyncGenerator, Dict, List, Optional
import litellm
from litellm import acompletion
from app.models.schemas import Message, ChatStreamChunk
import logging

# Configure LiteLLM
litellm.set_verbose = False  # Set to True for debugging
litellm.drop_params = True  # Drop unsupported params instead of erroring

# Configure logger
logger = logging.getLogger(__name__)

# Safe error messages to prevent information disclosure
SAFE_ERROR_MESSAGES = {
    "auth": "Authentication failed. Please check your API key.",
    "rate_limit": "Rate limit exceeded. Please try again later.",
    "bad_request": "Invalid request parameters.",
    "generic": "An error occurred processing your request.",
    "no_key": "No API key provided for this model.",
}

# Provider to model prefix mapping
PROVIDER_PREFIXES = {
    "openai": ["gpt-", "o1-"],
    "anthropic": ["claude-"],
    "google": ["gemini-", "gemini/", "models/gemini-"],
    "groq": ["llama", "mixtral", "gemma", "groq/"],
}

# Model lists for validation responses
PROVIDER_MODELS = {
    "openai": [
        "gpt-4-turbo-preview",
        "gpt-4",
        "gpt-3.5-turbo",
        "gpt-4o",
        "gpt-4o-mini",
    ],
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
    ],
    "google": [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-pro",
    ],
    "groq": [
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
    ],
}


class LLMService:
    """Service for interacting with multiple LLM providers"""

    @staticmethod
    def _get_provider_from_model(model: str) -> Optional[str]:
        """Determine provider from model name"""
        for provider, prefixes in PROVIDER_PREFIXES.items():
            for prefix in prefixes:
                if model.lower().startswith(prefix):
                    return provider
        return None

    @staticmethod
    def _get_api_key_for_model(model: str, api_keys: Dict[str, Optional[str]]) -> Optional[str]:
        """Get the appropriate API key for a model"""
        provider = LLMService._get_provider_from_model(model)
        if not provider:
            return None
        return api_keys.get(provider)

    @staticmethod
    async def chat_stream(
        model: str,
        messages: List[Message],
        api_keys: Dict[str, Optional[str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        Stream chat completion from a single model

        Args:
            model: Model identifier (e.g., "gpt-4", "claude-3-opus")
            messages: List of chat messages
            api_keys: Dictionary of API keys by provider
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Yields:
            ChatStreamChunk objects with streaming deltas
        """
        try:
            # Get the appropriate API key
            api_key = LLMService._get_api_key_for_model(model, api_keys)
            if not api_key:
                logger.warning(f"No API key provided for model {model}")
                yield ChatStreamChunk(
                    model=model,
                    content="",
                    done=True,
                    error=SAFE_ERROR_MESSAGES["no_key"],
                )
                return

            # Convert messages to dict format for LiteLLM
            formatted_messages = [msg.model_dump() for msg in messages]

            # Call LiteLLM with streaming
            response = await acompletion(
                model=model,
                messages=formatted_messages,
                api_key=api_key,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )

            # Stream the response
            async for chunk in response:
                if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                    delta_content = chunk.choices[0].delta.content
                    if delta_content:
                        yield ChatStreamChunk(
                            model=model,
                            content=delta_content,
                            done=False,
                        )

            # Send completion signal
            yield ChatStreamChunk(model=model, content="", done=True)

        except litellm.exceptions.AuthenticationError as e:
            logger.warning(f"Authentication error for {model}: {str(e)}")
            yield ChatStreamChunk(
                model=model,
                content="",
                done=True,
                error=SAFE_ERROR_MESSAGES["auth"],
            )
        except litellm.exceptions.RateLimitError as e:
            logger.warning(f"Rate limit error for {model}: {str(e)}")
            yield ChatStreamChunk(
                model=model,
                content="",
                done=True,
                error=SAFE_ERROR_MESSAGES["rate_limit"],
            )
        except litellm.exceptions.BadRequestError as e:
            logger.error(f"Bad request for {model}: {str(e)}")
            yield ChatStreamChunk(
                model=model,
                content="",
                done=True,
                error=SAFE_ERROR_MESSAGES["bad_request"],
            )
        except Exception as e:
            logger.error(f"Unexpected error for {model}: {str(e)}", exc_info=True)
            yield ChatStreamChunk(
                model=model,
                content="",
                done=True,
                error=SAFE_ERROR_MESSAGES["generic"],
            )

    @staticmethod
    async def validate_api_key(provider: str, api_key: str) -> tuple[bool, Optional[List[str]], Optional[str]]:
        """
        Validate an API key for a given provider

        Args:
            provider: Provider name (openai, anthropic, google, groq)
            api_key: API key to validate

        Returns:
            Tuple of (valid, available_models, error_message)
        """
        try:
            # Get a test model for this provider
            test_models = PROVIDER_MODELS.get(provider, [])
            if not test_models:
                return False, None, f"Unknown provider: {provider}"

            test_model = test_models[0]

            # Make a minimal test call
            response = await acompletion(
                model=test_model,
                messages=[{"role": "user", "content": "test"}],
                api_key=api_key,
                max_tokens=1,
                stream=False,
            )

            # If we got here, the key is valid
            return True, test_models, None

        except litellm.exceptions.AuthenticationError as e:
            logger.warning(f"Key validation failed for {provider}: {str(e)}")
            return False, None, "Invalid API key"
        except litellm.exceptions.RateLimitError as e:
            logger.warning(f"Rate limit during validation for {provider}: {str(e)}")
            # Rate limit means the key is valid but quota exceeded
            return True, test_models, "Rate limit exceeded (but key is valid)"
        except Exception as e:
            logger.error(f"Unexpected error during key validation for {provider}: {str(e)}", exc_info=True)
            return False, None, "Validation failed. Please try again."
