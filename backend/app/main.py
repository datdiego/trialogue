"""
Trialogue Backend - FastAPI Application
Provides streaming chat endpoints for multiple LLM providers
"""

import os
from fastapi import FastAPI
from starlette.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat

app = FastAPI(
    title="Trialogue API",
    description="Multi-LLM chat interface backend",
    version="0.1.0"
)

def _parse_extra_cors_origins(raw: str) -> list[str]:
    """Parse and validate CORS origins from environment."""
    origins: list[str] = []
    for candidate in [o.strip() for o in raw.split(",") if o.strip()]:
        if candidate.startswith("http://") or candidate.startswith("https://"):
            origins.append(candidate)
    return origins


# CORS configuration for frontend
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://trialogue-dun.vercel.app",
]

# Add any extra origins from environment (comma-separated)
extra_origins = os.getenv("CORS_ORIGINS", "")
if extra_origins:
    CORS_ORIGINS.extend(_parse_extra_cors_origins(extra_origins))

cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # Production should prefer explicit allow_origins.
    # If preview domains are needed, set CORS_ORIGIN_REGEX explicitly.
    allow_origin_regex=cors_origin_regex,
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


@app.middleware("http")
async def add_security_headers(request, call_next):
    """Set baseline security headers for all backend responses."""
    response: Response = await call_next(request)
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response

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
