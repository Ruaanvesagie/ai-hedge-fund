import asyncio
import json
from typing import Callable

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.backend.security.rate_limit import limiter

router = APIRouter()


def _exempt_if_limiter(func: Callable):
    if limiter:
        return limiter.exempt(func)
    return func


@router.get("/")
@_exempt_if_limiter
async def root():
    return {"message": "Welcome to AI Hedge Fund API"}


@router.get("/ping")
@_exempt_if_limiter
async def ping():
    async def event_generator():
        for i in range(5):
            data = {"ping": f"ping {i+1}/5", "timestamp": i + 1}
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
