"""
Trialogue Backend - FastAPI Application
Provides streaming chat endpoints for multiple LLM providers
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import chat

app = FastAPI(
    title="Trialogue API",
    description="Multi-LLM chat interface backend",
    version="0.1.0"
)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration for frontend
# Development origins
CORS_ORIGINS_DEV = [
    "http://localhost:3000",  # Next.js dev server
    "http://127.0.0.1:3000",
]

# Production origins from environment variable (comma-separated)
CORS_ORIGINS_PROD = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []

# Determine if we're in debug mode
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Use dev origins in debug mode, prod origins otherwise
allowed_origins = CORS_ORIGINS_DEV if DEBUG else CORS_ORIGINS_PROD

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],  # Only needed methods
    allow_headers=[
        "Content-Type",
        "X-OpenAI-Key",
        "X-Anthropic-Key",
        "X-Google-Key",
        "X-Groq-Key",
    ],
)

# Include routers
app.include_router(chat.router, prefix="/api", tags=["chat"])


@app.get("/")
async def root():
    return {
        "message": "Trialogue API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
