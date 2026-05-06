import math
from PromptWars_Aetherion.lib.cache import cache_key, cache_get, cache_set
from PromptWars_Aetherion.lib.openai_client import get_openai


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    denom = norm_a * norm_b
    return 0.0 if denom == 0 else dot / denom


async def get_similarity(output: str, expected: str) -> float:
    key = cache_key("similarity", output, expected)
    cached = cache_get(key)
    if cached is not None:
        return float(cached)

    client = get_openai()
    e1, e2 = await asyncio.gather(
        client.embeddings.create(model="text-embedding-3-small", input=output),
        client.embeddings.create(model="text-embedding-3-small", input=expected),
    )

    score = cosine_similarity(e1.data[0].embedding, e2.data[0].embedding)
    cache_set(key, score)
    return score


import asyncio  # noqa: E402 — placed here to avoid circular import issues at module level
