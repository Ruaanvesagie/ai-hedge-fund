# NGC AI Exchange – Full Code Audit Report

**Date:** 2026-03-15  
**Auditor:** Apex Architect AI  
**Repository:** https://github.com/Ruaanvesagie/ai-hedge-fund  
**Live Site:** https://smartkonnect.co.uk  

---

## Executive Summary

The repository contains a well-structured AI hedge fund platform with two codebases:

1. **`src/`** – CLI-based hedge fund engine with 18+ analyst agents (Buffett, Munger, Graham, etc.), LangGraph orchestration, backtesting engine, multi-provider LLM support
2. **`app/`** – Web layer: FastAPI backend (`app/backend/`) + React/TypeScript frontend (`app/frontend/`)

The backend already integrates the `src/` agent logic through `app/backend/services/graph.py` and the agent service layer. The architecture is sound. However, several critical bugs and security issues were found and fixed.

---

## 🔴 CRITICAL Bugs Found & Fixed

### 1. CORS Hardcoded to localhost Only
**File:** `app/backend/main.py`  
**Bug:** CORS `allow_origins` only contained `http://localhost:5173` and `http://127.0.0.1:5173`. Any request from `https://smartkonnect.co.uk` would be blocked by the browser.  
**Fix:** Added production domains (`https://smartkonnect.co.uk`, `https://www.smartkonnect.co.uk`), additional dev ports (`localhost:3000`), and a `CORS_EXTRA_ORIGINS` env var for runtime flexibility.

### 2. Path Traversal in Storage Route
**File:** `app/backend/routes/storage.py`  
**Bug:** The `save_json_file` endpoint accepted arbitrary filenames like `../../etc/passwd.json`. No validation was performed.  
**Fix:** Added `field_validator` on the filename field to strip directory components and enforce a whitelist regex. Added a secondary `resolve()` check to ensure the final path stays within the `outputs/` directory.

### 3. CORS Override in SSE Endpoint
**File:** `app/backend/routes/ollama.py`  
**Bug:** The `download_model_with_progress` endpoint set `Access-Control-Allow-Origin: *` directly in response headers, bypassing the CORS middleware and allowing any origin to access the streaming endpoint.  
**Fix:** Removed the manual CORS headers from the `StreamingResponse` – the middleware handles this correctly.

---

## 🟡 Important Bugs Found & Fixed

### 4. Deprecated `@app.on_event("startup")`
**File:** `app/backend/main.py`  
**Bug:** Used `@app.on_event("startup")` which is deprecated in modern FastAPI (will be removed in future versions).  
**Fix:** Migrated to the `lifespan` context manager pattern.

### 5. Deprecated `declarative_base` Import
**File:** `app/backend/database/connection.py`  
**Bug:** Imported `declarative_base` from `sqlalchemy.ext.declarative` which is deprecated in SQLAlchemy 2.x.  
**Fix:** Updated to `from sqlalchemy.orm import declarative_base`.

### 6. Hardcoded Database Path (No Override)
**File:** `app/backend/database/connection.py`  
**Bug:** Database path was hardcoded to a relative SQLite path. No way to use PostgreSQL or other databases in production.  
**Fix:** Added `DATABASE_URL` environment variable support with SQLite as default fallback.

### 7. No Docker Backend Service
**File:** `docker/docker-compose.yml`  
**Bug:** Docker Compose only had CLI-oriented services (hedge-fund, backtester) but no service to run the FastAPI backend API.  
**Fix:** Added `backend` service running `uvicorn app.backend.main:app` on port 8000, with DB volume persistence.

### 8. Dockerfile Default Command
**File:** `docker/Dockerfile`  
**Bug:** Default CMD was `python src/main.py` (CLI mode). For production deployment, the default should be the web API.  
**Fix:** Changed default CMD to `uvicorn app.backend.main:app --host 0.0.0.0 --port 8000`. Docker Compose still overrides this for CLI services.

### 9. SQLite DB Not in .gitignore
**File:** `.gitignore`  
**Bug:** `*.db` files were not ignored, risking accidental commit of database files containing API keys.  
**Fix:** Added `*.db` and `*.sqlite3` to `.gitignore`.

