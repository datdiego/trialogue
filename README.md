# Trialogue

A multi-LLM "AI Think Tank" where users bring their own API keys to facilitate three-way conversations between top-tier models.

## Features

- **BYOK (Bring Your Own Key)**: Users manage their own API costs
- **Zero-Persistence Security**: API keys never stored on server
- **Multi-Model Debates**: Compare responses from different LLM architectures
- **Free-Tier Optimization**: Auto-detect models with free usage tiers

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS
- **Backend**: FastAPI (Python) + LiteLLM
- **Storage**: LocalStorage for keys (no server-side storage)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- API keys for desired providers (OpenAI, Anthropic, Google, etc.)

### Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Project Structure

```
├── frontend/          # Next.js application
├── backend/           # FastAPI server
└── README.md
```

## License

MIT
