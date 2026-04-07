from fastapi import APIRouter, Depends

from app.backend.routes.api_keys import router as api_keys_router
from app.backend.routes.flow_runs import router as flow_runs_router
from app.backend.routes.flows import router as flows_router
from app.backend.routes.health import router as health_router
from app.backend.routes.hedge_fund import router as hedge_fund_router
from app.backend.routes.language_models import router as language_models_router
from app.backend.routes.ollama import router as ollama_router
from app.backend.routes.storage import router as storage_router
from app.backend.security.auth import require_admin_api_key

api_router = APIRouter()
protected = [Depends(require_admin_api_key)]

api_router.include_router(health_router, tags=["health"])  # remains open for uptime checks
api_router.include_router(hedge_fund_router, tags=["hedge-fund"], dependencies=protected)
api_router.include_router(storage_router, tags=["storage"], dependencies=protected)
api_router.include_router(flows_router, tags=["flows"], dependencies=protected)
api_router.include_router(flow_runs_router, tags=["flow-runs"], dependencies=protected)
api_router.include_router(ollama_router, tags=["ollama"], dependencies=protected)
api_router.include_router(language_models_router, tags=["language-models"], dependencies=protected)
api_router.include_router(api_keys_router, tags=["api-keys"], dependencies=protected)
