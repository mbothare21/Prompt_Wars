from PromptWars_Aetherion.lib.types import Round

_cached_rounds: list[Round] | None = None


def get_rounds() -> list[Round]:
    global _cached_rounds
    if _cached_rounds is None:
        from PromptWars_Aetherion.lib.generate_rounds import generate_rounds
        _cached_rounds = generate_rounds()
    return _cached_rounds
