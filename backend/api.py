import json
import os
import re
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import parse_qsl, urljoin, urlparse

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
FIREBASE_AUTH_DOMAIN = os.getenv("FIREBASE_AUTH_DOMAIN", "routeflow-london.firebaseapp.com")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "routeflow-london")
FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "routeflow-london.firebasestorage.app")
FIREBASE_MESSAGING_SENDER_ID = os.getenv("FIREBASE_MESSAGING_SENDER_ID", "368346241440")
FIREBASE_APP_ID = os.getenv("FIREBASE_APP_ID", "1:368346241440:web:7cc87d551420459251ecc5")
MAX_CONNECTIONS = int(os.getenv("DB_MAX_CONNECTIONS", "5"))
TFL_APP_ID = os.getenv("TFL_APP_ID")
TFL_APP_KEY = os.getenv("TFL_APP_KEY") or os.getenv("TFL_API_KEY") or os.getenv("TFL_KEY")
TFL_SUBSCRIPTION_KEY = os.getenv("TFL_SUBSCRIPTION_KEY") or os.getenv("TFL_SUBSCRIPTION")
TFL_VEHICLE_API_URL = os.getenv(
    "TFL_VEHICLE_API_URL",
    "https://api.tfl.gov.uk/Vehicle/Occupancy/Buses",
)
TFL_VEHICLE_PAGE_SIZE = max(_env_int("TFL_VEHICLE_PAGE_SIZE", 500), 1)
TFL_VEHICLE_MAX_PAGES = max(_env_int("TFL_VEHICLE_MAX_PAGES", 50), 1)
TFL_API_BASE_URL = (os.getenv("TFL_API_BASE_URL", "https://api.tfl.gov.uk/") or "https://api.tfl.gov.uk/").rstrip("/") + "/"
TFL_API_TIMEOUT_SECONDS = max(_env_int("TFL_API_TIMEOUT_SECONDS", 15), 1)
FLEET_AUTO_SYNC_ENABLED = _as_bool(os.getenv("FLEET_AUTO_SYNC_ENABLED"), default=True)
FLEET_AUTO_SYNC_INTERVAL_SECONDS = max(
    _env_int("FLEET_AUTO_SYNC_INTERVAL_SECONDS", _env_int("FLEET_AUTO_SYNC_INTERVAL", 300)),
    0,
)

DEFAULT_TFL_REGISTRATION_ENDPOINTS: Tuple[str, ...] = (
    "Vehicle/Occupancy/Buses",
    "Line/Mode/bus/Arrivals",
    "Line/Mode/bus/Status",
    "Line/Mode/bus/Route/Sequence/all",
    "StopPoint/Mode/bus",
    "Vehicle",
)


def _split_config_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    entries: List[str] = []
    for line in str(value).replace(";", "\n").splitlines():
        for item in line.split(","):
            text = item.strip()
            if text:
                entries.append(text)
    return entries


def _unique_sequence(items: List[str]) -> List[str]:
    seen: Set[str] = set()
    unique: List[str] = []
    for item in items:
        key = item.strip()
        if not key:
            continue
        normalised = key.lower()
        if normalised in seen:
            continue
        seen.add(normalised)
        unique.append(key)
    return unique


_configured_registration_endpoints = _split_config_list(
    os.getenv("TFL_REGISTRATION_ENDPOINTS")
)

_raw_registration_endpoints: List[str] = []
if TFL_VEHICLE_API_URL:
    _raw_registration_endpoints.append(TFL_VEHICLE_API_URL)
if _configured_registration_endpoints:
    _raw_registration_endpoints.extend(_configured_registration_endpoints)
else:
    _raw_registration_endpoints.extend(DEFAULT_TFL_REGISTRATION_ENDPOINTS)

TFL_REGISTRATION_ENDPOINTS: List[str] = _unique_sequence(_raw_registration_endpoints)

NEW_BUS_DURATION = timedelta(hours=24)
NEW_BUS_EXTRA_LABEL = "New Bus"

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


def _build_tfl_api_url(path: str) -> str:
    normalised_path = str(path or "").lstrip("/")
    return urljoin(TFL_API_BASE_URL, normalised_path)


