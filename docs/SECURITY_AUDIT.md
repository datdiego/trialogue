# Security Audit Report - Trialogue Application

**Audit Date:** February 5, 2026
**Application:** Trialogue Multi-LLM Chat Interface
**Scope:** Backend (FastAPI), Frontend (Next.js), BYOK Architecture

---

## Executive Summary

This security audit evaluated the Trialogue application across multiple attack surfaces including API security, input validation, authentication handling, and dependency management. The application implements a Bring-Your-Own-Key (BYOK) architecture where users provide their own API keys for LLM providers.

**Overall Security Posture:** Medium Risk

The application demonstrates good security practices in several areas but has critical vulnerabilities that should be addressed before production deployment.

---

## Critical Findings

### 🔴 CRITICAL-01: Overly Permissive CORS Configuration

**File:** `backend/app/main.py:17-26`

**Issue:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],  # ⚠️ Allows ALL methods
    allow_headers=["*"],  # ⚠️ Allows ALL headers
)
```

**Risk:** The wildcard configuration (`["*"]`) for methods and headers is overly permissive. While `allow_origins` is properly restricted for local development, this needs updating for production.

**Impact:**
- Allows any HTTP method (GET, POST, PUT, DELETE, etc.)
- Allows any custom headers
- Production deployment would require hardcoded frontend URLs

**Recommendation:**
```python
# For development
CORS_ORIGINS_DEV = ["http://localhost:3000", "http://127.0.0.1:3000"]
# For production - use environment variable
CORS_ORIGINS_PROD = os.getenv("CORS_ORIGINS", "").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS_DEV if DEBUG else CORS_ORIGINS_PROD,
    allow_credentials=True,
    allow_methods=["POST", "GET"],  # Only needed methods
    allow_headers=[
        "Content-Type",
        "X-OpenAI-Key",
        "X-Anthropic-Key",
        "X-Google-Key",
        "X-Groq-Key"
    ],
)
```

---

### 🔴 CRITICAL-02: No Rate Limiting

**File:** `backend/app/main.py`, `backend/app/routers/chat.py`

**Issue:** The API endpoints have no rate limiting implemented. Both `/api/chat` and `/api/validate-key` can be abused.

**Risk:**
- Denial of Service (DoS) attacks
- Resource exhaustion from malicious actors
- Abuse of key validation endpoint
- Cost implications from unlimited LLM API calls

**Impact:**
- Attacker can flood the server with requests
- No protection against brute force attacks
- API costs could spiral out of control

**Recommendation:**
Implement rate limiting using `slowapi`:

```python
# Add to requirements.txt
slowapi==0.1.9

# In main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# In routers/chat.py
@router.post("/chat")
@limiter.limit("10/minute")  # 10 requests per minute per IP
async def chat(request: Request, ...):
    ...

@router.post("/validate-key")
@limiter.limit("5/minute")  # Stricter limit for validation
async def validate_key(request: Request, ...):
    ...
```

---

### 🔴 CRITICAL-03: API Keys Stored in Browser localStorage

**File:** `frontend/lib/storage.ts:23-43`

**Issue:** API keys are stored in browser's `localStorage` as plain JSON strings.

**Risk:**
```typescript
setApiKeys(keys: ApiKeys): void {
    localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(keys));
}
```

**Impact:**
- XSS attacks can access `localStorage` and steal API keys
- Keys persist indefinitely unless manually cleared
- Browser extensions can read `localStorage`
- No encryption at rest
- Keys visible in browser dev tools

**Recommendation:**
While localStorage is the pragmatic choice for a BYOK architecture, implement additional protections:

1. **Add security warnings in UI:**
```typescript
// In SettingsModal.tsx
<div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
  <p className="text-sm text-yellow-800">
    ⚠️ API keys are stored locally in your browser. Only use trusted devices.
    Never share your screen while keys are visible.
  </p>
