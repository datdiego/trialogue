# Trialogue Deployment Guide

This guide covers deploying Trialogue to production using Vercel (frontend) and Railway (backend).

## Architecture Overview

- **Frontend**: Next.js 16 app deployed on Vercel
- **Backend**: FastAPI app deployed on Railway
- **Database**: None (BYOK architecture - keys stored client-side only)

## Frontend Deployment (Vercel)

### Prerequisites
- GitHub account
- Vercel account (free tier is sufficient)
- Repository pushed to GitHub

### Environment Variables

The frontend requires one environment variable:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://trialogue-backend.railway.app` |

### Deployment Steps

1. **Connect Repository to Vercel**
   ```bash
   # Option 1: Use Vercel CLI
   npm install -g vercel
   cd frontend
   vercel

   # Option 2: Use Vercel Dashboard
   # Visit https://vercel.com/new
   # Import your GitHub repository
   # Select the 'frontend' directory as root
   ```

2. **Configure Build Settings**
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

3. **Set Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add `NEXT_PUBLIC_API_URL` with your Railway backend URL
   - Add to all environments (Production, Preview, Development)

4. **Deploy**
   - Push to main branch to trigger automatic deployment
   - Or use `vercel --prod` from CLI

### Vercel Analytics

Vercel Analytics is already integrated (free tier). It will automatically start collecting data once deployed.

### Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed by Vercel

---

## Backend Deployment (Railway)

### Prerequisites
- Railway account (free trial available)
- GitHub repository

### Environment Variables

The backend does NOT require any environment variables for deployment. All API keys are provided by users via the frontend (BYOK architecture).

Optional environment variables for configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8000` |
| `HOST` | Server host | `0.0.0.0` |
| `LITELLM_LOG` | Enable LiteLLM logging | `INFO` |

### Deployment Steps

1. **Create New Project on Railway**
   ```
   1. Visit https://railway.app
   2. Click "New Project"
   3. Select "Deploy from GitHub repo"
   4. Choose your Trialogue repository
   ```

2. **Configure Service**
   - **Root Directory**: `backend`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

3. **Add Railway Configuration**

   Railway uses `railway.toml` for configuration (already created):
   ```toml
   [build]
   builder = "NIXPACKS"
   buildCommand = "pip install -r requirements.txt"

   [deploy]
   startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
   healthcheckPath = "/health"
   healthcheckTimeout = 100
   restartPolicyType = "ON_FAILURE"
   restartPolicyMaxRetries = 10
   ```

4. **Deploy**
   - Railway will automatically detect Python and install dependencies
   - Deployment starts automatically
   - Get your Railway URL from the dashboard (e.g., `https://trialogue-backend.railway.app`)

5. **Update Frontend Environment**
   - Copy your Railway URL
   - Update `NEXT_PUBLIC_API_URL` in Vercel
   - Redeploy frontend

### Health Check

Railway will use the `/health` endpoint to monitor backend status.

Test it manually:
```bash
curl https://your-backend-url.railway.app/health
# Expected: {"status": "healthy"}
```

---

## Post-Deployment Configuration

### CORS Setup

The backend is configured to allow requests from any origin during development. For production, update CORS settings in `/backend/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-frontend-domain.vercel.app",
        "https://trialogue.com",  # Your custom domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Monitoring

1. **Vercel Analytics**
   - View analytics at vercel.com/dashboard → Your Project → Analytics
   - Free tier includes basic page views and web vitals

2. **Railway Logs**
   - View logs in Railway dashboard → Your Service → Deployments
   - Monitor for errors and performance issues

---

## Environment Variables Reference

### Frontend (.env.local for local development)

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000  # Local
# NEXT_PUBLIC_API_URL=https://your-backend.railway.app  # Production
```

### Backend (.env for local development)

```bash
# No required environment variables!
# API keys are provided by users via frontend (BYOK)

# Optional configuration
PORT=8000
HOST=0.0.0.0
LITELLM_LOG=INFO
```

---

## Deployment Checklist

### Before Deployment

- [ ] Frontend builds successfully (`npm run build`)
- [ ] Backend starts successfully (`uvicorn app.main:app`)
- [ ] All tests pass (if any)
- [ ] Environment variables documented
- [ ] CORS configured for production domain

### Frontend Deployment

- [ ] Repository connected to Vercel
- [ ] Build settings configured
- [ ] `NEXT_PUBLIC_API_URL` environment variable set
- [ ] Deployment successful
- [ ] Test: Visit frontend URL and verify UI loads

### Backend Deployment

- [ ] Railway project created
- [ ] Railway configuration (`railway.toml`) present
- [ ] Deployment successful
- [ ] Test: `curl https://backend-url.railway.app/health`
- [ ] Test: Validate API endpoint via frontend

### Final Verification

- [ ] Frontend connects to backend successfully
- [ ] API key validation works
- [ ] Chat streaming works with at least one model
- [ ] All three view modes work (Parallel, Comparison, Debate)
- [ ] Dark mode toggle works
- [ ] Settings persist after page refresh
- [ ] GitHub star link works
- [ ] Ko-fi donation link works
- [ ] Vercel Analytics tracking (check after 24 hours)

---

## Troubleshooting

### Frontend Issues

**Build fails with module errors**
- Check that all dependencies are in `package.json`
- Verify Node.js version matches local development (v20+)
- Clear Vercel build cache and redeploy

**"Failed to fetch" errors**
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Check CORS configuration in backend
- Verify backend is running and accessible

### Backend Issues

**Module not found errors**
- Verify all dependencies in `requirements.txt`
- Check Python version (3.10+)
- Railway automatically installs from requirements.txt

**Health check failing**
- Verify `/health` endpoint returns 200
- Check Railway logs for startup errors
- Increase `healthcheckTimeout` if needed

**API calls failing**
- Check Railway logs for errors
- Verify CORS allows your frontend domain
- Test with curl to isolate frontend vs backend issue

### Common Issues

**CORS errors in browser console**
- Update `allow_origins` in `app/main.py`
- Redeploy backend
- Clear browser cache

**API keys not working**
- Keys are stored client-side only
- Check browser localStorage
- Try re-entering keys in Settings

---

## Cost Estimation

### Vercel (Frontend)
- **Free Tier**: 100GB bandwidth, unlimited requests
- **Analytics**: Free tier included
- **Estimated Cost**: $0/month for most use cases

### Railway (Backend)
- **Free Trial**: $5 credit (500 hours of usage)
- **Starter Plan**: $5/month after trial
- **Usage-Based**: ~$0.000231/minute ($10/month for continuous use)
- **Estimated Cost**: $5-10/month depending on traffic

### Total Estimated Cost
- **Development/Low Traffic**: $0-5/month
- **Production/Medium Traffic**: $5-10/month
- **Note**: No API costs - users provide their own keys (BYOK)

---

## Rollback Procedure

### Frontend Rollback
1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### Backend Rollback
1. Go to Railway Dashboard → Deployments
2. Click on previous deployment
3. Click "Redeploy"

Or use git:
```bash
git revert <commit-hash>
git push origin main
```

---

## Support

- **Documentation**: `/docs/README.md`
- **Issues**: GitHub Issues
- **Backend Logs**: Railway Dashboard
- **Frontend Logs**: Vercel Dashboard → Functions → Logs
