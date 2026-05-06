import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None
_db_cache: dict[str, AsyncIOMotorDatabase] = {}


def _get_mongo_uri() -> str | None:
    uri = (os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI") or "").strip()
    return uri if uri else None


def get_default_db_name() -> str:
    return os.environ.get("MONGO_DB_NAME", "promptwars")


async def get_db(db_name: str | None = None) -> AsyncIOMotorDatabase | None:
    global _client
    uri = _get_mongo_uri()
    if not uri:
        print("[mongodb] MONGO_URI/MONGODB_URI not set — skipping DB connection")
        return None
    resolved_db_name = (db_name or get_default_db_name()).strip() or "promptwars"
    if resolved_db_name in _db_cache:
        return _db_cache[resolved_db_name]
    if _client is None:
        _client = AsyncIOMotorClient(
            uri,
            maxPoolSize=10,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=30000,
        )
    db = _client[resolved_db_name]
    _db_cache[resolved_db_name] = db
    return db
