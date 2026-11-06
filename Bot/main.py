# bot/main.py
import logging

import discord

from config import DISCORD_TOKEN, GUILD_ID, LOG_LEVEL
from events import register_events
import database as db

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("staff-manager-bot")

intents = discord.Intents.default()
intents.members = True
intents.message_content = False

bot = discord.Client(intents=intents)
bot.guild_id = GUILD_ID
bot._backfill_done = False

register_events(bot)


async def _run_backfill(guild: discord.Guild) -> None:
    logger.info("Backfill: iniciando sincronización de miembros...")
    try:
        # fetch_members consulta la API y devuelve un async iterator
        members_data = []
        async for m in guild.fetch_members(limit=None):
            if m.bot:
                continue
            members_data.append({
                "discord_id": str(m.id),
                "username": m.name,
                "nickname": m.nick,
                "avatar_url": str(m.display_avatar.url) if m.display_avatar else None,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            })
        logger.info("Backfill: %d miembros actuales a sincronizar", len(members_data))
        db.backfill_members(members_data)
    except Exception:
        logger.exception("Error en backfill")


@bot.event
async def on_ready() -> None:
    logger.info("Bot conectado como %s (id=%s)", bot.user, bot.user.id)
    guild = bot.get_guild(GUILD_ID)
    if guild is None:
        logger.warning(
            "El bot no ve el servidor GUILD_ID=%s. ¿Invitado y con 'Ver canales'?",
            GUILD_ID,
        )
        return
    logger.info("Servidor detectado: %s", guild.name)

    if not bot._backfill_done:
        bot._backfill_done = True
        await _run_backfill(guild)

    logger.info("Escuchando on_member_join / on_member_remove...")


if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)