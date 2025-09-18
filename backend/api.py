import os
import re
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, make_response, request
from psycopg2.extras import Json, RealDictCursor
from psycopg2.pool import SimpleConnectionPool

def _as_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() not in {"", "0", "false", "no", "off"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return int(text)
    except ValueError:
        return default


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY")
MAX_CONNECTIONS = int(os.getenv("DB_MAX_CONNECTIONS", "5"))
TFL_APP_ID = os.getenv("TFL_APP_ID")
TFL_APP_KEY = os.getenv("TFL_APP_KEY") or os.getenv("TFL_API_KEY") or os.getenv("TFL_KEY")
TFL_SUBSCRIPTION_KEY = os.getenv("TFL_SUBSCRIPTION_KEY") or os.getenv("TFL_SUBSCRIPTION")
TFL_VEHICLE_API_URL = os.getenv(
    "TFL_VEHICLE_API_URL",
    "https://api.tfl.gov.uk/Vehicle/Occupancy/Buses",
)
FLEET_AUTO_SYNC_ENABLED = _as_bool(os.getenv("FLEET_AUTO_SYNC_ENABLED"), default=True)
FLEET_AUTO_SYNC_INTERVAL_SECONDS = max(
    _env_int("FLEET_AUTO_SYNC_INTERVAL_SECONDS", _env_int("FLEET_AUTO_SYNC_INTERVAL", 300)),
    0,
)

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


FLEET_ADMIN_CODE = os.getenv("FLEET_ADMIN_CODE", "fleet-admin")

FLEET_COLLECTION_BUSES = "fleet_buses"
FLEET_COLLECTION_PENDING = "fleet_pending"
FLEET_OPTION_PREFIX = "fleet_option:"

_fleet_sync_lock = threading.Lock()
_last_fleet_sync_attempt: float = 0.0
_last_fleet_sync_success: float = 0.0


def build_tfl_request_kwargs() -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    headers: Dict[str, str] = {}

    if TFL_APP_ID:
        params["app_id"] = TFL_APP_ID
    if TFL_APP_KEY:
        params.setdefault("app_key", TFL_APP_KEY)
    if TFL_SUBSCRIPTION_KEY:
        headers["Ocp-Apim-Subscription-Key"] = TFL_SUBSCRIPTION_KEY

    kwargs: Dict[str, Any] = {}
    if params:
        kwargs["params"] = params
    if headers:
        kwargs["headers"] = headers
    return kwargs

FLEET_OPTION_FIELDS: List[str] = [
    "operator",
    "status",
    "wrap",
    "vehicleType",
    "doors",
    "engineType",
    "engine",
    "chassis",
    "bodyType",
    "garage",
    "extras",
    "length",
]

DEFAULT_FLEET_OPTIONS: Dict[str, List[str]] = {
    "operator": [
        "Abellio London",
        "Arriva London",
        "Go-Ahead London",
        "Metroline",
        "Stagecoach London",
    ],
    "status": ["Active", "Inactive", "Stored"],
    "wrap": ["Standard", "Heritage", "Advertising wrap", "Special event"],
    "vehicleType": ["Double Decker", "Single Decker"],
    "doors": ["1", "2", "3"],
    "engineType": ["Diesel", "Hybrid", "Electric", "Hydrogen"],
    "engine": [
        "Alexander Dennis Enviro400EV",
        "Volvo B5LH",
        "Scania N250UD",
        "Wrightbus Hydrogen",
    ],
    "chassis": [
        "Alexander Dennis",
        "Scania N-series",
        "Volvo B5LH",
        "Wrightbus StreetDeck",
    ],
    "bodyType": [
        "Alexander Dennis Enviro400 MMC",
        "Wright Gemini 3",
        "Wright StreetDeck",
        "Caetano e.City Gold",
    ],
    "garage": [
        "QB (Battersea)",
        "HT (Holloway)",
        "LI (Leyton)",
        "NX (New Cross)",
        "WJ (Waterloo)",
    ],
    "extras": [
        "New Bus",
        "Rare Working",
        "Heritage Fleet",
        "Route Branding",
        "Night Bus Allocation",
        "Training Vehicle",
    ],
    "length": ["8.9m", "10.2m", "10.6m", "11.2m", "12.4m"],
}

DEFAULT_FLEET_BUSES: Dict[str, Dict[str, Any]] = {
    "BV72YKD": {
        "regKey": "BV72YKD",
        "registration": "BV72 YKD",
        "fleetNumber": "4032",
        "operator": "Abellio London",
        "status": "Active",
        "wrap": "Standard",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Electric",
        "engine": "Alexander Dennis Enviro400EV",
        "chassis": "Alexander Dennis",
        "bodyType": "Alexander Dennis Enviro400 MMC",
        "registrationDate": "2023-01-12",
        "garage": "QB (Battersea)",
        "extras": ["New Bus", "Route Branding"],
        "length": "10.6m",
        "isNewBus": True,
        "isRareWorking": False,
        "createdAt": "2023-01-12T00:00:00.000Z",
        "lastUpdated": "2024-05-12T10:32:00.000Z",
    },
    "LTZ1000": {
        "regKey": "LTZ1000",
        "registration": "LTZ 1000",
        "fleetNumber": "LT1",
        "operator": "Go-Ahead London",
        "status": "Active",
        "wrap": "Heritage",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Hybrid",
        "engine": "Volvo B5LH",
        "chassis": "Volvo B5LH",
        "bodyType": "Wright Gemini 3",
        "registrationDate": "2015-02-28",
        "garage": "QB (Battersea)",
        "extras": ["Heritage Fleet", "Rare Working"],
        "length": "11.2m",
        "isNewBus": False,
        "isRareWorking": True,
        "createdAt": "2015-02-28T00:00:00.000Z",
        "lastUpdated": "2024-03-18T09:15:00.000Z",
    },
    "SN68AEO": {
        "regKey": "SN68AEO",
        "registration": "SN68 AEO",
        "fleetNumber": "11056",
        "operator": "Stagecoach London",
        "status": "Active",
        "wrap": "Advertising wrap",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Hybrid",
        "engine": "Scania N250UD",
        "chassis": "Scania N-series",
        "bodyType": "Alexander Dennis Enviro400 MMC",
        "registrationDate": "2018-11-02",
        "garage": "LI (Leyton)",
        "extras": ["Night Bus Allocation"],
        "length": "10.6m",
        "isNewBus": False,
        "isRareWorking": False,
        "createdAt": "2018-11-02T00:00:00.000Z",
        "lastUpdated": "2024-04-06T15:45:00.000Z",
    },
}


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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS app_collections (
                    collection TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    data JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (collection, item_id)
                );
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_app_collections_collection
                ON app_collections (collection);
                """
            )
        connection.commit()

    seed_default_fleet()


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalise_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def normalise_reg_key(value: Any) -> str:
    text = normalise_text(value).upper()
    if not text:
        return ""
    return re.sub(r"[^A-Z0-9]", "", text)


def normalise_option_id(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return ""
    normalised = re.sub(r"\s+", " ", text)
    return normalised.lower()


def to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = normalise_text(value).lower()
    if not text:
        return False
    return text in {"1", "true", "yes", "y", "on"}


def normalise_date(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = normalise_text(value)
    if not text:
        return ""
    cleaned = text.replace("Z", "+00:00") if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(cleaned)
        return parsed.date().isoformat()
    except ValueError:
        return text


def sanitise_extras(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        source = list(value)
    else:
        source = [value]
    cleaned: List[str] = []
    for entry in source:
        text = normalise_text(entry)
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _iter_vehicle_entries(payload: Any):
    if isinstance(payload, list):
        for entry in payload:
            yield from _iter_vehicle_entries(entry)
        return
    if isinstance(payload, dict):
        yield payload
        for value in payload.values():
            if isinstance(value, (list, dict)):
                yield from _iter_vehicle_entries(value)
        return
    if payload is not None:
        yield payload


def extract_vehicle_registration(entry: Any) -> Tuple[str, str]:
    raw_value: Any = None
    if isinstance(entry, str):
        raw_value = entry
    elif isinstance(entry, dict):
        for key in (
            "vehicleRegistrationNumber",
            "registrationNumber",
            "vehicleId",
            "vehicleRef",
            "vehicle",
            "id",
        ):
            if key in entry:
                raw_value = entry.get(key)
                if raw_value:
                    break
    if raw_value is None:
        return "", ""

    text = normalise_text(raw_value).upper()
    reg_key = normalise_reg_key(text)
    if not reg_key:
        return "", ""
    registration = text or reg_key
    return reg_key, registration


def fetch_live_bus_registrations() -> Tuple[Dict[str, str], bool]:
    if not TFL_VEHICLE_API_URL:
        return {}, False

    kwargs = build_tfl_request_kwargs()
    try:
        response = requests.get(TFL_VEHICLE_API_URL, timeout=15, **kwargs)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"[fleet-sync] Failed to fetch live vehicle data: {exc}", flush=True)
        return {}, False

    try:
        payload = response.json()
    except ValueError as exc:
        print(f"[fleet-sync] Invalid JSON payload from vehicle feed: {exc}", flush=True)
        return {}, False

    registrations: Dict[str, str] = {}
    for entry in _iter_vehicle_entries(payload):
        reg_key, registration = extract_vehicle_registration(entry)
        if not reg_key or reg_key in registrations:
            continue
        registrations[reg_key] = registration
    return registrations, True


def upsert_collection_item(
    connection,
    collection: str,
    item_id: str,
    data: Dict[str, Any],
):
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            INSERT INTO app_collections (collection, item_id, data)
            VALUES (%s, %s, %s)
            ON CONFLICT (collection, item_id)
            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
            RETURNING item_id, data, created_at, updated_at
            """,
            (collection, item_id, Json(data)),
        )
        return cursor.fetchone()


