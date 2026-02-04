"""
Chat Router
Handles chat and key validation endpoints
"""

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
import json

from app.models.schemas import (
    ChatRequest,
    ChatStreamChunk,
    ValidateKeyRequest,
    ValidateKeyResponse,
)
from app.services.llm import LLMService

router = APIRouter()


@router.post("/chat")
async def chat(
    request: ChatRequest,
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

    # TODO: Implement parallel streaming from multiple models
    # TODO: Multiplex streams into single SSE response
    # TODO: Handle errors per-model gracefully

    async def generate():
        """Generate SSE stream"""
        for model in request.models:
            async for chunk in LLMService.chat_stream(
                model=model,
                messages=request.messages,
                api_keys=api_keys,
                temperature=request.temperature or 0.7,
                max_tokens=request.max_tokens or 1000,
            ):
                # Send as SSE format
                yield f"data: {chunk.model_dump_json()}\n\n"

        # Send done signal
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
async def validate_key(request: ValidateKeyRequest):
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
