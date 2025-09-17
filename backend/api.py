import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, make_response, request
from psycopg2.extras import Json, RealDictCursor
from psycopg2.pool import SimpleConnectionPool

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY")
MAX_CONNECTIONS = int(os.getenv("DB_MAX_CONNECTIONS", "5"))

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

if not FIREBASE_API_KEY:
    raise RuntimeError("FIREBASE_API_KEY environment variable is required")


def _ensure_sslmode(url: str) -> str:
    if "sslmode" in url:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}sslmode=require"


connection_pool = SimpleConnectionPool(
    1,
    MAX_CONNECTIONS,
    _ensure_sslmode(DATABASE_URL),
)


@contextmanager
def get_connection():
    connection = connection_pool.getconn()
    try:
        yield connection
    finally:
        connection_pool.putconn(connection)


app = Flask(__name__)


class ApiError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class AuthError(ApiError):
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message, status_code)


FIREBASE_LOOKUP_URL = (
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY
)


def verify_firebase_token(uid: str) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AuthError("Missing or invalid Authorization header", status_code=401)

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise AuthError("Missing authentication token", status_code=401)

    try:
        response = requests.post(
            FIREBASE_LOOKUP_URL,
            json={"idToken": token},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise AuthError("Unable to verify authentication token", status_code=503) from exc

    if response.status_code != 200:
        raise AuthError("Invalid authentication token", status_code=401)

    payload = response.json()
    users = payload.get("users") or []
    if not users:
        raise AuthError("Authentication token does not map to a user", status_code=401)

    user_info = users[0]
    token_uid = user_info.get("localId")
    if token_uid != uid:
        raise AuthError("Authenticated user does not match requested profile", status_code=403)

    if user_info.get("disabled"):
        raise AuthError("Authenticated user account is disabled", status_code=403)

    return user_info


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError) -> Response:
    response = jsonify({"error": str(error) or "Request could not be processed."})
    response.status_code = error.status_code
    return response


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception) -> Response:
    app.logger.exception("Unexpected error while handling request", exc_info=error)
    response = jsonify({"error": "Unexpected server error"})
    response.status_code = 500
    return response


@app.after_request
def apply_cors_headers(response: Response) -> Response:
    allow_origin = os.getenv("CORS_ALLOW_ORIGIN", "*")
    response.headers.setdefault("Access-Control-Allow-Origin", allow_origin)
    response.headers.setdefault(
        "Access-Control-Allow-Headers", "Authorization, Content-Type"
    )
    response.headers.setdefault(
        "Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    )
    response.headers.setdefault("Access-Control-Max-Age", "86400")
    return response


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response("", 204)
        return response
    return None


def init_database() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS profile_notes (
                    uid TEXT NOT NULL,
                    note_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (uid, note_id)
                );
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS profile_favourites (
                    uid TEXT NOT NULL,
                    favourite_id TEXT NOT NULL,
                    data JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (uid, favourite_id)
                );
                """
            )
        connection.commit()


def to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def serialise_note(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("note_id"),
        "name": row.get("title"),
        "text": row.get("content"),
        "createdAt": to_iso(row.get("created_at")),
        "updatedAt": to_iso(row.get("updated_at")),
    }


def normalise_note_payload(payload: Dict[str, Any]) -> Dict[str, str]:
    name = (payload.get("name") or payload.get("title") or "").strip()
    text = (payload.get("text") or payload.get("content") or "").strip()
    if not name:
        raise ApiError("A note name is required.", status_code=400)
    if not text:
        raise ApiError("A note body is required.", status_code=400)
    return {"name": name, "text": text}


def ensure_note_id(payload: Dict[str, Any]) -> str:
    note_id = (payload.get("id") or payload.get("noteId") or "").strip()
    if note_id:
        return note_id
    return uuid.uuid4().hex


def ensure_favourite_id(payload: Dict[str, Any]) -> str:
    favourite_id = (payload.get("id") or payload.get("favouriteId") or "").strip()
    if not favourite_id:
        raise ApiError("A favourite id is required.", status_code=400)
    return favourite_id


def serialise_favourite(row: Dict[str, Any]) -> Dict[str, Any]:
    data = row.get("data") or {}
    if isinstance(data, dict):
        data.setdefault("id", row.get("favourite_id"))
    return data


@app.route("/api/profile/<uid>/notes", methods=["GET", "POST"])
def notes_collection(uid: str):
    verify_firebase_token(uid)

    if request.method == "GET":
        with get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT note_id, title, content, created_at, updated_at
                    FROM profile_notes
                    WHERE uid = %s
                    ORDER BY created_at ASC
                    """,
                    (uid,),
                )
                rows = cursor.fetchall()
        notes = [serialise_note(row) for row in rows]
        return jsonify({"notes": notes})

    payload = request.get_json(silent=True) or {}
    details = normalise_note_payload(payload)
    note_id = ensure_note_id(payload)

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO profile_notes (uid, note_id, title, content)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (uid, note_id)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    updated_at = NOW()
                RETURNING note_id, title, content, created_at, updated_at
                """,
                (uid, note_id, details["name"], details["text"]),
            )
            row = cursor.fetchone()
        connection.commit()

    return jsonify({"note": serialise_note(row)}), 201


@app.route("/api/profile/<uid>/notes/<note_id>", methods=["PUT", "PATCH", "DELETE"])
def notes_item(uid: str, note_id: str):
    verify_firebase_token(uid)

    if request.method in {"PUT", "PATCH"}:
        payload = request.get_json(silent=True) or {}
        details = normalise_note_payload(payload)

        with get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    UPDATE profile_notes
                    SET title = %s,
                        content = %s,
                        updated_at = NOW()
                    WHERE uid = %s AND note_id = %s
                    RETURNING note_id, title, content, created_at, updated_at
                    """,
                    (details["name"], details["text"], uid, note_id),
                )
                row = cursor.fetchone()
            connection.commit()

        if row is None:
            raise ApiError("Note not found.", status_code=404)

        return jsonify({"note": serialise_note(row)})

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM profile_notes WHERE uid = %s AND note_id = %s",
                (uid, note_id),
            )
            deleted = cursor.rowcount
        connection.commit()

    if deleted == 0:
        raise ApiError("Note not found.", status_code=404)

    return jsonify({"status": "deleted"}), 200