def delete_collection_item(connection, collection: str, item_id: str) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM app_collections WHERE collection = %s AND item_id = %s",
            (collection, item_id),
        )
        return cursor.rowcount


def fetch_collection_items(connection, collection: str) -> List[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT item_id, data
            FROM app_collections
            WHERE collection = %s
            ORDER BY updated_at ASC
            """,
            (collection,),
        )
        return cursor.fetchall() or []


def ensure_fleet_option(connection, field: str, value: Any) -> None:
    if field not in FLEET_OPTION_FIELDS:
        return
    text = normalise_text(value)
    if not text:
        return
    collection = f"{FLEET_OPTION_PREFIX}{field}"
    item_id = normalise_option_id(text)
    if not item_id:
        return
    upsert_collection_item(connection, collection, item_id, {"value": text})


def fetch_fleet_options(connection) -> Dict[str, List[str]]:
    options: Dict[str, List[str]] = {field: [] for field in FLEET_OPTION_FIELDS}
    for field in FLEET_OPTION_FIELDS:
        collection = f"{FLEET_OPTION_PREFIX}{field}"
        rows = fetch_collection_items(connection, collection)
        values = []
        for row in rows:
            data = row.get("data") or {}
            value = normalise_text(data.get("value"))
            if value:
                values.append(value)
        unique = sorted(set(values), key=lambda item: item.lower())
        options[field] = unique
    return options


def sanitise_bus_payload(
    payload: Dict[str, Any],
    *,
    fallback_created_at: Optional[str] = None,
) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ApiError("A bus payload is required.", status_code=400)

    registration = normalise_text(payload.get("registration")).upper()
    reg_key = normalise_reg_key(payload.get("regKey") or registration)
    if not reg_key:
        raise ApiError("A vehicle registration is required.", status_code=400)

    registration = registration or reg_key
    now_iso = iso_now()
    created_at = normalise_text(payload.get("createdAt")) or fallback_created_at or now_iso
    last_updated = normalise_text(payload.get("lastUpdated")) or now_iso

    return {
        "regKey": reg_key,
        "registration": registration,
        "fleetNumber": normalise_text(payload.get("fleetNumber")),
        "operator": normalise_text(payload.get("operator")),
        "status": normalise_text(payload.get("status")),
        "wrap": normalise_text(payload.get("wrap")),
        "vehicleType": normalise_text(payload.get("vehicleType")),
        "doors": normalise_text(payload.get("doors")),
        "engineType": normalise_text(payload.get("engineType")),
        "engine": normalise_text(payload.get("engine")),
        "chassis": normalise_text(payload.get("chassis")),
        "bodyType": normalise_text(payload.get("bodyType")),
        "registrationDate": normalise_date(payload.get("registrationDate")),
        "garage": normalise_text(payload.get("garage")),
        "extras": sanitise_extras(payload.get("extras")),
        "length": normalise_text(payload.get("length")),
        "isNewBus": to_bool(payload.get("isNewBus")),
        "isRareWorking": to_bool(payload.get("isRareWorking")),
        "createdAt": created_at,
        "lastUpdated": last_updated,
    }


def get_fleet_bus(connection, reg_key: str) -> Optional[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT item_id, data
            FROM app_collections
            WHERE collection = %s AND item_id = %s
            """,
            (FLEET_COLLECTION_BUSES, reg_key),
        )
        row = cursor.fetchone()
        if not row:
            return None
        data = row.get("data") or {}
        data.setdefault("regKey", row.get("item_id") or reg_key)
        data.setdefault("registration", data.get("registration") or data.get("regKey") or reg_key)
        return data


