import os

DB_PARAMS = {
    "dbname": os.getenv("DB_NAME", "routeflow_db"),
    "user": os.getenv("DB_USER", "routeflow_user"),
    "password": os.getenv("DB_PASSWORD", "N@th@n2159"),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432")
}