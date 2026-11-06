# bot/database.py
import logging
from datetime import datetime, timezone

from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_member(discord_id: str) -> dict | None:
    res = (
        supabase.table("members")
        .select("*")
        .eq("discord_id", discord_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _insert_event(discord_id: str, event_type: str, username: str | None,
                  nickname: str | None, is_rejoin: bool) -> None:
    supabase.table("member_events").insert({
        "discord_id": discord_id,
        "event_type": event_type,
        "event_at": _now_iso(),
        "username_snapshot": username,
        "nickname_snapshot": nickname,
        "is_rejoin": is_rejoin,
    }).execute()


def register_join(discord_id: str, username: str, display_name: str,
                  nickname: str | None, avatar_url: str | None,
                  joined_at_iso: str) -> str:
    """
    Registra una entrada. Devuelve 'NEW' o 'REJOIN'.
    - Si no existe en members: crea con first_join_at = joined_at.
    - Si existe: actualiza last_join_at, is_active=true; marca rejoin si ya había estado.
    """
    existing = get_member(discord_id)
    now = _now_iso()

    if existing is None:
        supabase.table("members").insert({
            "discord_id": discord_id,
            "username": username,
            "nickname": nickname,
            "avatar_url": avatar_url,
            "first_join_at": joined_at_iso,
            "last_join_at": joined_at_iso,
            "is_active": True,
        }).execute()
        _insert_event(discord_id, "JOIN", username, nickname, is_rejoin=False)
        logger.info("NUEVO miembro registrado: %s (%s)", username, discord_id)
        return "NEW"

    # Ya existía: es reingreso si había estado antes
    was_inactive = not existing.get("is_active", False)
    had_previous_join = existing.get("first_join_at") is not None and existing["first_join_at"] != joined_at_iso
    is_rejoin = was_inactive or had_previous_join

    supabase.table("members").update({
        "username": username,
        "nickname": nickname,
        "avatar_url": avatar_url,
        "last_join_at": joined_at_iso,
        "is_active": True,
    }).eq("discord_id", discord_id).execute()

    _insert_event(discord_id, "JOIN", username, nickname, is_rejoin=is_rejoin)
    if is_rejoin:
        logger.info("REINGRESO: %s (%s) volvió a entrar", username, discord_id)
    else:
        logger.info("JOIN de miembro existente (sin cambios de estado): %s", username)
    return "REJOIN" if is_rejoin else "NEW"


def register_leave(discord_id: str, username: str, nickname: str | None) -> None:
    """Marca inactivo, actualiza last_leave_at y registra evento LEAVE."""
    now = _now_iso()
    supabase.table("members").update({
        "is_active": False,
        "last_leave_at": now,
    }).eq("discord_id", discord_id).execute()
    _insert_event(discord_id, "LEAVE", username, nickname, is_rejoin=False)
    logger.info("SALIDA: %s (%s) abandonó el servidor", username, discord_id)


def backfill_members(members: list[dict]) -> tuple[int, int]:
    """
    Sincroniza miembros actuales al arrancar. No inserta eventos.
    Devuelve (nuevos, existentes).
    """
    new_count = 0
    existing_count = 0
    for m in members:
        existing = get_member(m["discord_id"])
        if existing is None:
            supabase.table("members").insert({
                "discord_id": m["discord_id"],
                "username": m["username"],
                "nickname": m["nickname"],
                "avatar_url": m["avatar_url"],
                "first_join_at": m["joined_at"],
                "last_join_at": m["joined_at"],
                "is_active": True,
            }).execute()
            new_count += 1
        else:
            supabase.table("members").update({
                "username": m["username"],
                "nickname": m["nickname"],
                "avatar_url": m["avatar_url"],
                "is_active": True,
            }).eq("discord_id", m["discord_id"]).execute()
            existing_count += 1
    logger.info("Backfill completado: %d nuevos, %d ya existentes", new_count, existing_count)
    return new_count, existing_count
def update_member_profile(discord_id: str, username: str, nickname: str | None,
                          avatar_url: str | None) -> None:
    """Actualiza username, nickname y avatar de un miembro existente.
    No toca is_active ni fechas: eso lo manejan JOIN/LEAVE."""
    supabase.table("members").update({
        "username": username,
        "nickname": nickname,
        "avatar_url": avatar_url,
    }).eq("discord_id", discord_id).execute()
    logger.info("Perfil actualizado: %s (%s) nick=%s", username, discord_id, nickname)