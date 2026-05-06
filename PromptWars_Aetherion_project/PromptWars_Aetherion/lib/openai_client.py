import os
from openai import AsyncOpenAI

_client: AsyncOpenAI | None = None


def get_openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set or is empty.")
        _client = AsyncOpenAI(api_key=api_key)
    return _client
