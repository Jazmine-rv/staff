# bot/events.py
import logging
from datetime import datetime, timezone

import discord

import database as db

logger = logging.getLogger(__name__)


def _snapshot(member: discord.Member) -> dict:
    return {
        "discord_id": str(member.id),
        "username": member.name,
        "display_name": member.display_name,
        "nickname": member.nick,
        "avatar_url": str(member.display_avatar.url) if member.display_avatar else None,
        "joined_at": member.joined_at.isoformat() if member.joined_at else datetime.now(timezone.utc).isoformat(),
    }


def register_events(bot: discord.Client) -> None:

    @bot.event
    async def on_member_join(member: discord.Member) -> None:
        if member.guild.id != bot.guild_id:
            return
        s = _snapshot(member)
        logger.info("=== JOIN === %s (%s)", s["username"], s["discord_id"])
        try:
            db.register_join(
                discord_id=s["discord_id"],
                username=s["username"],
                display_name=s["display_name"],
                nickname=s["nickname"],
                avatar_url=s["avatar_url"],
                joined_at_iso=s["joined_at"],
            )
        except Exception:
            logger.exception("Error guardando JOIN en Supabase")

    @bot.event
    async def on_member_remove(member: discord.Member) -> None:
        if member.guild.id != bot.guild_id:
            return
        s = _snapshot(member)
        logger.info("=== LEAVE === %s (%s)", s["username"], s["discord_id"])
        try:
            db.register_leave(
                discord_id=s["discord_id"],
                username=s["username"],
                nickname=s["nickname"],
            )
        except Exception:
            logger.exception("Error guardando LEAVE en Supabase")

    @bot.event
    async def on_member_update(before: discord.Member, after: discord.Member) -> None:
        if after.guild.id != bot.guild_id:
            return
        # Solo actuar si cambió el nickname o el username/display
        if before.nick == after.nick and before.name == after.name and before.display_name == after.display_name:
            return
        logger.info("=== UPDATE === %s (%s) nick: %s -> %s",
                    after.name, after.id, before.nick, after.nick)
        try:
            db.update_member_profile(
                discord_id=str(after.id),
                username=after.name,
                nickname=after.nick,
                avatar_url=str(after.display_avatar.url) if after.display_avatar else None,
            )
        except Exception:
            logger.exception("Error actualizando perfil en Supabase")