@app.route("/api/profile/<uid>/favourites", methods=["GET", "POST"])
def favourites_collection(uid: str):
    verify_firebase_token(uid)

    if request.method == "GET":
        with get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT favourite_id, data
                    FROM profile_favourites
                    WHERE uid = %s
                    ORDER BY created_at ASC
                    """,
                    (uid,),
                )
                rows = cursor.fetchall()
        favourites = [serialise_favourite(row) for row in rows]
        return jsonify({"favourites": favourites})

    payload = request.get_json(silent=True) or {}
    favourite_id = ensure_favourite_id(payload)

    if isinstance(payload, dict):
        payload = {**payload, "id": favourite_id}

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO profile_favourites (uid, favourite_id, data)
                VALUES (%s, %s, %s)
                ON CONFLICT (uid, favourite_id)
                DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = NOW()
                RETURNING favourite_id, data
                """,
                (uid, favourite_id, Json(payload)),
            )
            row = cursor.fetchone()
        connection.commit()

    return jsonify({"favourite": serialise_favourite(row)}), 201


@app.route(
    "/api/profile/<uid>/favourites/<favourite_id>",
    methods=["DELETE", "PUT", "PATCH"],
)
def favourites_item(uid: str, favourite_id: str):
    verify_firebase_token(uid)

    if request.method in {"PUT", "PATCH"}:
        payload = request.get_json(silent=True) or {}
        payload = {**payload, "id": favourite_id}

        with get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    UPDATE profile_favourites
                    SET data = %s,
                        updated_at = NOW()
                    WHERE uid = %s AND favourite_id = %s
                    RETURNING favourite_id, data
                    """,
                    (Json(payload), uid, favourite_id),
                )
                row = cursor.fetchone()
            connection.commit()

        if row is None:
            raise ApiError("Favourite not found.", status_code=404)

        return jsonify({"favourite": serialise_favourite(row)})

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM profile_favourites WHERE uid = %s AND favourite_id = %s",
                (uid, favourite_id),
            )
            deleted = cursor.rowcount
        connection.commit()

    if deleted == 0:
        raise ApiError("Favourite not found.", status_code=404)

    return jsonify({"status": "deleted"}), 200


@app.route("/api/health", methods=["GET"])
def healthcheck():
    return jsonify({"status": "ok"})


init_database()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