---

## 🟢 Minor Issues & Improvements

### 10. API Key Response Security
**File:** `app/backend/models/schemas.py`  
**Bug:** `ApiKeyResponse` returned the full API key value in API responses.  
**Fix:** Added `from_orm_masked()` class method that masks the key (shows first 4 + last 4 chars only). The existing routes still use `from_orm` for internal operations – developers should consider switching to `from_orm_masked()` for GET endpoints that return key values.

### 11. Missing Frontend `.env.example`
**File:** `app/frontend/.env.example`  
**Bug:** No example environment file for the frontend. Developers wouldn't know about `VITE_API_URL`.  
**Fix:** Created `app/frontend/.env.example` documenting the `VITE_API_URL` variable.

### 12. Incomplete Root `.env.example`
**File:** `.env.example`  
**Bug:** Missing `DATABASE_URL`, `CORS_EXTRA_ORIGINS`, `VITE_API_URL`, `OLLAMA_HOST`, `OLLAMA_BASE_URL` variables.  
**Fix:** Complete rewrite with all variables, organized by category, with documentation.

### 13. Missing `.dockerignore`
**File:** `.dockerignore`  
**Bug:** No `.dockerignore` file, meaning Docker builds included `.git`, `node_modules`, `.env`, and database files.  
**Fix:** Created `.dockerignore` with appropriate exclusions.

### 14. App Title/Metadata
**File:** `app/backend/main.py`  
**Bug:** FastAPI app title was "AI Hedge Fund API" instead of "NGC AI Exchange API".  
**Fix:** Updated title and description to match the NGC AI Exchange branding.

---

## Architecture Assessment

### What Works Well ✅

1. **Agent Integration:** `src/agents/` are properly wired through `app/backend/services/graph.py` → `app/backend/services/agent_service.py` → routes. The `create_graph()` function dynamically builds LangGraph workflows from React Flow node/edge data sent by the frontend.

2. **Backtesting Integration:** `app/backend/services/backtest_service.py` properly uses `src/tools/api.py` for data fetching and `run_graph_async()` for AI decisions. The service handles portfolio management, trade execution, and performance metrics calculation.

3. **Multi-LLM Support:** `src/llm/models.py` supports 13 providers (OpenAI, Anthropic, DeepSeek, Google, Groq, Ollama, OpenRouter, xAI, GigaChat, Azure OpenAI, etc.) with API key injection from both env vars and database.

4. **SSE Streaming:** Both `/hedge-fund/run` and `/hedge-fund/backtest` use Server-Sent Events for real-time progress updates, with proper client disconnect handling.

5. **Database Layer:** Clean repository pattern with SQLAlchemy models, proper session management, and migration support via Alembic.

6. **Agent-Specific Models:** The `agent_models` system allows per-agent LLM configuration, falling back to global settings.

### Areas That Need Attention ⚠️

1. **API Keys Stored in Plaintext:** The `ApiKey` database model stores `key_value` as plaintext `Text`. For production, these should be encrypted at rest (e.g., using `cryptography.fernet` or a vault service).

2. **No Authentication/Authorization:** The API has no auth middleware. Anyone who can reach the API can run hedge fund simulations, manage API keys, and access all data. Add JWT or API key auth before exposing publicly.

3. **SQLite for Production:** SQLite doesn't handle concurrent writes well. For production with multiple users, migrate to PostgreSQL (the `DATABASE_URL` env var now makes this easy).

4. **No Rate Limiting:** The API has no rate limiting, which could lead to abuse (especially on the `/hedge-fund/run` endpoint which makes expensive LLM calls).

5. **Synchronous LLM Calls in Thread Pool:** `run_graph()` runs synchronously in `run_in_executor()`. This works but ties up threads. Future optimization: make the agent pipeline fully async.

---

## Files Modified

