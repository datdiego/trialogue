# Trialogue — CLAUDE.md

Multi-LLM chat interface. Users chat with up to 3 AI models simultaneously, compare responses, and run multi-round debates.

## Tech Stack

- **Backend:** Python 3.10, FastAPI, LiteLLM, SSE streaming
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Package Management:** pip/uv (backend), npm (frontend)
- **Python venv:** `~/.venv/` at project root (managed by uv, Python 3.10)
- **Deployment:** Vercel (frontend, auto-deploys from GitHub), Railway (backend)

## Key Paths

| Path | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI entry point |
| `backend/app/routers/chat.py` | Chat + debate + demo-models endpoints |
| `backend/app/services/llm.py` | LiteLLM wrapper, provider routing |
| `backend/app/config.py` | Demo keys, demo models, rate limits |
| `backend/app/models/schemas.py` | Pydantic schemas |
| `backend/tests/` | Pytest test suite |
| `frontend/components/` | React components (ChatInterface, DebateView, ModelSelector, SettingsModal) |
| `frontend/lib/api.ts` | API client (chat, debate, demo models, key validation) |
| `frontend/lib/storage.ts` | localStorage helpers for API keys |

## Commands

```bash
# Backend
.venv/bin/uvicorn backend.app.main:app --reload --port 8000

# Backend tests
.venv/bin/pytest backend/tests/ -q

# Frontend
cd frontend && npm run dev
```

## Design System

- **Theme:** `mexican-bright` (light, bold, playful)
- **Source:** `~/design/` repo
- Use semantic CSS tokens only (`var(--accent)`, `var(--background)`, etc.)
- NEVER hardcode hex values in components
- See `~/design/DESIGN_BRIEF.md` for brand guidelines

## Architecture Notes

- BYOK model: users provide their own API keys (stored in browser localStorage only)
- Demo mode: Groq models only (llama-3.3-70b, llama-3.1-8b, kimi-k2, gpt-oss-120b, qwen3-32b)
- Gemini is NOT a demo provider — removed from frontend entirely
- Demo keys stored as Railway env vars, never exposed in responses
- Rate limits: demo 5 calls/session/IP, BYOK 10/min, debate 3/min BYOK
- Two view modes: Parallel (side-by-side) and Debate (3-round multi-model)
- SSE streaming for all chat/debate responses

## Rules

- NEVER add Co-Authored-By to git commits
- NEVER expose demo API keys in responses or logs
- Gemini must NOT appear in the frontend (no model selector entries, no settings provider)
- Follow existing code patterns
- Test with `.venv/bin/pytest` before marking complete
- Commit after each logical unit of work
- Update `~/orchestrator/workers/trialogue/PROGRESS.md` with structured format after each unit