@app.route("/api/tfl/<path:subpath>", methods=["GET"])
def proxy_tfl_api(subpath: str) -> Response:
    upstream_url = _build_tfl_api_url(subpath)

    query_params: List[Tuple[str, str]] = list(request.args.items(multi=True))
    existing_param_keys: Set[str] = {key for key, _ in query_params}

    proxy_kwargs = build_tfl_request_kwargs()
    for key, value in proxy_kwargs.get("params", {}).items():
        if key not in existing_param_keys:
            query_params.append((key, value))

    headers = dict(proxy_kwargs.get("headers", {}))

    try:
        upstream_response = requests.get(
            upstream_url,
            params=query_params or None,
            headers=headers or None,
            timeout=TFL_API_TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        app.logger.warning("TfL proxy request failed for %s: %s", upstream_url, error)
        return jsonify({"error": "Unable to reach TfL API"}), 502

    response = make_response(upstream_response.content, upstream_response.status_code)

    content_type = upstream_response.headers.get("Content-Type")
    if content_type:
        response.headers["Content-Type"] = content_type

    for header_name in ("Cache-Control", "ETag", "Last-Modified"):
        header_value = upstream_response.headers.get(header_name)
        if header_value:
            response.headers[header_name] = header_value

    return response


@app.route("/config.js")
def client_config() -> Response:
    firebase_config = {
        "apiKey": FIREBASE_API_KEY,
        "authDomain": FIREBASE_AUTH_DOMAIN,
        "projectId": FIREBASE_PROJECT_ID,
        "storageBucket": FIREBASE_STORAGE_BUCKET,
        "messagingSenderId": FIREBASE_MESSAGING_SENDER_ID,
        "appId": FIREBASE_APP_ID,
    }

    payload = {
        "firebase": firebase_config,
    }

    script = "window.__ROUTEFLOW_CONFIG__ = Object.assign({}, window.__ROUTEFLOW_CONFIG__, {});".format(
        json.dumps(payload, separators=(",", ":"))
    )
    response = make_response(script)
    response.headers["Content-Type"] = "application/javascript; charset=utf-8"
    response.headers["Cache-Control"] = "no-store"
    return response

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


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = normalise_text(value)
        if not text:
            return None
        cleaned = text.replace("Z", "+00:00") if text.endswith("Z") else text
        try:
            parsed = datetime.fromisoformat(cleaned)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalise_datetime(value: Any) -> str:
    if value in (None, ""):
        return ""
    parsed = parse_iso_datetime(value)
    if parsed is None:
        text = normalise_text(value)
        return text
    return parsed.isoformat()


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


def _extract_next_link(payload: Any) -> Optional[str]:
    queue: List[Any] = [payload]
    seen: Set[int] = set()

    while queue:
        current = queue.pop(0)
        identifier = id(current)
        if identifier in seen:
            continue
        seen.add(identifier)

        if isinstance(current, dict):
            for key in (
                "@odata.nextLink",
                "nextLink",
                "next",
                "next_page",
                "nextPage",
                "nextUrl",
                "nextURI",
                "nextHref",
            ):
                if key not in current:
                    continue
                value = current.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
                if isinstance(value, dict):
                    queue.append(value)

            for value in current.values():
                if isinstance(value, (dict, list)):
                    queue.append(value)

        elif isinstance(current, list):
            for item in current:
                if isinstance(item, (dict, list)):
                    queue.append(item)

    return None


def _prepare_next_request(link: str) -> Tuple[str, Dict[str, Any]]:
    absolute = urljoin(TFL_VEHICLE_API_URL, str(link))
    parsed = urlparse(absolute)
    params = dict(parse_qsl(parsed.query or "", keep_blank_values=False))

    if parsed.scheme and parsed.netloc:
        base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    else:
        base_url = urljoin(TFL_VEHICLE_API_URL, parsed.path or "")

    base_url = base_url or TFL_VEHICLE_API_URL
    return base_url, params


def fetch_live_bus_registrations() -> Tuple[Dict[str, str], bool]:
    if not TFL_VEHICLE_API_URL:
        return {}, False

    kwargs = build_tfl_request_kwargs()
    base_params = dict(kwargs.get("params") or {})
    headers = dict(kwargs.get("headers") or {})

    registrations: Dict[str, str] = {}
    success = False

    manual_page = 1
    manual_params: Dict[str, Any] = {"page": manual_page}
    if TFL_VEHICLE_PAGE_SIZE:
        manual_params["pageSize"] = TFL_VEHICLE_PAGE_SIZE

    next_request: Optional[Tuple[str, Dict[str, Any]]] = (
        TFL_VEHICLE_API_URL,
        manual_params,
    )

    used_next_link = False
    requests_made = 0

    while next_request and requests_made < TFL_VEHICLE_MAX_PAGES:
        requests_made += 1
        url, extra_params = next_request
        params = dict(base_params)
        if extra_params:
            for key, value in extra_params.items():
                if value not in (None, ""):
                    params[key] = value

        try:
            response = requests.get(url, params=params, headers=headers, timeout=30)
            response.raise_for_status()
        except requests.RequestException as exc:
            print(f"[fleet-sync] Failed to fetch live vehicle data: {exc}", flush=True)
            return registrations, success

        try:
            payload = response.json()
        except ValueError as exc:
            print(f"[fleet-sync] Invalid JSON payload from vehicle feed: {exc}", flush=True)
            return registrations, success

        success = True

        new_count = 0
        for entry in _iter_vehicle_entries(payload):
            reg_key, registration = extract_vehicle_registration(entry)
            if not reg_key or reg_key in registrations:
                continue
            registrations[reg_key] = registration
            new_count += 1

        link = _extract_next_link(payload)
        if link:
            used_next_link = True
            next_request = _prepare_next_request(link)
            continue

        if new_count == 0:
            next_request = None
            break

        if used_next_link:
            next_request = None
            break

        manual_page += 1
        manual_params = {"page": manual_page}
        if TFL_VEHICLE_PAGE_SIZE:
            manual_params["pageSize"] = TFL_VEHICLE_PAGE_SIZE
        next_request = (TFL_VEHICLE_API_URL, manual_params)

    if registrations:
        print(
            f"[fleet-sync] Retrieved {len(registrations)} vehicle registrations from TfL feed",
            flush=True,
        )

    return registrations, success


def _endpoint_matches_vehicle_feed(endpoint: str) -> bool:
    text = (endpoint or "").strip()
    if not text:
        return False
    lower_value = text.lower()
    if TFL_VEHICLE_API_URL and lower_value == TFL_VEHICLE_API_URL.strip().lower():
        return True
    if lower_value == "vehicle/occupancy/buses":
        return True
    try:
        parsed = urlparse(text)
    except ValueError:
        return False
    path = (parsed.path or "").strip("/").lower()
    return path == "vehicle/occupancy/buses"


def fetch_registrations_from_endpoint(endpoint: str) -> Tuple[Dict[str, str], bool]:
    target = (endpoint or "").strip()
    if not target:
        return {}, False

    if _endpoint_matches_vehicle_feed(target):
        return fetch_live_bus_registrations()

    url = target if "://" in target else _build_tfl_api_url(target)
    kwargs = build_tfl_request_kwargs()
    base_params = dict(kwargs.get("params") or {})
    headers = dict(kwargs.get("headers") or {})

    registrations: Dict[str, str] = {}
    success = False
    next_request: Optional[Tuple[str, Dict[str, Any]]] = (url, None)
    requests_made = 0

    while next_request and requests_made < TFL_VEHICLE_MAX_PAGES:
        requests_made += 1
        request_url, extra_params = next_request
        params = dict(base_params)
        if extra_params:
            for key, value in extra_params.items():
                if value not in (None, ""):
                    params[key] = value

        try:
            response = requests.get(
                request_url,
                params=params or None,
                headers=headers or None,
                timeout=TFL_API_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            print(
                f"[fleet-sync] Failed to fetch vehicle data from {request_url}: {exc}",
                flush=True,
            )
            break

        try:
            payload = response.json()
        except ValueError as exc:
            print(
                f"[fleet-sync] Invalid JSON payload from {request_url}: {exc}",
                flush=True,
            )
            break

        success = True
        new_count = 0
        for entry in _iter_vehicle_entries(payload):
            reg_key, registration = extract_vehicle_registration(entry)
            if not reg_key or reg_key in registrations:
                continue
            registrations[reg_key] = registration
            new_count += 1

        link = _extract_next_link(payload)
        if link:
            next_request = _prepare_next_request(link)
            continue

        if new_count == 0:
            next_request = None
            break

        next_request = None

    if registrations:
        print(
            f"[fleet-sync] {len(registrations)} registrations discovered via {target}",
            flush=True,
        )

    return registrations, success


def fetch_all_bus_registrations() -> Tuple[Dict[str, str], bool]:
    aggregated: Dict[str, str] = {}
    any_success = False
    vehicle_feed_processed = False

    for endpoint in TFL_REGISTRATION_ENDPOINTS:
        if not endpoint:
            continue
        if _endpoint_matches_vehicle_feed(endpoint):
            if vehicle_feed_processed:
                continue
            vehicle_feed_processed = True

        registrations, success = fetch_registrations_from_endpoint(endpoint)
        if success:
            any_success = True
        for reg_key, registration in registrations.items():
            aggregated.setdefault(reg_key, registration)

    return aggregated, any_success


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
        "newUntil": normalise_datetime(payload.get("newUntil")),
        "isNewBus": to_bool(payload.get("isNewBus")),
        "isRareWorking": to_bool(payload.get("isRareWorking")),
        "createdAt": created_at,
        "lastUpdated": last_updated,
    }


def update_new_bus_state(bus: Dict[str, Any], *, now: Optional[datetime] = None) -> bool:
    if not isinstance(bus, dict):
        return False

    if now is None:
        now = datetime.now(timezone.utc)

    raw_new_until = bus.get("newUntil")
    parsed_new_until = parse_iso_datetime(raw_new_until)
    extras = sanitise_extras(bus.get("extras"))
    extras_lower = {normalise_text(tag).lower() for tag in extras}
    changed = False

    if parsed_new_until and parsed_new_until > now:
        iso_value = parsed_new_until.isoformat()
        if normalise_text(raw_new_until) != iso_value:
            bus["newUntil"] = iso_value
            changed = True
        if not bool(bus.get("isNewBus")):
            bus["isNewBus"] = True
            changed = True
        if "new bus" not in extras_lower:
            extras.append(NEW_BUS_EXTRA_LABEL)
            bus["extras"] = sanitise_extras(extras)
            changed = True
    else:
        if bool(bus.get("isNewBus")):
            bus["isNewBus"] = False
            changed = True
        if "new bus" in extras_lower:
            filtered = [tag for tag in extras if normalise_text(tag).lower() != "new bus"]
            bus["extras"] = sanitise_extras(filtered)
            changed = True
        if normalise_text(raw_new_until):
            bus["newUntil"] = ""
            changed = True

    if changed:
        bus["lastUpdated"] = iso_now()

    return changed


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
        registrations, success = fetch_all_bus_registrations()
        if not success or not registrations:
            return []

        created: List[Dict[str, Any]] = []
        for reg_key, registration in registrations.items():
            normalised_key = normalise_reg_key(reg_key)
            if not normalised_key:
                continue
            if normalised_key in existing_reg_keys:
                continue

            existing_bus = get_fleet_bus(connection, normalised_key)
            if existing_bus:
                existing_reg_keys.add(normalised_key)
                continue

            seen_at = datetime.now(timezone.utc)
            now_iso = seen_at.isoformat()
            registration_date = seen_at.date().isoformat()
            new_until_iso = (seen_at + NEW_BUS_DURATION).isoformat()
            try:
                bus = upsert_fleet_bus(
                    connection,
                    {
                        "regKey": normalised_key,
                        "registration": registration,
                        "registrationDate": registration_date,
                        "isNewBus": True,
                        "extras": [NEW_BUS_EXTRA_LABEL],
                        "newUntil": new_until_iso,
                        "createdAt": now_iso,
                        "lastUpdated": now_iso,
                    },
                    fallback_created_at=now_iso,
                )
            except ApiError as exc:
                print(
                    f"[fleet-sync] Skipped vehicle {normalised_key}: {exc}",
                    flush=True,
                )
                continue
            created.append(bus)
            existing_reg_keys.add(normalised_key)

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
    pending_updates: List[Dict[str, Any]] = []
    for row in fetch_collection_items(connection, FLEET_COLLECTION_BUSES):
        data = row.get("data") or {}
        reg_key = normalise_reg_key(data.get("regKey") or row.get("item_id"))
        if not reg_key:
            continue
        data.setdefault("regKey", reg_key)
        data.setdefault("registration", data.get("registration") or reg_key)
        if update_new_bus_state(data):
            pending_updates.append(data)
        buses[reg_key] = data

    if pending_updates:
        for bus in pending_updates:
            upsert_fleet_bus(
                connection,
                bus,
                fallback_created_at=bus.get("createdAt") or iso_now(),
            )
        connection.commit()

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