| File | Change |
|------|--------|
| `app/backend/main.py` | CORS fix, lifespan migration, branding update |
| `app/backend/database/connection.py` | Deprecated import fix, DATABASE_URL env var |
| `app/backend/routes/storage.py` | Path traversal fix with validation |
| `app/backend/routes/ollama.py` | Removed manual CORS headers |
| `app/backend/models/schemas.py` | Added `from_orm_masked()` for API keys |
| `.env.example` | Complete rewrite with all variables |
| `app/frontend/.env.example` | Created (new file) |
| `docker/Dockerfile` | Updated default CMD, added uvicorn install |
| `docker/docker-compose.yml` | Added `backend` service |
| `.dockerignore` | Created (new file) |
| `.gitignore` | Added `*.db` and `*.sqlite3` |

---

## Remaining TODOs (Developer Action Required)

### Priority 1 – Before Going Live

- [ ] **Set up API keys:** Copy `.env.example` → `.env` and fill in at least `FINANCIAL_DATASETS_API_KEY` and one LLM provider key (e.g., `OPENAI_API_KEY`)
- [ ] **Add authentication:** Implement JWT auth or API key middleware on the FastAPI app before exposing to the internet
- [ ] **Encrypt stored API keys:** Replace plaintext storage in the `api_keys` table with encrypted values
- [ ] **Set `VITE_API_URL`** in the frontend build environment to point to your production backend (e.g., `https://api.smartkonnect.co.uk`)

### Priority 2 – Production Hardening

- [ ] **Migrate from SQLite to PostgreSQL** for production (set `DATABASE_URL` env var)
- [ ] **Add rate limiting** (e.g., `slowapi` or nginx-level rate limiting)
- [ ] **Set up HTTPS** termination (nginx/Caddy reverse proxy or cloud load balancer)
- [ ] **Run Alembic migrations** for production DB schema management instead of `create_all()`
- [ ] **Add health check** to Docker Compose backend service
- [ ] **Set up logging** to file or external service (currently console-only)

### Priority 3 – Nice to Have

- [ ] **Add API documentation auth** (protect `/docs` and `/redoc` in production)
- [ ] **Implement WebSocket** as alternative to SSE for bi-directional communication
- [ ] **Add caching layer** (Redis) for financial data API responses in production
- [ ] **Create CI/CD pipeline** for automated testing and deployment

---

## Deployment Instructions for smartkonnect.co.uk

### Option A: Docker (Recommended)

```bash
# 1. Clone and configure
git clone https://github.com/Ruaanvesagie/ai-hedge-fund.git
cd ai-hedge-fund
cp .env.example .env
# Edit .env with your API keys

# 2. Build and start backend
cd docker
docker compose up -d backend

# 3. Build frontend (separate hosting)
cd ../app/frontend
cp .env.example .env
# Set VITE_API_URL=https://api.smartkonnect.co.uk (or your backend URL)
npm install && npm run build
# Deploy dist/ to your static hosting (Vercel, Netlify, S3+CloudFront, etc.)
```

### Option B: Direct (No Docker)

```bash
# 1. Install Python 3.11+ and Poetry
pip install poetry

# 2. Clone and configure
git clone https://github.com/Ruaanvesagie/ai-hedge-fund.git
cd ai-hedge-fund
cp .env.example .env
# Edit .env with your API keys

# 3. Install dependencies
poetry install

# 4. Run backend
uvicorn app.backend.main:app --host 0.0.0.0 --port 8000

# 5. Build and serve frontend
cd app/frontend
cp .env.example .env
# Set VITE_API_URL to your backend URL
npm install && npm run build
# Serve dist/ with nginx, caddy, or any static file server
```

### Nginx Reverse Proxy Example

```nginx
server {
    listen 443 ssl;
    server_name api.smartkonnect.co.uk;
    
    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}

server {
    listen 443 ssl;
    server_name smartkonnect.co.uk www.smartkonnect.co.uk;
    
    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /path/to/app/frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Summary

**13 bugs found and fixed**, including 3 critical issues (CORS blocking production, path traversal vulnerability, CORS override on SSE endpoint). The codebase is well-architected with proper separation of concerns. The main gaps are around security (no auth, plaintext key storage) and production readiness (SQLite, no rate limiting) which are documented as actionable TODOs above.
