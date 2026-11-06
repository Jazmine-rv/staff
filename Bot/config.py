# bot/config.py
import os
from dotenv import load_dotenv

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID_RAW = os.getenv("GUILD_ID")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not DISCORD_TOKEN:
    raise RuntimeError("Falta DISCORD_TOKEN en el archivo .env")
if not GUILD_ID_RAW:
    raise RuntimeError("Falta GUILD_ID en el archivo .env")
if not SUPABASE_URL:
    raise RuntimeError("Falta SUPABASE_URL en el archivo .env")
if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Falta SUPABASE_SERVICE_ROLE_KEY en el archivo .env")

try:
    GUILD_ID = int(GUILD_ID_RAW)
except ValueError:
    raise RuntimeError("GUILD_ID debe ser un número (el ID del servidor de Discord)")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()