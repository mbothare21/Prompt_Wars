from collections import OrderedDict
from typing import Any, Optional

MAX_CACHE = 200
_llm_cache: OrderedDict[str, Any] = OrderedDict()


def cache_key(*parts: str) -> str:
    text = "\x00".join(parts)
    h = 5381
    for ch in text:
        h = ((h << 5) + h) ^ ord(ch)
        h = h & 0xFFFFFFFF
    return format(h, "x")


def cache_get(key: str) -> Optional[Any]:
    return _llm_cache.get(key)


def cache_set(key: str, value: Any) -> None:
    if len(_llm_cache) >= MAX_CACHE:
        _llm_cache.popitem(last=False)
    _llm_cache[key] = value