</div>
```

2. **Consider sessionStorage for high-security use cases:**
```typescript
// Add option to use sessionStorage (keys cleared on tab close)
export const storage = {
  useSessionStorage: false, // User preference

  getStorage() {
    return this.useSessionStorage ? sessionStorage : localStorage;
  },

  getApiKeys(): ApiKeys {
    const storage = this.getStorage();
    const stored = storage.getItem(STORAGE_KEYS.API_KEYS);
    return stored ? JSON.parse(stored) : {};
  }
}
```

3. **Implement auto-clear option:**
```typescript
// Clear keys after N hours of inactivity
setApiKeyWithExpiry(provider: keyof ApiKeys, key: string, hours: number = 24) {
  const keys = this.getApiKeys();
  keys[provider] = {
    value: key,
    expiry: Date.now() + (hours * 60 * 60 * 1000)
  };
  this.setApiKeys(keys);
}
```

---

### 🟠 HIGH-01: Missing Content Security Policy (CSP)

**File:** `frontend/app/layout.tsx`, `frontend/next.config.ts`

**Issue:** No Content Security Policy headers are configured, leaving the application vulnerable to XSS attacks.

**Risk:**
- Cross-Site Scripting (XSS) attacks
- Injection of malicious scripts
- Data exfiltration
- Clickjacking

**Recommendation:**
Add CSP headers in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' va.vercel-scripts.com", // Vercel Analytics
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://va.vercel-analytics.com http://localhost:8000 https://*.railway.app",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};
```

---

### 🟠 HIGH-02: Insufficient Input Validation

**File:** `backend/app/models/schemas.py:15-21`

**Issue:** While Pydantic provides basic validation, there are no constraints on message content length or complexity.

**Risk:**
```python
class ChatRequest(BaseModel):
    messages: List[Message] = Field(..., min_length=1)
    models: List[str] = Field(..., min_length=1, max_length=3)
    stream: bool = True
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)
```

**Issues:**
- No max length on `messages` list (could send thousands of messages)
- No validation on `Message.content` length (could send megabytes)
- No validation on `models` list values (could send arbitrary strings)
- No validation that model names are legitimate

**Impact:**
- Memory exhaustion attacks
- Database/log bloat
- Excessive API costs
- DoS via large payloads

**Recommendation:**
```python
class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1, max_length=32000)  # Add limit

class ChatRequest(BaseModel):
    messages: List[Message] = Field(..., min_length=1, max_length=50)  # Add limit
    models: List[str] = Field(..., min_length=1, max_length=3)
    stream: bool = True
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)

    @validator('models')
    def validate_models(cls, v):
        # Validate against known model list
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
```

---

### 🟠 HIGH-03: API Keys Transmitted in Headers

**File:** `frontend/lib/api.ts:119-122`, `backend/app/routers/chat.py:26-29`

**Issue:** API keys are sent in custom headers on every request.

**Current Implementation:**
```typescript
// Add API keys as headers
if (apiKeys.openai) headers['X-OpenAI-Key'] = apiKeys.openai;
if (apiKeys.anthropic) headers['X-Anthropic-Key'] = apiKeys.anthropic;
```

**Risk:**
- Headers logged by proxies/load balancers
- Headers visible in browser dev tools
- Risk of leakage in error messages
- Headers may be cached

**Mitigation:**
The current approach is acceptable for BYOK architecture, but:

1. **Ensure HTTPS in production** (TLS protects headers in transit)
2. **Add logging safeguards:**

```python
# In backend
import logging

class SecureFormatter(logging.Formatter):
    """Filter out API keys from logs"""
    def format(self, record):
        message = super().format(record)
        # Redact API keys
        for pattern in ['sk-[a-zA-Z0-9]+', 'sk-ant-[a-zA-Z0-9]+', 'gsk_[a-zA-Z0-9]+']:
            message = re.sub(pattern, '[REDACTED]', message)
        return message
```

3. **Consider request signing** for additional security (HMAC-based authentication)

---

### 🟠 HIGH-04: Error Messages Leak Implementation Details

**File:** `backend/app/services/llm.py:133-160`

**Issue:** Error messages expose internal details and raw error strings.

