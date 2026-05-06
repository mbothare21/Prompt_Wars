from PromptWars_Aetherion.lib.types import Player

_players: list[Player] = []


def save_player(player: Player) -> None:
    for i, p in enumerate(_players):
        if p.playerId == player.playerId:
            _players[i] = player.model_copy()
            return
    _players.append(player.model_copy())


def get_players() -> list[Player]:
    return list(_players)


def clear_players() -> None:
    _players.clear()