def upsert_fleet_bus(
    connection,
    payload: Dict[str, Any],
    *,
    fallback_created_at: Optional[str] = None,
) -> Dict[str, Any]:
    sanitized = sanitise_bus_payload(payload, fallback_created_at=fallback_created_at)

    for field in FLEET_OPTION_FIELDS:
        if field == "extras":
            for tag in sanitized.get("extras", []):
                ensure_fleet_option(connection, field, tag)
        else:
            ensure_fleet_option(connection, field, sanitized.get(field))

    row = upsert_collection_item(
        connection,
        FLEET_COLLECTION_BUSES,
        sanitized["regKey"],
        sanitized,
    )
    return (row or {}).get("data", sanitized)


def maybe_sync_live_buses(connection, existing_reg_keys: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    global _last_fleet_sync_attempt, _last_fleet_sync_success

    if not FLEET_AUTO_SYNC_ENABLED:
        return []

    if existing_reg_keys is None:
        existing_reg_keys = set()

    now = time.monotonic()
    if (
        FLEET_AUTO_SYNC_INTERVAL_SECONDS > 0
        and now - _last_fleet_sync_attempt < FLEET_AUTO_SYNC_INTERVAL_SECONDS
    ):
        return []

    with _fleet_sync_lock:
        now = time.monotonic()
        if (
            FLEET_AUTO_SYNC_INTERVAL_SECONDS > 0
            and now - _last_fleet_sync_attempt < FLEET_AUTO_SYNC_INTERVAL_SECONDS
        ):
            return []

        _last_fleet_sync_attempt = now
        registrations, success = fetch_live_bus_registrations()
        if not success or not registrations:
            return []

        created: List[Dict[str, Any]] = []
        for reg_key, registration in registrations.items():
            if reg_key in existing_reg_keys:
                continue
            now_iso = iso_now()
            try:
                bus = upsert_fleet_bus(
                    connection,
                    {
                        "regKey": reg_key,
                        "registration": registration,
                        "createdAt": now_iso,
                        "lastUpdated": now_iso,
                    },
                    fallback_created_at=now_iso,
                )
            except ApiError as exc:
                print(
                    f"[fleet-sync] Skipped vehicle {reg_key}: {exc}",
                    flush=True,
                )
                continue
            created.append(bus)
            existing_reg_keys.add(reg_key)

        if created:
            connection.commit()
            print(
                f"[fleet-sync] Added {len(created)} new vehicles from TfL feed",
                flush=True,
            )
        _last_fleet_sync_success = time.monotonic()
        return created


def delete_pending_for_reg(connection, reg_key: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            DELETE FROM app_collections
            WHERE collection = %s AND data->>'regKey' = %s
            """,
            (FLEET_COLLECTION_PENDING, reg_key),
        )


def get_pending_change(connection, change_id: str) -> Optional[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT item_id, data
            FROM app_collections
            WHERE collection = %s AND item_id = %s
            """,
            (FLEET_COLLECTION_PENDING, change_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        data = row.get("data") or {}
        data.setdefault("id", row.get("item_id") or change_id)
        return data


def create_pending_change(
    connection,
    reg_key: str,
    registration: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    delete_pending_for_reg(connection, reg_key)

    change_id = uuid.uuid4().hex
    sanitized = sanitise_bus_payload(
        {**payload, "regKey": reg_key, "registration": registration},
    )
    sanitized.pop("createdAt", None)
    sanitized.pop("lastUpdated", None)

    pending_data = {
        "id": change_id,
        "regKey": reg_key,
        "registration": registration,
        "submittedAt": iso_now(),
        "status": "pending",
        "data": sanitized,
    }

    upsert_collection_item(
        connection,
        FLEET_COLLECTION_PENDING,
        change_id,
        pending_data,
    )
    return pending_data


def fetch_fleet_state(connection) -> Dict[str, Any]:
    options = fetch_fleet_options(connection)

    buses: Dict[str, Dict[str, Any]] = {}
    for row in fetch_collection_items(connection, FLEET_COLLECTION_BUSES):
        data = row.get("data") or {}
        reg_key = normalise_reg_key(data.get("regKey") or row.get("item_id"))
        if not reg_key:
            continue
        data.setdefault("regKey", reg_key)
        data.setdefault("registration", data.get("registration") or reg_key)
        buses[reg_key] = data

    existing_keys = set(buses.keys())
    for bus in maybe_sync_live_buses(connection, existing_keys):
        reg_key = normalise_reg_key(bus.get("regKey"))
        if not reg_key:
            continue
        buses[reg_key] = bus

    pending: List[Dict[str, Any]] = []
    for row in fetch_collection_items(connection, FLEET_COLLECTION_PENDING):
        data = row.get("data") or {}
        status = normalise_text(data.get("status")) or "pending"
        if status != "pending":
            continue
        data.setdefault("id", row.get("item_id"))
        pending.append(data)
    pending.sort(key=lambda item: item.get("submittedAt") or "", reverse=True)

    return {
        "options": options,
        "buses": buses,
        "pendingChanges": pending,
    }


def require_fleet_admin() -> None:
    if not FLEET_ADMIN_CODE:
        return
    provided = normalise_text(request.headers.get("X-Fleet-Admin-Code"))
    if provided != normalise_text(FLEET_ADMIN_CODE):
        raise ApiError("Administrator access is required.", status_code=403)


def seed_default_fleet() -> None:
    with get_connection() as connection:
        for field, values in DEFAULT_FLEET_OPTIONS.items():
            for value in values:
                ensure_fleet_option(connection, field, value)

        for reg_key, details in DEFAULT_FLEET_BUSES.items():
            normalised = normalise_reg_key(reg_key)
            if not normalised:
                continue
            existing = get_fleet_bus(connection, normalised)
            if existing is None:
                upsert_fleet_bus(connection, {**details, "regKey": normalised})

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


@app.route("/api/fleet", methods=["GET"])
def fleet_state():
    with get_connection() as connection:
        state = fetch_fleet_state(connection)
    return jsonify(state)


@app.route("/api/fleet/submit", methods=["POST"])
def fleet_submit():
    payload = request.get_json(silent=True) or {}
    bus_payload = payload.get("bus") if isinstance(payload, dict) else None
    if not isinstance(bus_payload, dict):
        bus_payload = payload

    registration_text = normalise_text(bus_payload.get("registration")).upper()
    reg_key = normalise_reg_key(bus_payload.get("regKey") or registration_text)
    if not reg_key:
        raise ApiError("A vehicle registration is required.", status_code=400)

    registration = registration_text or reg_key

    with get_connection() as connection:
        existing = get_fleet_bus(connection, reg_key)
        if existing is None:
            now_iso = iso_now()
            prepared = {
                **bus_payload,
                "regKey": reg_key,
                "registration": registration,
                "createdAt": bus_payload.get("createdAt") or now_iso,
                "lastUpdated": now_iso,
            }
            bus = upsert_fleet_bus(
                connection,
                prepared,
                fallback_created_at=prepared.get("createdAt"),
            )
            connection.commit()
            return jsonify({"status": "created", "bus": bus}), 201

        pending = create_pending_change(
            connection,
            reg_key,
            registration,
            {**bus_payload, "regKey": reg_key, "registration": registration},
        )
        connection.commit()
        return jsonify({"status": "pending", "change": pending}), 202


@app.route("/api/fleet/options", methods=["POST"])
def fleet_add_option():
    require_fleet_admin()
    payload = request.get_json(silent=True) or {}
    field = normalise_text(payload.get("field") or payload.get("category"))
    if field not in FLEET_OPTION_FIELDS:
        raise ApiError("A valid option field is required.", status_code=400)
    value = normalise_text(payload.get("value"))
    if not value:
        raise ApiError("An option value is required.", status_code=400)

    with get_connection() as connection:
        ensure_fleet_option(connection, field, value)
        options = fetch_fleet_options(connection)
        connection.commit()

    return jsonify({"field": field, "options": options.get(field, [])}), 201


@app.route("/api/fleet/pending/<change_id>/approve", methods=["POST"])
def fleet_approve(change_id: str):
    require_fleet_admin()
    change_key = normalise_text(change_id)
    if not change_key:
        raise ApiError("A pending change id is required.", status_code=400)

    with get_connection() as connection:
        pending = get_pending_change(connection, change_key)
        if pending is None:
            raise ApiError("Pending update not found.", status_code=404)

        reg_key = normalise_reg_key(pending.get("regKey"))
        if not reg_key:
            raise ApiError("Pending update is missing a registration.", status_code=400)

        registration = normalise_text(pending.get("registration")) or reg_key
        existing = get_fleet_bus(connection, reg_key) or {}
        merged = {
            **existing,
            **(pending.get("data") or {}),
            "regKey": reg_key,
            "registration": registration,
        }
        created_at = merged.get("createdAt") or existing.get("createdAt") or iso_now()
        merged["createdAt"] = created_at
        merged["lastUpdated"] = iso_now()

        bus = upsert_fleet_bus(
            connection,
            merged,
            fallback_created_at=created_at,
        )

        delete_collection_item(connection, FLEET_COLLECTION_PENDING, pending.get("id") or change_key)
        connection.commit()

    return jsonify({"status": "approved", "bus": bus})


@app.route("/api/fleet/pending/<change_id>/reject", methods=["POST"])
def fleet_reject(change_id: str):
    require_fleet_admin()
    change_key = normalise_text(change_id)
    if not change_key:
        raise ApiError("A pending change id is required.", status_code=400)

    with get_connection() as connection:
        pending = get_pending_change(connection, change_key)
        if pending is None:
            raise ApiError("Pending update not found.", status_code=404)
        delete_collection_item(connection, FLEET_COLLECTION_PENDING, pending.get("id") or change_key)
        connection.commit()

    return jsonify({"status": "rejected"})


@app.route("/api/health", methods=["GET"])
def healthcheck():
    return jsonify({"status": "ok"})


init_database()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