**Risk:**
```python
except litellm.exceptions.BadRequestError as e:
    yield ChatStreamChunk(
        model=model,
        content="",
        done=True,
        error=f"Bad request for {model} - {str(e)}",  # Exposes raw error
    )
except Exception as e:
    yield ChatStreamChunk(
        model=model,
        content="",
        done=True,
        error=str(e),  # Exposes ANY exception details
    )
```

**Impact:**
- Information disclosure
- Attacker can learn about backend implementation
- May expose API keys if they appear in error messages
- Stack traces could be leaked

**Recommendation:**
```python
import logging

logger = logging.getLogger(__name__)

# Define safe error messages
SAFE_ERROR_MESSAGES = {
    "auth": "Authentication failed. Please check your API key.",
    "rate_limit": "Rate limit exceeded. Please try again later.",
    "bad_request": "Invalid request parameters.",
    "generic": "An error occurred processing your request.",
}

except litellm.exceptions.AuthenticationError as e:
    logger.warning(f"Auth error for {model}: {str(e)}")  # Log details
    yield ChatStreamChunk(
        model=model,
        content="",
        done=True,
        error=SAFE_ERROR_MESSAGES["auth"],  # Send safe message
    )
except litellm.exceptions.BadRequestError as e:
    logger.error(f"Bad request for {model}: {str(e)}")
    yield ChatStreamChunk(
        model=model,
        content="",
        done=True,
        error=SAFE_ERROR_MESSAGES["bad_request"],
    )
except Exception as e:
    logger.error(f"Unexpected error for {model}: {str(e)}", exc_info=True)
    yield ChatStreamChunk(
        model=model,
        content="",
        done=True,
        error=SAFE_ERROR_MESSAGES["generic"],
    )
```

---

## Medium Findings

### 🟡 MEDIUM-01: No Request Timeout Configuration

**File:** `frontend/lib/api.ts:125-137`

**Issue:** The fetch request has no timeout configured at the request level.

**Risk:**
- Hanging connections
- Resource exhaustion
- Poor user experience

**Recommendation:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

const response = await fetch(`${API_BASE_URL}/api/chat`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ ...request, stream: true }),
  signal: controller.signal,
});

clearTimeout(timeoutId);
```

---

### 🟡 MEDIUM-02: Missing Security Headers on Backend

**File:** `backend/app/main.py`

**Issue:** No security headers are added to API responses.

**Recommendation:**
```python
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

---

### 🟡 MEDIUM-03: No API Key Format Validation

**File:** `frontend/components/SettingsModal.tsx:33-44`

**Issue:** API keys are accepted without format validation before storage.

**Risk:**
- Invalid keys stored unnecessarily
- Poor user experience
- Wasted validation API calls

**Recommendation:**
```typescript
const validateKeyFormat = (provider: Provider, key: string): boolean => {
  const patterns = {
    openai: /^sk-[a-zA-Z0-9]{32,}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9-]{95,}$/,
    google: /^AI[a-zA-Z0-9_-]{35}$/,
    groq: /^gsk_[a-zA-Z0-9]{52}$/,
  };

  return patterns[provider]?.test(key) ?? false;
};

const handleKeyChange = (provider: Provider, value: string) => {
  setKeys({ ...keys, [provider]: value });

  // Client-side format validation
  if (value && !validateKeyFormat(provider, value)) {
    setValidation({
      ...validation,
      [provider]: { valid: false, error: "Invalid key format" }
    });
  } else {
    setValidation({ ...validation, [provider]: null });
  }
};
```

---

### 🟡 MEDIUM-04: Verbose Logging in Production

**File:** `backend/app/services/llm.py:12`

**Issue:** LiteLLM logging is configurable but defaults may be verbose.

```python
litellm.set_verbose = False  # Set to True for debugging
```

**Risk:**
- API keys could be logged if verbose mode is enabled
- Performance overhead from excessive logging
- Log storage costs

