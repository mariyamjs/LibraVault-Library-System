import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    DEBUG = True
    DATABASE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "library.db")

    SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-in-env")
    ADMIN_CREATION_KEY = os.environ.get("ADMIN_CREATION_KEY", "nocturne-keepers-key")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)