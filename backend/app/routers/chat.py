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
    DebateRequest,
    DebateRound,
)
from app.services.llm import LLMService
from app.config import (
    DEMO_KEYS, DEMO_MODELS, get_demo_key, is_demo_model,
    check_demo_limit, record_demo_calls,
)

router = APIRouter()

# Get limiter from main app - will be set via dependency
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


@router.get("/demo-models")
async def get_demo_models(request: Request):
    """
    Return list of available demo models (no keys exposed).
    Only returns models where demo keys are actually configured.
    Also returns remaining demo calls for this session.
    """
    available = []
    for model_id, provider in DEMO_MODELS.items():
        if DEMO_KEYS.get(provider):
            available.append({"id": model_id, "provider": provider})

    client_ip = request.client.host if request.client else "unknown"
    _, remaining = check_demo_limit(client_ip, 0)

    return {"models": available, "remaining_calls": remaining}


@router.post("/chat")
@limiter.limit("30/minute")
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

    If no user key is provided but a demo key is available, the demo key is used.
    Demo requests have stricter rate limits (3/minute vs 10/minute for BYOK).
    """
    # Collect user-provided API keys
    user_api_keys = {
        "openai": x_openai_key,
        "anthropic": x_anthropic_key,
        "google": x_google_key,
        "groq": x_groq_key,
    }

    # Track which models are using demo keys
    demo_models_used = set()
    api_keys = user_api_keys.copy()

    # For each model, check if we need to use demo key
    for model in chat_request.models:
        # Get the provider for this model
        from app.services.llm import LLMService
        provider = LLMService._get_provider_from_model(model)

        # If user didn't provide a key for this provider, try demo key
        if provider and not user_api_keys.get(provider):
            demo_key = get_demo_key(model)
            if demo_key:
                api_keys[provider] = demo_key
                demo_models_used.add(model)

    is_demo_request = len(demo_models_used) > 0

    # Enforce demo session call limit
    if is_demo_request:
        client_ip = request.client.host if request.client else "unknown"
        num_calls = len(chat_request.models)
        allowed, remaining = check_demo_limit(client_ip, num_calls)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Demo session limit reached ({remaining} calls remaining). "
                       f"Add your own API keys for unlimited access."
            )
        record_demo_calls(client_ip, num_calls)

    async def generate():
        """Generate SSE stream with parallel model queries"""
        # Create a queue for multiplexing multiple streams
        queue: asyncio.Queue = asyncio.Queue()

        async def stream_model(model: str):
            """Stream from a single model and put chunks in queue"""
            try:
                is_demo = model in demo_models_used
                async for chunk in LLMService.chat_stream(
                    model=model,
                    messages=chat_request.messages,
                    api_keys=api_keys,
                    temperature=chat_request.temperature or 0.7,
                    max_tokens=chat_request.max_tokens or 1000,
                ):
                    # Mark chunk as demo if using demo key
                    chunk.is_demo = is_demo
                    await queue.put(chunk)
            except Exception as e:
                # Handle unexpected errors
                error_chunk = ChatStreamChunk(
                    model=model,
                    content="",
                    done=True,
                    error=f"Unexpected error: {str(e)}",
                    is_demo=model in demo_models_used,
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
                            is_demo=model in demo_models_used,
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


@router.post("/debate")
@limiter.limit("30/minute")
async def debate(
    debate_request: DebateRequest,
    request: Request,
    x_openai_key: Optional[str] = Header(None, alias="X-OpenAI-Key"),
    x_anthropic_key: Optional[str] = Header(None, alias="X-Anthropic-Key"),
    x_google_key: Optional[str] = Header(None, alias="X-Google-Key"),
    x_groq_key: Optional[str] = Header(None, alias="X-Groq-Key"),
):
    """
    Multi-round debate between AI models

    Round 1: All models answer the question independently
    Round 2: Each model reviews others' responses and identifies agreements/disagreements
    Round 3: All models generate a consensus summary
    """
    # Collect user-provided API keys
    user_api_keys = {
        "openai": x_openai_key,
        "anthropic": x_anthropic_key,
        "google": x_google_key,
        "groq": x_groq_key,
    }

    # Track which models are using demo keys
    demo_models_used = set()
    api_keys = user_api_keys.copy()

    # For each model, check if we need to use demo key
    for model in debate_request.models:
        provider = LLMService._get_provider_from_model(model)

        if provider and not user_api_keys.get(provider):
            demo_key = get_demo_key(model)
            if demo_key:
                api_keys[provider] = demo_key
                demo_models_used.add(model)

    # Enforce demo session call limit
    # Debate uses 3 rounds × N models = 3N API calls
    if len(demo_models_used) > 0:
        client_ip = request.client.host if request.client else "unknown"
        num_calls = len(debate_request.models) * 3  # 3 rounds
        allowed, remaining = check_demo_limit(client_ip, num_calls)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Demo session limit reached ({remaining} calls remaining). "
                       f"Add your own API keys for unlimited access."
            )
        record_demo_calls(client_ip, num_calls)

    async def generate_debate():
        """Generate multi-round debate stream"""
        queue: asyncio.Queue = asyncio.Queue()

        # Store responses from each round
        round1_responses = {}
        round2_responses = {}

        # === ROUND 1: Independent Answers ===
        async def stream_round1(model: str):
            """Stream Round 1 response from a single model"""
            try:
                is_demo = model in demo_models_used
                content_buffer = ""

                async for chunk in LLMService.chat_stream(
                    model=model,
                    messages=[{"role": "user", "content": debate_request.question}],
                    api_keys=api_keys,
                    temperature=debate_request.temperature or 0.7,
                    max_tokens=debate_request.max_tokens or 1000,
                ):
                    if not chunk.done:
                        content_buffer += chunk.content

                    debate_chunk = DebateRound(
                        round=1,
                        model=model,
                        content=chunk.content,
                        round_type="answer",
                        done=chunk.done,
                        error=chunk.error,
                        is_demo=is_demo,
                    )
                    await queue.put(debate_chunk)

                # Store full response for Round 2
                round1_responses[model] = content_buffer

            except Exception as e:
                error_chunk = DebateRound(
                    round=1,
                    model=model,
                    content="",
                    round_type="answer",
                    done=True,
                    error=f"Round 1 error: {str(e)}",
                    is_demo=model in demo_models_used,
                )
                await queue.put(error_chunk)
                round1_responses[model] = f"Error: {str(e)}"

        # Start Round 1 for all models
        tasks = [asyncio.create_task(stream_round1(model)) for model in debate_request.models]

        # Track completion
        completed_models = set()
        total_models = len(debate_request.models)

        # Process Round 1 chunks
        while len(completed_models) < total_models:
            try:
                chunk = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield f"data: {chunk.model_dump_json()}\n\n"

                if chunk.done:
                    completed_models.add(chunk.model)
            except asyncio.TimeoutError:
                for model in debate_request.models:
                    if model not in completed_models:
                        error_chunk = DebateRound(
                            round=1,
                            model=model,
                            content="",
                            round_type="answer",
                            done=True,
                            error="Stream timeout",
                            is_demo=model in demo_models_used,
                        )
                        yield f"data: {error_chunk.model_dump_json()}\n\n"
                        completed_models.add(model)
                        round1_responses[model] = "Error: Timeout"
                break

        await asyncio.gather(*tasks, return_exceptions=True)

        # === ROUND 2: Review & Critique ===
        async def stream_round2(model: str):
            """Stream Round 2 response (review) from a single model"""
            try:
                is_demo = model in demo_models_used

                # Build prompt with other models' responses
                other_responses = "\n\n".join([
                    f"Model: {other_model}\nResponse: {response}"
                    for other_model, response in round1_responses.items()
                    if other_model != model
                ])

                round2_prompt = f"""You were asked: "{debate_request.question}"