**Recommendation:**
```python
import os

# Explicitly disable in production
LITELLM_VERBOSE = os.getenv("LITELLM_VERBOSE", "false").lower() == "true"
litellm.set_verbose = LITELLM_VERBOSE

# Add safeguards
if LITELLM_VERBOSE:
    import warnings
    warnings.warn(
        "LiteLLM verbose logging is ENABLED. This may log API keys. "
        "Only use in development environments."
    )
```

---

### 🟡 MEDIUM-05: No HTTPS Enforcement

**File:** `backend/app/main.py`, deployment configuration

**Issue:** No code-level enforcement of HTTPS in production.

**Risk:**
- Man-in-the-middle attacks
- API keys transmitted in cleartext
- Session hijacking

**Recommendation:**
```python
import os

# In main.py
@app.middleware("http")
async def enforce_https(request: Request, call_next):
    if os.getenv("ENVIRONMENT") == "production":
        if request.url.scheme != "https":
            # Redirect to HTTPS
            url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(url), status_code=301)
    return await call_next(request)
```

---

## Low Findings

### 🟢 LOW-01: Console Logging in Production

**File:** Multiple frontend files

**Issue:** Console statements in production code:
- `frontend/lib/api.ts:60` - `console.warn` for retry attempts
- `frontend/lib/api.ts:165` - `console.error` for SSE parsing
- `frontend/lib/storage.ts:41,99,124` - `console.error` for storage failures
- `frontend/components/ChatInterface.tsx:152` - `console.error` for chat errors

**Risk:**
- Information disclosure via browser console
- Performance overhead
- Potential exposure of sensitive data

**Recommendation:**
Use a logging library with environment-aware levels:

```typescript
// lib/logger.ts
const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  error: (message: string, ...args: any[]) => {
    if (isDevelopment) console.error(message, ...args);
    // In production, send to monitoring service
  },
  warn: (message: string, ...args: any[]) => {
    if (isDevelopment) console.warn(message, ...args);
  },
  info: (message: string, ...args: any[]) => {
    if (isDevelopment) console.log(message, ...args);
  },
};

// Replace console.error with logger.error throughout
```

---

### 🟢 LOW-02: Missing Dependency Scanning

**Issue:** No automated dependency vulnerability scanning in CI/CD.

**Recommendation:**
Add to GitHub Actions or CI pipeline:

```yaml
# .github/workflows/security.yml
name: Security Scan

on: [push, pull_request]

jobs:
  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      # Backend Python dependencies
      - name: Python Security Scan
        run: |
          pip install safety
          safety check -r backend/requirements.txt

      # Frontend npm dependencies
      - name: npm Security Scan
        run: |
          cd frontend
          npm audit --audit-level=moderate
```

---

### 🟢 LOW-03: No Security Documentation

**Issue:** No security documentation for developers or users.

**Recommendation:**
Create `docs/SECURITY.md` with:
- Responsible disclosure policy
- Security best practices for users
- API key handling guidelines
- Deployment security checklist

---

### 🟢 LOW-04: Missing Input Sanitization for Display

**File:** `frontend/components/ChatInterface.tsx`, `frontend/components/DebateView.tsx`

**Issue:** User input and AI responses are rendered with `whitespace-pre-wrap` but no explicit sanitization.

**Risk:**
- Potential XSS if AI responses contain malicious content
- React's default escaping provides protection, but explicit sanitization is better

**Recommendation:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

// When rendering content
<div className="...">
  {DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: [] })}
