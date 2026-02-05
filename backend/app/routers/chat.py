"""
Chat Router
Handles chat and key validation endpoints
"""

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional
import json
import asyncio

from app.models.schemas import (
    ChatRequest,
    ChatStreamChunk,
    ValidateKeyRequest,
    ValidateKeyResponse,
)
from app.services.llm import LLMService

router = APIRouter()

# Get limiter from main app - will be set via dependency
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


@router.post("/chat")
@limiter.limit("10/minute")  # 10 requests per minute per IP
async def chat(
    chat_request: ChatRequest,
    request: Request,
    x_openai_key: Optional[str] = Header(None, alias="X-OpenAI-Key"),
    x_anthropic_key: Optional[str] = Header(None, alias="X-Anthropic-Key"),
    x_google_key: Optional[str] = Header(None, alias="X-Google-Key"),
    x_groq_key: Optional[str] = Header(None, alias="X-Groq-Key"),
):
    """
    Stream chat responses from multiple models in parallel

    API keys are passed in headers for security:
    - X-OpenAI-Key: OpenAI API key
    - X-Anthropic-Key: Anthropic API key
    - X-Google-Key: Google AI API key
    - X-Groq-Key: Groq API key
    """
    # Collect API keys
    api_keys = {
        "openai": x_openai_key,
        "anthropic": x_anthropic_key,
        "google": x_google_key,
        "groq": x_groq_key,
    }

    async def generate():
        """Generate SSE stream with parallel model queries"""
        # Create a queue for multiplexing multiple streams
        queue: asyncio.Queue = asyncio.Queue()

        async def stream_model(model: str):
            """Stream from a single model and put chunks in queue"""
            try:
                async for chunk in LLMService.chat_stream(
                    model=model,
                    messages=chat_request.messages,
                    api_keys=api_keys,
                    temperature=chat_request.temperature or 0.7,
                    max_tokens=chat_request.max_tokens or 1000,
                ):
                    await queue.put(chunk)
            except Exception as e:
                # Handle unexpected errors
                error_chunk = ChatStreamChunk(
                    model=model,
                    content="",
                    done=True,
                    error=f"Unexpected error: {str(e)}",
                )
                await queue.put(error_chunk)

        # Start all model streams in parallel
        tasks = [asyncio.create_task(stream_model(model)) for model in chat_request.models]

        # Track completion
        completed_models = set()
        total_models = len(chat_request.models)

        # Process chunks as they arrive
        while len(completed_models) < total_models:
            try:
                # Wait for next chunk with timeout
                chunk = await asyncio.wait_for(queue.get(), timeout=60.0)

                # Send chunk to client
                yield f"data: {chunk.model_dump_json()}\n\n"

                # Track completed models
                if chunk.done:
                    completed_models.add(chunk.model)

            except asyncio.TimeoutError:
                # Timeout waiting for chunks - likely a stalled stream
                for model in chat_request.models:
                    if model not in completed_models:
                        error_chunk = ChatStreamChunk(
                            model=model,
                            content="",
                            done=True,
                            error="Stream timeout",
                        )
                        yield f"data: {error_chunk.model_dump_json()}\n\n"
                        completed_models.add(model)
                break

        # Wait for all tasks to complete
        await asyncio.gather(*tasks, return_exceptions=True)

        # Send final done signal
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/validate-key", response_model=ValidateKeyResponse)
@limiter.limit("5/minute")  # Stricter limit for validation - 5 requests per minute per IP
async def validate_key(http_request: Request, request: ValidateKeyRequest):
    """
    Validate an API key and return available models

    This endpoint makes a test API call to verify the key works.
    """
    valid, models, error = await LLMService.validate_api_key(
        provider=request.provider,
        api_key=request.key,
    )

    return ValidateKeyResponse(
        valid=valid,
        models=models,
        error=error,
    )