Your response was:
{round1_responses.get(model, "No response")}

Other AI models responded:
{other_responses}

Please review the other responses and provide:
1. **Points of Agreement**: Where you agree with other models
2. **Points of Disagreement**: Where you disagree, and why"""

                content_buffer = ""

                async for chunk in LLMService.chat_stream(
                    model=model,
                    messages=[{"role": "user", "content": round2_prompt}],
                    api_keys=api_keys,
                    temperature=debate_request.temperature or 0.7,
                    max_tokens=debate_request.max_tokens or 1000,
                ):
                    if not chunk.done:
                        content_buffer += chunk.content

                    debate_chunk = DebateRound(
                        round=2,
                        model=model,
                        content=chunk.content,
                        round_type="review",
                        done=chunk.done,
                        error=chunk.error,
                        is_demo=is_demo,
                    )
                    await queue.put(debate_chunk)

                round2_responses[model] = content_buffer

            except Exception as e:
                error_chunk = DebateRound(
                    round=2,
                    model=model,
                    content="",
                    round_type="review",
                    done=True,
                    error=f"Round 2 error: {str(e)}",
                    is_demo=model in demo_models_used,
                )
                await queue.put(error_chunk)
                round2_responses[model] = f"Error: {str(e)}"

        # Start Round 2 for all models
        tasks = [asyncio.create_task(stream_round2(model)) for model in debate_request.models]
        completed_models = set()

        # Process Round 2 chunks
        while len(completed_models) < total_models:
            try:
                chunk = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield f"data: {chunk.model_dump_json()}\n\n"

                if chunk.done:
                    completed_models.add(chunk.model)
            except asyncio.TimeoutError:
                for model in debate_request.models:
                    if model not in completed_models:
                        error_chunk = DebateRound(
                            round=2,
                            model=model,
                            content="",
                            round_type="review",
                            done=True,
                            error="Stream timeout",
                            is_demo=model in demo_models_used,
                        )
                        yield f"data: {error_chunk.model_dump_json()}\n\n"
                        completed_models.add(model)
                        round2_responses[model] = "Error: Timeout"
                break

        await asyncio.gather(*tasks, return_exceptions=True)

        # === ROUND 3: Consensus ===
        async def stream_round3(model: str):
            """Stream Round 3 response (consensus) from a single model"""
            try:
                is_demo = model in demo_models_used

                # Build full debate history
                round1_summary = "\n\n".join([
                    f"Model: {m}\nAnswer: {response}"
                    for m, response in round1_responses.items()
                ])

                round2_summary = "\n\n".join([
                    f"Model: {m}\nReview: {response}"
                    for m, response in round2_responses.items()
                ])

                round3_prompt = f"""Multiple AI models discussed this question: "{debate_request.question}"

