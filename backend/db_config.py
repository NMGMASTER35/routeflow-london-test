import os
import psycopg2
import urllib.parse as up

if os.getenv("DATABASE_URL"):
    up.uses_netloc.append("postgres")
    url = up.urlparse(os.getenv("DATABASE_URL"))

    DB_PARAMS = {
        "dbname": url.path[1:],
        "user": url.username,
        "password": url.password,
        "host": url.hostname,
        "port": url.port,
    }
else:
    DB_PARAMS = {
        "dbname": os.getenv("DB_NAME", "routeflow_db"),
        "user": os.getenv("DB_USER", "routeflow_user"),
        "password": os.getenv("DB_PASSWORD", "routeflow123"),
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5432")
    }