</div>
```

---

## Positive Security Practices

The following security practices are implemented correctly:

✅ **BYOK Architecture:** Users provide their own API keys, avoiding centralized key storage
✅ **No Backend Key Storage:** Backend doesn't store or persist any API keys
✅ **Environment Variable Management:** Proper `.env.example` files and `.gitignore` entries
✅ **No Hardcoded Secrets:** No API keys or secrets found in codebase
✅ **Input Type Validation:** Pydantic schemas enforce type safety
✅ **Password Input Fields:** API keys use `type="password"` in forms
✅ **CORS Origins Restriction:** Origins are restricted (though headers are permissive)
✅ **Error Handling:** Try-catch blocks prevent application crashes
✅ **Git Security:** `.env` files are properly ignored
✅ **Modern Dependencies:** Using recent versions of frameworks

---

## Dependency Security Review

### Backend Dependencies (requirements.txt)

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| fastapi | 0.115.0 | ✅ Good | Recent version |
| uvicorn | 0.32.0 | ✅ Good | Recent version |
| pydantic | 2.9.0 | ✅ Good | Actively maintained |
| litellm | 1.51.0 | ⚠️ Monitor | Rapidly evolving, check for updates |
| httpx | 0.27.0 | ✅ Good | Stable |
| python-dotenv | 1.0.1 | ✅ Good | Latest |

**Recommendation:** Run `pip audit` regularly and update dependencies monthly.

### Frontend Dependencies (package.json)

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| next | 16.1.0 | ✅ Good | Very recent version |
| react | 19.0.0 | ✅ Good | Latest major version |
| typescript | 5.9.3 | ✅ Good | Recent version |
| @vercel/analytics | 1.6.1 | ✅ Good | Official package |

**Recommendation:** Run `npm audit` regularly. Set up Dependabot for automatic updates.

---

## Deployment Security Checklist

Before deploying to production:

### Backend
- [ ] Set production CORS origins via environment variable
- [ ] Implement rate limiting
- [ ] Add security headers middleware
- [ ] Disable verbose logging (`LITELLM_VERBOSE=false`)
- [ ] Set up HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerting
- [ ] Implement structured logging (JSON format)
- [ ] Add health check endpoint authentication
- [ ] Set up log rotation

### Frontend
- [ ] Add Content Security Policy headers
- [ ] Configure production API URL
- [ ] Add security warning in settings modal
- [ ] Implement XSS sanitization
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Enable HTTPS redirect
- [ ] Add rate limiting at CDN level
- [ ] Configure proper caching headers
- [ ] Test CSP in report-only mode first
- [ ] Add security.txt file

### Infrastructure
- [ ] Use managed secrets (AWS Secrets Manager, etc.) for backend secrets
- [ ] Enable DDoS protection (Cloudflare, etc.)
- [ ] Set up WAF rules
- [ ] Configure backup strategy
- [ ] Implement audit logging
- [ ] Set up SSL certificate auto-renewal
- [ ] Enable security scanning in CI/CD
- [ ] Configure container security scanning
- [ ] Set up intrusion detection
- [ ] Review and restrict IAM permissions

---

## Summary and Priority Recommendations

### Immediate Actions (Before Production)
1. **Implement rate limiting** (CRITICAL-02)
2. **Add CSP headers** (HIGH-01)
3. **Configure production CORS** (CRITICAL-01)
4. **Sanitize error messages** (HIGH-04)
5. **Add input validation limits** (HIGH-02)

### Short-term Actions (Within 1 month)
1. Add security headers to backend
2. Implement API key format validation
3. Add HTTPS enforcement
4. Set up dependency scanning
5. Add request timeouts

### Long-term Actions (Nice to have)
1. Consider API key encryption at rest
2. Implement request signing
3. Add comprehensive security documentation
4. Set up security monitoring
5. Implement session storage option for keys

---

## Testing Recommendations

### Security Testing
1. **Penetration Testing:** Conduct before production launch
2. **XSS Testing:** Test all input fields and response rendering
3. **CSRF Testing:** Verify CORS configuration
4. **Rate Limit Testing:** Verify limits work as expected
5. **Error Handling Testing:** Ensure no sensitive data in errors

### Automated Security Scanning
```bash
# Add to CI/CD
npm audit
pip-audit
semgrep --config=auto
bandit -r backend/
```

---

## Contact & Disclosure

For security concerns or vulnerability reports, please contact:
- Create a private security advisory on GitHub
- Email: [security contact needed]

Do not disclose security issues publicly until they have been addressed.

---

**Audit Completed By:** Claude Sonnet 4.5 (Security Analysis)
**Next Review:** Recommended after major changes or every 3 months