Here is the full discussion:

ROUND 1 - Initial Answers:
{round1_summary}

ROUND 2 - Reviews and Critiques:
{round2_summary}

Based on this discussion, provide:
1. **Consensus**: Points all models agree on
2. **Remaining Disagreements**: Points where models still differ
3. **Final Answer**: A synthesized best answer incorporating all perspectives"""

                async for chunk in LLMService.chat_stream(
                    model=model,
                    messages=[{"role": "user", "content": round3_prompt}],
                    api_keys=api_keys,
                    temperature=debate_request.temperature or 0.7,
                    max_tokens=debate_request.max_tokens or 1000,
                ):
                    debate_chunk = DebateRound(
                        round=3,
                        model=model,
                        content=chunk.content,
                        round_type="consensus",
                        done=chunk.done,
                        error=chunk.error,
                        is_demo=is_demo,
                    )
                    await queue.put(debate_chunk)

            except Exception as e:
                error_chunk = DebateRound(
                    round=3,
                    model=model,
                    content="",
                    round_type="consensus",
                    done=True,
                    error=f"Round 3 error: {str(e)}",
                    is_demo=model in demo_models_used,
                )
                await queue.put(error_chunk)

        # Start Round 3 for all models
        tasks = [asyncio.create_task(stream_round3(model)) for model in debate_request.models]
        completed_models = set()

        # Process Round 3 chunks
        while len(completed_models) < total_models:
            try:
                chunk = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield f"data: {chunk.model_dump_json()}\n\n"

                if chunk.done:
                    completed_models.add(chunk.model)
            except asyncio.TimeoutError:
                for model in debate_request.models:
                    if model not in completed_models:
                        error_chunk = DebateRound(
                            round=3,
                            model=model,
                            content="",
                            round_type="consensus",
                            done=True,
                            error="Stream timeout",
                            is_demo=model in demo_models_used,
                        )
                        yield f"data: {error_chunk.model_dump_json()}\n\n"
                        completed_models.add(model)
                break

        await asyncio.gather(*tasks, return_exceptions=True)

        # Send final done signal
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_debate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
