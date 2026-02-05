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
├── docs/              # Documentation
│   ├── roadmap.md     # Development roadmap
│   └── DEPLOYMENT.md  # Deployment guide
└── README.md
```

## Deployment

Ready to deploy your own instance? See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed instructions on deploying to Vercel (frontend) and Railway (backend).

Quick links:
- Frontend: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/datdiego/trialogue&project-name=trialogue&root-directory=frontend)
- Backend: Deploy on [Railway](https://railway.app)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you find this project helpful, consider:
- Starring the repository on [GitHub](https://github.com/datdiego/trialogue)
- Supporting development via [Ko-fi](https://ko-fi.com/datdiego)

## License

MIT
