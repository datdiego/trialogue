"""
Pydantic Models for Request/Response Schemas
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class Message(BaseModel):
    """Chat message schema"""
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    """Request schema for /api/chat endpoint"""
    messages: List[Message] = Field(..., min_length=1)
    models: List[str] = Field(..., min_length=1, max_length=3)
    stream: bool = True
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)


class ChatStreamChunk(BaseModel):
    """Streaming response chunk"""
    model: str
    delta: str
    done: bool = False


class ValidateKeyRequest(BaseModel):
    """Request schema for /api/validate-key endpoint"""
    provider: Literal["openai", "anthropic", "google", "groq"]
    key: str


class ValidateKeyResponse(BaseModel):
    """Response schema for key validation"""
    valid: bool
    models: Optional[List[str]] = None
    error: Optional[str] = None
