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
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://trialogue-dun.vercel.app",
]

# Add any extra origins from environment (comma-separated)
extra_origins = os.getenv("CORS_ORIGINS", "")
if extra_origins:
    CORS_ORIGINS.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://trialogue-.*\.vercel\.app",  # All Vercel preview deployments
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
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
