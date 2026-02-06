"""
Pydantic Models for Request/Response Schemas
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class Message(BaseModel):
    """Chat message schema"""
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1, max_length=32000)  # Limit message content length


class ChatRequest(BaseModel):
    """Request schema for /api/chat endpoint"""
    messages: List[Message] = Field(..., min_length=1, max_length=50)  # Limit number of messages
    models: List[str] = Field(..., min_length=1, max_length=3)
    stream: bool = True
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)

    @field_validator('models')
    @classmethod
    def validate_models(cls, v):
        """Validate that model names follow expected patterns"""
        from app.services.llm import PROVIDER_PREFIXES

        for model in v:
            valid = any(
                model.lower().startswith(prefix.lower())
                for prefixes in PROVIDER_PREFIXES.values()
                for prefix in prefixes
            )
            if not valid:
                raise ValueError(f"Unknown model: {model}")
        return v


class ChatStreamChunk(BaseModel):
    """Streaming response chunk"""
    model: str
    content: str  # Changed from 'delta' to match frontend expectations
    done: bool = False
    error: Optional[str] = None  # Optional error message
    is_demo: bool = False  # Whether this request is using demo keys


class ValidateKeyRequest(BaseModel):
    """Request schema for /api/validate-key endpoint"""
    provider: Literal["openai", "anthropic", "google", "groq"]
    key: str


class ValidateKeyResponse(BaseModel):
    """Response schema for key validation"""
    valid: bool
    models: Optional[List[str]] = None
    error: Optional[str] = None
