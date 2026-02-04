# Trialogue Backend

FastAPI backend with LiteLLM integration for multi-model chat.

## Development Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Structure

```
app/
├── main.py              # FastAPI application
├── routers/
│   └── chat.py          # Chat and validation endpoints
├── services/
│   └── llm.py           # LiteLLM wrapper service
└── models/
    └── schemas.py       # Pydantic request/response models
```

## Endpoints

### POST /api/chat
Stream chat responses from multiple models in parallel.

**Headers:**
- `X-OpenAI-Key`: OpenAI API key
- `X-Anthropic-Key`: Anthropic API key
- `X-Google-Key`: Google AI API key
- `X-Groq-Key`: Groq API key

**Request Body:**
```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "models": ["gpt-4", "claude-3-opus", "gemini-pro"],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:** Server-Sent Events (SSE) stream

### POST /api/validate-key
Validate an API key and get available models.

**Request Body:**
```json
{
  "provider": "openai",
  "key": "sk-..."
}
```

**Response:**
```json
{
  "valid": true,
  "models": ["gpt-4", "gpt-3.5-turbo"],
  "error": null
}
```

## Docker

```bash
docker build -t trialogue-backend .
docker run -p 8000:8000 trialogue-backend
```

## Security Notes

- API keys are NEVER stored on the backend
- Keys are passed via HTTP headers only
- Keys are NEVER logged or echoed in responses
- HTTPS required for production deployment
