import base64
import binascii
import json
import os
import random
import re
import statistics
import threading
import time
import uuid
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from math import atan2, cos, radians, sin, sqrt
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import parse_qsl, quote, urljoin, urlparse

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
FLEET_VEHICLE_HISTORY_DAYS = max(
    _env_int("FLEET_VEHICLE_HISTORY_DAYS", _env_int("FLEET_HISTORY_DAYS", 30)),
    1,
)

MAX_FLEET_IMAGE_BYTES = max(
    _env_int("FLEET_IMAGE_MAX_BYTES", 2_097_152),
    1,
)
MAX_FLEET_PENDING_IMAGES = max(
    _env_int("FLEET_IMAGE_MAX_PENDING", 6),
    0,
)
MAX_FLEET_GALLERY_IMAGES = max(
    _env_int("FLEET_GALLERY_MAX", 24),
    1,
)

LIVE_TRACKING_ENABLED = _as_bool(os.getenv("FLEET_LIVE_TRACKING_ENABLED"), default=False)
LIVE_TRACKING_INTERVAL_SECONDS = max(
    _env_int("FLEET_LIVE_TRACKING_INTERVAL_SECONDS", 20),
    5,
)
LIVE_TRACKING_CONCURRENCY = max(_env_int("FLEET_LIVE_TRACKING_CONCURRENCY", 6), 1)
LIVE_TRACKING_LAUNCH_DELAY_MS = max(
    _env_int("FLEET_LIVE_TRACKING_LAUNCH_DELAY_MS", 150),
    0,
)
LIVE_TRACKING_MAX_RETRIES = max(_env_int("FLEET_LIVE_TRACKING_MAX_RETRIES", 3), 1)
LIVE_TRACKING_BACKOFF_MS = max(
    _env_int("FLEET_LIVE_TRACKING_BACKOFF_MS", 500),
    0,
)
LIVE_TRACKING_STALE_SECONDS = max(
    _env_int("FLEET_LIVE_TRACKING_STALE_SECONDS", 90),
    10,
)
LIVE_TRACKING_LOG_LIMIT = max(
    _env_int("FLEET_LIVE_TRACKING_LOG_LIMIT", 2000),
    100,
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

NEW_BUS_DURATION = timedelta(days=FLEET_VEHICLE_HISTORY_DAYS)
NEW_BUS_EXTRA_LABEL = "New Bus"

NEW_BUS_PRIMARY_WINDOW_DAYS = 30
NEW_BUS_AUTO_EXPIRE_DAYS = 45
NEW_BUS_MAX_EXTENSION_DAYS = 60
NEW_BUS_LOW_ACTIVITY_THRESHOLD = 0.1

RARE_SHARE_THRESHOLD = 0.01
RARE_MIN_SIGHTINGS = 3
RARE_ZSCORE_THRESHOLD = -2.5
RARE_DECAY_DAYS = 14
RARE_OPERATOR_MISMATCH_THRESHOLD = 2
RARE_OPERATOR_MISMATCH_WINDOW_MINUTES = 45

BADGE_NEW_BUS = "new-bus"
BADGE_RARE_WORKING = "rare-working"
BADGE_LOAN = "loan-guest"
BADGE_WITHDRAWN = "withdrawn"

DEFAULT_ADMIN_UIDS: Set[str] = {
    "emKTnjbKIKfBjQzQEvpUOWOpFKc2",
}

DEFAULT_ADMIN_EMAILS: Set[str] = {
    "nmorris210509@gmail.com",
}

ADMIN_UID_ALLOWLIST: Set[str] = set(
    uid for uid in _split_config_list(os.getenv("ROUTEFLOW_ADMIN_UIDS")) if uid
)
ADMIN_UID_ALLOWLIST.update(DEFAULT_ADMIN_UIDS)

ADMIN_EMAIL_ALLOWLIST: Set[str] = {
    email.lower()
    for email in _split_config_list(os.getenv("ROUTEFLOW_ADMIN_EMAILS"))
    if email
}
ADMIN_EMAIL_ALLOWLIST.update(email.lower() for email in DEFAULT_ADMIN_EMAILS)

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

    payload_json = json.dumps(payload, separators=(",", ":"))
    script = (
        "window.__ROUTEFLOW_CONFIG__ = Object.assign({{}}, window.__ROUTEFLOW_CONFIG__ || {{}}, {payload});"
    ).format(payload=payload_json)
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
    "YX23LME": {
        "regKey": "YX23LME",
        "registration": "YX23 LME",
        "fleetNumber": "EV27",
        "operator": "Abellio London",
        "status": "Active",
        "wrap": "Special event",
        "vehicleType": "Single Decker",
        "doors": "2",
        "engineType": "Electric",
        "engine": "Alexander Dennis Enviro400EV",
        "chassis": "Alexander Dennis",
        "bodyType": "Caetano e.City Gold",
        "registrationDate": "2023-07-15",
        "garage": "WJ (Waterloo)",
        "extras": ["New Bus", "Route Branding"],
        "length": "12.4m",
        "isNewBus": True,
        "isRareWorking": False,
        "createdAt": "2023-07-15T00:00:00.000Z",
        "lastUpdated": "2024-04-27T13:12:00.000Z",
    },
    "BX71CUD": {
        "regKey": "BX71CUD",
        "registration": "BX71 CUD",
        "fleetNumber": "HV411",
        "operator": "Arriva London",
        "status": "Active",
        "wrap": "Standard",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Hybrid",
        "engine": "Volvo B5LH",
        "chassis": "Volvo B5LH",
        "bodyType": "Wright Gemini 3",
        "registrationDate": "2021-09-05",
        "garage": "NX (New Cross)",
        "extras": ["Night Bus Allocation"],
        "length": "11.2m",
        "isNewBus": False,
        "isRareWorking": True,
        "createdAt": "2021-09-05T00:00:00.000Z",
        "lastUpdated": "2024-05-08T08:42:00.000Z",
    },
    "SK21BGO": {
        "regKey": "SK21BGO",
        "registration": "SK21 BGO",
        "fleetNumber": "15360",
        "operator": "Stagecoach London",
        "status": "Active",
        "wrap": "Standard",
        "vehicleType": "Single Decker",
        "doors": "2",
        "engineType": "Hydrogen",
        "engine": "Wrightbus Hydrogen",
        "chassis": "Wrightbus StreetDeck",
        "bodyType": "Wright StreetDeck",
        "registrationDate": "2021-05-18",
        "garage": "LI (Leyton)",
        "extras": ["Training Vehicle"],
        "length": "10.2m",
        "isNewBus": False,
        "isRareWorking": False,
        "createdAt": "2021-05-18T00:00:00.000Z",
        "lastUpdated": "2024-02-19T11:05:00.000Z",
    },
    "YX68FFT": {
        "regKey": "YX68FFT",
        "registration": "YX68 FFT",
        "fleetNumber": "TEH1235",
        "operator": "Metroline",
        "status": "Active",
        "wrap": "Advertising wrap",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Hybrid",
        "engine": "Scania N250UD",
        "chassis": "Scania N-series",
        "bodyType": "Alexander Dennis Enviro400 MMC",
        "registrationDate": "2019-01-04",
        "garage": "HT (Holloway)",
        "extras": ["Route Branding"],
        "length": "11.2m",
        "isNewBus": False,
        "isRareWorking": False,
        "createdAt": "2019-01-04T00:00:00.000Z",
        "lastUpdated": "2024-03-02T17:28:00.000Z",
    },
    "LF67XYZ": {
        "regKey": "LF67XYZ",
        "registration": "LF67 XYZ",
        "fleetNumber": "EH201",
        "operator": "Go-Ahead London",
        "status": "Stored",
        "wrap": "Heritage",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Electric",
        "engine": "Alexander Dennis Enviro400EV",
        "chassis": "Alexander Dennis",
        "bodyType": "Alexander Dennis Enviro400 MMC",
        "registrationDate": "2017-11-30",
        "garage": "QB (Battersea)",
        "extras": ["Heritage Fleet"],
        "length": "10.6m",
        "isNewBus": False,
        "isRareWorking": False,
        "createdAt": "2017-11-30T00:00:00.000Z",
        "lastUpdated": "2024-01-14T12:01:00.000Z",
    },
    "BV70DFP": {
        "regKey": "BV70DFP",
        "registration": "BV70 DFP",
        "fleetNumber": "4085",
        "operator": "Abellio London",
        "status": "Active",
        "wrap": "Standard",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Electric",
        "engine": "Alexander Dennis Enviro400EV",
        "chassis": "Alexander Dennis",
        "bodyType": "Alexander Dennis Enviro400 MMC",
        "registrationDate": "2020-10-22",
        "garage": "QB (Battersea)",
        "extras": ["Route Branding"],
        "length": "11.2m",
        "isNewBus": False,
        "isRareWorking": False,
        "createdAt": "2020-10-22T00:00:00.000Z",
        "lastUpdated": "2024-04-11T06:58:00.000Z",
    },
    "YX70KCU": {
        "regKey": "YX70KCU",
        "registration": "YX70 KCU",
        "fleetNumber": "VMH2645",
        "operator": "Metroline",
        "status": "Active",
        "wrap": "Special event",
        "vehicleType": "Double Decker",
        "doors": "2",
        "engineType": "Hybrid",
        "engine": "Volvo B5LH",
        "chassis": "Volvo B5LH",
        "bodyType": "Wright Gemini 3",
        "registrationDate": "2020-09-18",
        "garage": "HT (Holloway)",
        "extras": ["Rare Working"],
        "length": "11.2m",
        "isNewBus": False,
        "isRareWorking": True,
        "createdAt": "2020-09-18T00:00:00.000Z",
        "lastUpdated": "2024-05-19T19:22:00.000Z",
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


def _extract_bearer_token() -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AuthError("Missing or invalid Authorization header", status_code=401)

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise AuthError("Missing authentication token", status_code=401)
    return token


def _lookup_firebase_user(token: str) -> Dict[str, Any]:
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
    if user_info.get("disabled"):
        raise AuthError("Authenticated user account is disabled", status_code=403)

    return user_info


def authenticate_firebase_user(expected_uid: Optional[str] = None) -> Dict[str, Any]:
    token = _extract_bearer_token()
    user_info = _lookup_firebase_user(token)

    if expected_uid is not None:
        token_uid = user_info.get("localId")
        if token_uid != expected_uid:
            raise AuthError("Authenticated user does not match requested profile", status_code=403)

    return user_info


def verify_firebase_token(uid: str) -> Dict[str, Any]:
    return authenticate_firebase_user(expected_uid=uid)


def _parse_custom_attributes(user_info: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(user_info, dict):
        return {}
    raw_attributes = user_info.get("customAttributes")
    if not raw_attributes:
        return {}
    if isinstance(raw_attributes, dict):
        return raw_attributes
    text = str(raw_attributes).strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError):
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def is_admin_user(user_info: Dict[str, Any]) -> bool:
    if not isinstance(user_info, dict):
        return False

    custom_attributes = _parse_custom_attributes(user_info)
    if custom_attributes.get("admin") is True:
        return True

    custom_claims = user_info.get("customClaims")
    if isinstance(custom_claims, dict) and custom_claims.get("admin"):
        return True

    email = normalise_text(user_info.get("email")).lower()
    if email and email in ADMIN_EMAIL_ALLOWLIST:
        return True

    uid = normalise_text(user_info.get("localId"))
    if uid and uid in ADMIN_UID_ALLOWLIST:
        return True

    return False


def require_authenticated_user() -> Dict[str, Any]:
    return authenticate_firebase_user()


def require_admin_user() -> Dict[str, Any]:
    user_info = authenticate_firebase_user()
    if not is_admin_user(user_info):
        raise AuthError("Administrator access is required.", status_code=403)
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
                CREATE TABLE IF NOT EXISTS profile_extras (
                    uid TEXT PRIMARY KEY,
                    display_name TEXT,
                    photo_url TEXT,
                    gender TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS operators (
                    operator_id SERIAL PRIMARY KEY,
                    slug TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    short_name TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_name_lower
                ON operators ((lower(name)));
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS buses (
                    reg TEXT PRIMARY KEY,
                    registration TEXT NOT NULL,
                    vehicle_id TEXT,
                    fleet_number TEXT,
                    operator_id INTEGER REFERENCES operators(operator_id),
                    home_operator_id INTEGER REFERENCES operators(operator_id),
                    status TEXT,
                    vehicle_type TEXT,
                    wrap TEXT,
                    first_seen TIMESTAMPTZ NOT NULL,
                    last_seen TIMESTAMPTZ NOT NULL,
                    current_route TEXT,
                    last_route_update TIMESTAMPTZ,
                    usual_routes JSONB NOT NULL DEFAULT '{}'::jsonb,
                    badges JSONB NOT NULL DEFAULT '[]'::jsonb,
                    badge_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
                    new_badge_reactivated_at TIMESTAMPTZ,
                    new_badge_extended_until TIMESTAMPTZ,
                    rare_badge_started_at TIMESTAMPTZ,
                    rare_badge_last_seen_at TIMESTAMPTZ,
                    rare_badge_suppressed_until TIMESTAMPTZ,
                    rare_badge_decay_at TIMESTAMPTZ,
                    rare_score JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_buses_registration_lower
                ON buses ((lower(registration)));
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS bus_sightings (
                    sighting_id BIGSERIAL PRIMARY KEY,
                    reg TEXT NOT NULL REFERENCES buses(reg) ON DELETE CASCADE,
                    seen_at TIMESTAMPTZ NOT NULL,
                    lat DOUBLE PRECISION,
                    lon DOUBLE PRECISION,
                    route TEXT,
                    stop_code TEXT,
                    destination TEXT,
                    operator_id INTEGER REFERENCES operators(operator_id),
                    raw JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (reg, seen_at)
                );
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_bus_sightings_reg_seen
                ON bus_sightings (reg, seen_at DESC);
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_bus_sightings_route_seen
                ON bus_sightings (route, seen_at DESC);
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS bus_history (
                    history_id BIGSERIAL PRIMARY KEY,
                    reg TEXT NOT NULL REFERENCES buses(reg) ON DELETE CASCADE,
                    event_type TEXT NOT NULL,
                    event_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    details JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_bus_history_reg_ts
                ON bus_history (reg, event_ts DESC);
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS edit_requests (
                    request_id UUID PRIMARY KEY,
                    reg TEXT NOT NULL REFERENCES buses(reg) ON DELETE CASCADE,
                    action TEXT NOT NULL,
                    badge TEXT,
                    payload JSONB,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_by TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    reviewed_by TEXT,
                    reviewed_at TIMESTAMPTZ,
                    reviewer_notes TEXT
                );
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_edit_requests_status
                ON edit_requests (status);
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS planned_diversions (
                    diversion_id BIGSERIAL PRIMARY KEY,
                    route TEXT NOT NULL,
                    start_at TIMESTAMPTZ NOT NULL,
                    end_at TIMESTAMPTZ NOT NULL,
                    source TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_planned_diversions_route
                ON planned_diversions (route, start_at, end_at);
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


def sanitise_image_entry(
    entry: Any,
    *,
    status: str = "pending",
    submitted_by: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None

    data_url = normalise_text(
        entry.get("dataUrl")
        or entry.get("dataURL")
        or entry.get("url")
        or entry.get("source")
    )
    if not data_url:
        return None

    if "," not in data_url:
        raise ApiError("Image data must be a base64 data URL.", status_code=400)

    header, encoded = data_url.split(",", 1)
    header = header.strip()
    encoded = encoded.strip()
    if not header.startswith("data:"):
        raise ApiError("Image data must be a base64 data URL.", status_code=400)

    metadata = header[5:]
    parts = [part.strip() for part in metadata.split(";") if part.strip()]
    if "base64" not in {part.lower() for part in parts}:
        raise ApiError("Image data must be base64 encoded.", status_code=400)

    content_type = "application/octet-stream"
    for part in parts:
        if part.lower() != "base64":
            content_type = part
            break

    try:
        binary = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ApiError("Image data could not be decoded.", status_code=400) from exc

    if len(binary) > MAX_FLEET_IMAGE_BYTES:
        limit_kb = round(MAX_FLEET_IMAGE_BYTES / 1024)
        raise ApiError(
            f"Images must be smaller than {limit_kb} KB.",
            status_code=400,
        )

    sanitized_data_url = (
        f"data:{content_type};base64,{base64.b64encode(binary).decode('ascii')}"
    )

    image_id = normalise_text(entry.get("id")) or uuid.uuid4().hex
    name = normalise_text(entry.get("name")) or f"image-{image_id}"
    status_value = normalise_text(entry.get("status")) or status or "pending"

    submitted_at = (
        normalise_datetime(entry.get("submittedAt") or entry.get("createdAt"))
        or iso_now()
    )

    submitted_by_value = submitted_by or normalise_text(
        entry.get("submittedBy") or entry.get("submitted_by")
    )

    payload: Dict[str, Any] = {
        "id": image_id,
        "name": name,
        "contentType": content_type,
        "size": len(binary),
        "dataUrl": sanitized_data_url,
        "status": status_value.lower(),
        "submittedAt": submitted_at,
    }

    if submitted_by_value:
        payload["submittedBy"] = submitted_by_value

    approved_at = normalise_datetime(entry.get("approvedAt") or entry.get("reviewedAt"))
    if status_value.lower() == "approved":
        payload["status"] = "approved"
        payload["approvedAt"] = approved_at or iso_now()
        approved_by = normalise_text(entry.get("approvedBy") or entry.get("reviewedBy"))
        if approved_by:
            payload["approvedBy"] = approved_by
    elif approved_at:
        payload["approvedAt"] = approved_at

    return payload


def sanitise_gallery(
    entries: Any,
    *,
    status: str = "pending",
    submitted_by: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    if not entries:
        return []

    if not isinstance(entries, (list, tuple, set)):
        entries = [entries]

    cleaned: List[Dict[str, Any]] = []
    for entry in entries:
        entry_status = ""
        if isinstance(entry, dict):
            entry_status = normalise_text(entry.get("status"))
        target_status = entry_status or status or "pending"
        sanitized = sanitise_image_entry(
            entry,
            status=target_status,
            submitted_by=submitted_by,
        )
        if not sanitized:
            continue
        cleaned.append(sanitized)
        if limit and len(cleaned) >= limit:
            break

    return cleaned


def merge_gallery_entries(
    existing: Sequence[Dict[str, Any]],
    additions: Sequence[Dict[str, Any]],
    *,
    limit: int = MAX_FLEET_GALLERY_IMAGES,
) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    for source in existing or []:
        if not isinstance(source, dict):
            continue
        identifier = normalise_text(source.get("id")) or uuid.uuid4().hex
        if identifier in seen:
            continue
        seen.add(identifier)
        merged.append(dict(source))

    for addition in additions or []:
        if not isinstance(addition, dict):
            continue
        identifier = normalise_text(addition.get("id")) or uuid.uuid4().hex
        if identifier in seen:
            continue
        seen.add(identifier)
        merged.append(dict(addition))

    if limit and len(merged) > limit:
        merged = merged[-limit:]

    return merged


def slugify(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return ""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or ""


def operator_slug_from_name(name: str) -> str:
    slug = slugify(name)
    if slug:
        return slug
    return uuid.uuid4().hex


def normalise_operator_name(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return ""
    return re.sub(r"\s+", " ", text)


def ensure_operator(connection, name: Any, short_name: Optional[str] = None) -> Optional[int]:
    operator_name = normalise_operator_name(name)
    if not operator_name:
        return None
    slug = operator_slug_from_name(operator_name)
    short = normalise_text(short_name) or None

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT operator_id, short_name
            FROM operators
            WHERE lower(name) = lower(%s)
            LIMIT 1
            """,
            (operator_name,),
        )
        row = cursor.fetchone()
        if row:
            operator_id = row.get("operator_id")
            if operator_id and short and not normalise_text(row.get("short_name")):
                cursor.execute(
                    """
                    UPDATE operators
                    SET short_name = %s,
                        updated_at = NOW()
                    WHERE operator_id = %s
                    """,
                    (short, operator_id),
                )
            return operator_id

        cursor.execute(
            """
            INSERT INTO operators (slug, name, short_name)
            VALUES (%s, %s, %s)
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                short_name = COALESCE(EXCLUDED.short_name, operators.short_name),
                updated_at = NOW()
            RETURNING operator_id
            """,
            (slug, operator_name, short),
        )
        created = cursor.fetchone()
    if created:
        return created.get("operator_id")
    return None


def fetch_operator_by_id(connection, operator_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if not operator_id:
        return None
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT operator_id, slug, name, short_name, created_at, updated_at
            FROM operators
            WHERE operator_id = %s
            """,
            (operator_id,),
        )
        return cursor.fetchone()


def serialise_operator(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "id": row.get("operator_id"),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "shortName": row.get("short_name"),
        "createdAt": normalise_datetime(row.get("created_at")),
        "updatedAt": normalise_datetime(row.get("updated_at")),
    }


STATUS_ALIASES: Dict[str, str] = {
    "active": "Active",
    "in service": "Active",
    "in-service": "Active",
    "factory": "Factory",
    "awaiting service": "Awaiting Service",
    "awaiting-service": "Awaiting Service",
    "awaiting_service": "Awaiting Service",
    "inactive": "Inactive",
    "stored": "Stored",
    "withdrawn": "Withdrawn",
}


def normalise_status(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return ""
    lowered = text.lower()
    if lowered in STATUS_ALIASES:
        return STATUS_ALIASES[lowered]
    return text.title()


def normalise_vehicle_type(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return "Bus"
    lowered = text.lower()
    if "double" in lowered and "deck" in lowered:
        return "Double Decker"
    if "single" in lowered and "deck" in lowered:
        return "Single Decker"
    return text


def normalise_wrap(value: Any) -> Optional[str]:
    text = normalise_text(value)
    return text or None


def fetch_bus_row(connection, reg: Any) -> Optional[Dict[str, Any]]:
    reg_key = normalise_reg_key(reg)
    if not reg_key:
        return None
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT *
            FROM buses
            WHERE reg = %s
            """,
            (reg_key,),
        )
        return cursor.fetchone()


def coerce_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


EARTH_RADIUS_METRES = 6371000.0


def haversine_distance_metres(
    lat1: Optional[float],
    lon1: Optional[float],
    lat2: Optional[float],
    lon2: Optional[float],
) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return 0.0
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lon2 - lon1)
    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_METRES * c


def create_bus_profile(
    connection,
    reg_key: str,
    registration: str,
    seen_at: datetime,
    payload: Dict[str, Any],
    operator_id: Optional[int],
) -> Dict[str, Any]:
    vehicle_id = normalise_text(payload.get("vehicleId") or payload.get("vehicle_id")) or None
    fleet_number = normalise_text(payload.get("fleetNumber") or payload.get("fleet_number")) or None
    status = normalise_status(payload.get("status")) or "Active"
    vehicle_type = normalise_vehicle_type(payload.get("vehicleType") or payload.get("vehicle_type"))
    wrap = normalise_wrap(payload.get("wrap"))
    route = normalise_text(payload.get("route")) or None
    new_reactivation_at = seen_at
    new_extended_until = seen_at + timedelta(days=NEW_BUS_AUTO_EXPIRE_DAYS)

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            INSERT INTO buses (
                reg,
                registration,
                vehicle_id,
                fleet_number,
                operator_id,
                home_operator_id,
                status,
                vehicle_type,
                wrap,
                first_seen,
                last_seen,
                current_route,
                last_route_update,
                usual_routes,
                badges,
                badge_overrides,
                new_badge_reactivated_at,
                new_badge_extended_until,
                rare_score
            )
            VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, '{}'::jsonb,
                %s, %s, %s
            )
            ON CONFLICT (reg) DO UPDATE SET
                registration = EXCLUDED.registration,
                vehicle_id = COALESCE(EXCLUDED.vehicle_id, buses.vehicle_id),
                fleet_number = COALESCE(EXCLUDED.fleet_number, buses.fleet_number),
                operator_id = COALESCE(EXCLUDED.operator_id, buses.operator_id),
                home_operator_id = COALESCE(buses.home_operator_id, EXCLUDED.home_operator_id),
                status = COALESCE(EXCLUDED.status, buses.status),
                vehicle_type = COALESCE(EXCLUDED.vehicle_type, buses.vehicle_type),
                wrap = COALESCE(EXCLUDED.wrap, buses.wrap),
                first_seen = LEAST(buses.first_seen, EXCLUDED.first_seen),
                last_seen = GREATEST(buses.last_seen, EXCLUDED.last_seen),
                current_route = COALES(EXCLUDED.current_route, buses.current_route),
                last_route_update = COALES(EXCLUDED.last_route_update, buses.last_route_update),
                updated_at = NOW()
            RETURNING *
            """,
            (
                reg_key,
                registration,
                vehicle_id,
                fleet_number,
                operator_id,
                operator_id,
                status,
                vehicle_type,
                wrap,
                seen_at,
                seen_at,
                route,
                seen_at if route else None,
                Json({}),
                Json([]),
                new_reactivation_at,
                new_extended_until,
                Json({}),
            ),
        )
        return cursor.fetchone() or {}


def update_bus_record(
    connection,
    reg_key: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    if not updates:
        return fetch_bus_row(connection, reg_key)

    assignments: List[str] = []
    values: List[Any] = []
    for column, value in updates.items():
        assignments.append(f"{column} = %s")
        values.append(value)
    assignments.append("updated_at = NOW()")
    values.append(reg_key)

    sql = "UPDATE buses SET " + ", ".join(assignments) + " WHERE reg = %s RETURNING *"

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(sql, values)
        return cursor.fetchone()


def record_bus_history(
    connection,
    reg_key: str,
    event_type: str,
    details: Optional[Dict[str, Any]] = None,
    event_ts: Optional[datetime] = None,
) -> None:
    payload = details or {}
    timestamp = event_ts or datetime.now(timezone.utc)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO bus_history (reg, event_type, event_ts, details)
            VALUES (%s, %s, %s, %s)
            """,
            (reg_key, event_type, timestamp, Json(payload)),
        )


def upsert_bus_sighting(
    connection,
    reg_key: str,
    seen_at: datetime,
    payload: Dict[str, Any],
    operator_id: Optional[int],
) -> Optional[Dict[str, Any]]:
    lat = coerce_float(
        payload.get("lat")
        or payload.get("latitude")
        or payload.get("position", {}).get("lat")
    )
    lon = coerce_float(
        payload.get("lon")
        or payload.get("lng")
        or payload.get("longitude")
        or payload.get("position", {}).get("lon")
        or payload.get("position", {}).get("lng")
    )
    route = normalise_text(
        payload.get("route")
        or payload.get("lineName")
        or payload.get("line")
        or payload.get("routeId")
    )
    stop_code = normalise_text(
        payload.get("stopCode")
        or payload.get("stop_id")
        or payload.get("stopPointId")
    )
    destination = normalise_text(
        payload.get("destination")
        or payload.get("destinationName")
        or payload.get("headsign")
    )

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            INSERT INTO bus_sightings (
                reg,
                seen_at,
                lat,
                lon,
                route,
                stop_code,
                destination,
                operator_id,
                raw
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (reg, seen_at) DO UPDATE SET
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                route = EXCLUDED.route,
                stop_code = EXCLUDED.stop_code,
                destination = EXCLUDED.destination,
                operator_id = EXCLUDED.operator_id,
                raw = EXCLUDED.raw
            RETURNING sighting_id, reg, seen_at, lat, lon, route, stop_code, destination, operator_id, created_at
            """,
            (
                reg_key,
                seen_at,
                lat,
                lon,
                route or None,
                stop_code or None,
                destination or None,
                operator_id,
                Json(payload),
            ),
        )
        return cursor.fetchone()


def compute_usual_routes(
    connection,
    reg_key: str,
    now: Optional[datetime] = None,
) -> Tuple[Dict[str, Dict[str, Any]], int]:
    reference = now or datetime.now(timezone.utc)
    window_start = reference - timedelta(days=90)

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT route, COUNT(*) AS count, MAX(seen_at) AS last_seen
            FROM bus_sightings
            WHERE reg = %s AND seen_at >= %s AND route IS NOT NULL AND route <> ''
            GROUP BY route
            ORDER BY count DESC
            """,
            (reg_key, window_start),
        )
        rows = cursor.fetchall()

    distribution: Dict[str, Dict[str, Any]] = {}
    total = 0
    for row in rows:
        route = normalise_text(row.get("route"))
        if not route:
            continue
        count_value = row.get("count") or 0
        try:
            count = int(count_value)
        except (TypeError, ValueError):
            count = 0
        total += count
        distribution[route] = {
            "count": count,
            "share": 0.0,
            "lastSeen": normalise_datetime(row.get("last_seen")),
        }

    if total > 0:
        for details in distribution.values():
            details["share"] = round(details["count"] / total, 6)

    return distribution, total


def is_planned_diversion(
    connection,
    route: Optional[str],
    seen_at: Optional[datetime],
) -> bool:
    if not route or not seen_at:
        return False
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM planned_diversions
            WHERE route ILIKE %s
              AND start_at <= %s
              AND end_at >= %s
            LIMIT 1
            """,
            (route, seen_at, seen_at),
        )
        return cursor.fetchone() is not None


def count_operator_mismatch_sightings(
    connection,
    reg_key: str,
    operator_id: int,
    seen_at: datetime,
    window_minutes: int = RARE_OPERATOR_MISMATCH_WINDOW_MINUTES,
) -> int:
    window_start = seen_at - timedelta(minutes=window_minutes)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM bus_sightings
            WHERE reg = %s
              AND operator_id = %s
              AND seen_at >= %s
              AND seen_at <= %s
            """,
            (reg_key, operator_id, window_start, seen_at),
        )
        row = cursor.fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def calculate_route_z_score(counts: Sequence[int], target: int) -> Optional[float]:
    valid = [value for value in counts if value is not None]
    if not valid:
        return None
    if len(valid) == 1:
        base = valid[0]
        if base == 0:
            return None
        return (target - base) / max(base, 1)
    mean = statistics.mean(valid)
    stdev = statistics.pstdev(valid)
    if stdev == 0:
        if mean == 0:
            return None
        return (target - mean) / mean
    return (target - mean) / stdev


def compute_speed_sparkline(
    connection,
    reg_key: str,
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    reference = now or datetime.now(timezone.utc)
    window_start = reference - timedelta(minutes=10)
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT seen_at, lat, lon
            FROM bus_sightings
            WHERE reg = %s AND seen_at >= %s
            ORDER BY seen_at ASC
            """,
            (reg_key, window_start),
        )
        rows = cursor.fetchall()

    sparkline: List[Dict[str, Any]] = []
    previous: Optional[Dict[str, Any]] = None

    for row in rows:
        if previous:
            prev_seen = previous.get("seen_at")
            seen_at = row.get("seen_at")
            if prev_seen and seen_at and seen_at > prev_seen:
                distance = haversine_distance_metres(
                    previous.get("lat"),
                    previous.get("lon"),
                    row.get("lat"),
                    row.get("lon"),
                )
                elapsed = (seen_at - prev_seen).total_seconds()
                if elapsed > 0:
                    speed_kph = (distance / elapsed) * 3.6
                    sparkline.append(
                        {
                            "ts": normalise_datetime(seen_at),
                            "kph": round(speed_kph, 2),
                        }
                    )
        previous = row

    return sparkline


def evaluate_new_bus_state(
    bus_row: Dict[str, Any],
    total_sightings: int,
    now: datetime,
) -> Tuple[bool, Optional[datetime], Dict[str, Any]]:
    first_seen = parse_iso_datetime(bus_row.get("first_seen"))
    reactivated_at = parse_iso_datetime(bus_row.get("new_badge_reactivated_at"))
    extended_until = parse_iso_datetime(bus_row.get("new_badge_extended_until"))

    is_new = False
    base = None
    reason = ""

    if first_seen and now - first_seen <= timedelta(days=NEW_BUS_PRIMARY_WINDOW_DAYS):
        is_new = True
        base = first_seen
        reason = "first-seen"
    elif reactivated_at and now - reactivated_at <= timedelta(days=NEW_BUS_AUTO_EXPIRE_DAYS):
        is_new = True
        base = reactivated_at
        reason = "reactivated"

    expiry: Optional[datetime] = None
    if is_new and base:
        expiry = base + timedelta(days=NEW_BUS_AUTO_EXPIRE_DAYS)
        daily_activity = total_sightings / max(90, 1)
        if daily_activity <= NEW_BUS_LOW_ACTIVITY_THRESHOLD:
            extended_cap = base + timedelta(days=NEW_BUS_MAX_EXTENSION_DAYS)
            if expiry < extended_cap:
                expiry = extended_cap
    elif extended_until and extended_until > now:
        is_new = True
        expiry = extended_until
        reason = reason or "extended"

    state = {
        "reason": reason,
        "expiresAt": expiry,
    }

    return is_new, expiry, state


def evaluate_rare_working_state(
    connection,
    bus_row: Dict[str, Any],
    route: Optional[str],
    seen_at: datetime,
    distribution: Dict[str, Dict[str, Any]],
    total_sightings: int,
    operator_id: Optional[int],
    now: datetime,
) -> Dict[str, Any]:
    route_key = normalise_text(route)
    route_data = distribution.get(route_key) if route_key else None
    route_count = route_data.get("count") if route_data else 0
    share = route_data.get("share") if route_data else 0.0

    counts = [item.get("count") or 0 for item in distribution.values()]
    if route_key and route_key not in distribution:
        counts.append(route_count)
    z_score = calculate_route_z_score(counts, route_count or 0)

    triggered = False
    reason = None

    if route_key:
        if share < RARE_SHARE_THRESHOLD and route_count < RARE_MIN_SIGHTINGS:
            triggered = True
            reason = "low-share"
        elif z_score is not None and z_score < RARE_ZSCORE_THRESHOLD:
            triggered = True
            reason = "z-score"

    operator_loan = False
    home_operator_id = bus_row.get("home_operator_id")
    if (
        operator_id
        and home_operator_id
        and operator_id != home_operator_id
        and bus_row.get("reg")
    ):
        mismatch_count = count_operator_mismatch_sightings(
            connection, bus_row["reg"], operator_id, seen_at
        )
        if mismatch_count >= RARE_OPERATOR_MISMATCH_THRESHOLD:
            triggered = True
            operator_loan = True
            reason = "operator-loan"

    suppressed_until = parse_iso_datetime(bus_row.get("rare_badge_suppressed_until"))
    if suppressed_until and seen_at < suppressed_until:
        triggered = False
        reason = None

    if triggered and route_key and is_planned_diversion(connection, route_key, seen_at):
        triggered = False
        reason = None

    last_trigger = parse_iso_datetime(bus_row.get("rare_badge_last_seen_at"))
    decay_at = parse_iso_datetime(bus_row.get("rare_badge_decay_at"))

    if triggered:
        last_trigger = seen_at
        decay_at = seen_at + timedelta(days=RARE_DECAY_DAYS)
    elif last_trigger and now - last_trigger >= timedelta(days=RARE_DECAY_DAYS):
        decay_at = None

    active = triggered or (decay_at is not None and decay_at > now)

    return {
        "active": active,
        "triggered": triggered,
        "reason": reason,
        "lastTrigger": last_trigger,
        "decayAt": decay_at,
        "share": share,
        "count": route_count,
        "zScore": z_score,
        "operatorLoan": operator_loan,
    }


def badge_slug(value: Any) -> str:
    text = slugify(value)
    return text.replace("--", "-") if text else ""


def apply_badge_overrides(
    badges: Iterable[str],
    overrides: Optional[Dict[str, Any]],
) -> List[str]:
    active = {badge_slug(badge) for badge in badges if badge}
    if not overrides:
        return sorted(active)

    for key, config in overrides.items():
        slug = badge_slug(key)
        if not slug:
            continue
        state: Dict[str, Any]
        if isinstance(config, dict):
            state = config
        else:
            state = {"pinned": bool(config)}
        if any(state.get(flag) for flag in ("suppressed", "disabled", "unpinned")):
            active.discard(slug)
        if state.get("pinned") or state.get("enabled"):
            active.add(slug)

    return sorted(active)


def record_bus_sighting(
    connection,
    payload: Dict[str, Any],
    now: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    if not payload:
        return None

    now_dt = now or datetime.now(timezone.utc)
    reg_key, fallback_registration = extract_vehicle_registration(payload)
    if not reg_key:
        return None

    registration = normalise_text(payload.get("registration")) or fallback_registration
    seen_at = (
        parse_iso_datetime(
            payload.get("timestamp")
            or payload.get("seenAt")
            or payload.get("seen_at")
            or payload.get("recordedAt")
        )
        or now_dt
    )
    if seen_at > now_dt + timedelta(minutes=5):
        seen_at = now_dt

    operator_name = (
        payload.get("operator")
        or payload.get("operatorName")
        or payload.get("operator_name")
    )
    operator_short = (
        payload.get("operatorShort")
        or payload.get("operatorShortName")
        or payload.get("operatorCode")
    )
    operator_id = ensure_operator(connection, operator_name, operator_short)

    bus_row = fetch_bus_row(connection, reg_key)
    created = False
    if not bus_row:
        bus_row = create_bus_profile(
            connection,
            reg_key,
            registration,
            seen_at,
            payload,
            operator_id,
        )
        created = True
        record_bus_history(
            connection,
            reg_key,
            "profile-created",
            {"registration": registration},
            event_ts=seen_at,
        )

    updates: Dict[str, Any] = {}
    history_events: List[Tuple[str, Dict[str, Any], datetime]] = []

    local_bus = dict(bus_row)
    local_bus.setdefault("reg", reg_key)

    if registration and registration != bus_row.get("registration"):
        updates["registration"] = registration
        local_bus["registration"] = registration

    vehicle_id = normalise_text(payload.get("vehicleId") or payload.get("vehicle_id"))
    if vehicle_id and vehicle_id != normalise_text(bus_row.get("vehicle_id")):
        updates["vehicle_id"] = vehicle_id
        local_bus["vehicle_id"] = vehicle_id

    fleet_number = normalise_text(payload.get("fleetNumber") or payload.get("fleet_number"))
    if fleet_number and fleet_number != normalise_text(bus_row.get("fleet_number")):
        updates["fleet_number"] = fleet_number
        local_bus["fleet_number"] = fleet_number

    old_status = bus_row.get("status")
    status = normalise_status(payload.get("status")) or old_status
    if status and status != old_status:
        updates["status"] = status
        local_bus["status"] = status
        history_events.append(("status-updated", {"from": old_status, "to": status}, seen_at))
        if status == "Active" and old_status and old_status.lower() in {
            "factory",
            "awaiting service",
            "awaiting-service",
        }:
            updates["new_badge_reactivated_at"] = seen_at
            local_bus["new_badge_reactivated_at"] = seen_at

    if operator_id:
        old_operator_id = bus_row.get("operator_id")
        if old_operator_id != operator_id:
            updates["operator_id"] = operator_id
            local_bus["operator_id"] = operator_id
            history_events.append(
                (
                    "operator-updated",
                    {
                        "from": old_operator_id,
                        "to": operator_id,
                    },
                    seen_at,
                )
            )
        if not bus_row.get("home_operator_id"):
            updates.setdefault("home_operator_id", operator_id)
            local_bus["home_operator_id"] = operator_id

    wrap = normalise_wrap(payload.get("wrap"))
    if wrap is not None and wrap != bus_row.get("wrap"):
        updates["wrap"] = wrap
        local_bus["wrap"] = wrap

    vehicle_type = normalise_vehicle_type(payload.get("vehicleType") or payload.get("vehicle_type"))
    if vehicle_type and vehicle_type != bus_row.get("vehicle_type"):
        updates["vehicle_type"] = vehicle_type
        local_bus["vehicle_type"] = vehicle_type

    existing_last_seen = parse_iso_datetime(bus_row.get("last_seen"))
    if not existing_last_seen or seen_at > existing_last_seen:
        updates["last_seen"] = seen_at
        local_bus["last_seen"] = seen_at
    else:
        local_bus["last_seen"] = existing_last_seen

    if created:
        local_bus.setdefault("first_seen", seen_at)

    route_text = normalise_text(
        payload.get("route")
        or payload.get("lineName")
        or payload.get("line")
        or payload.get("routeId")
    )
    if route_text:
        updates["current_route"] = route_text
        updates["last_route_update"] = seen_at
        local_bus["current_route"] = route_text
        local_bus["last_route_update"] = seen_at

    sighting = upsert_bus_sighting(connection, reg_key, seen_at, payload, operator_id)

    distribution, total_sightings = compute_usual_routes(connection, reg_key, now=now_dt)

    is_new, new_expiry, new_state = evaluate_new_bus_state(local_bus, total_sightings, now_dt)
    rare_state = evaluate_rare_working_state(
        connection,
        local_bus,
        route_text,
        seen_at,
        distribution,
        total_sightings,
        operator_id,
        now_dt,
    )

    candidate_badges: Set[str] = set()
    if is_new:
        candidate_badges.add(BADGE_NEW_BUS)
    if local_bus.get("status") == "Withdrawn":
        candidate_badges.add(BADGE_WITHDRAWN)
    if rare_state.get("active"):
        candidate_badges.add(BADGE_RARE_WORKING)
    if rare_state.get("operatorLoan"):
        candidate_badges.add(BADGE_LOAN)

    overrides = bus_row.get("badge_overrides") if isinstance(bus_row.get("badge_overrides"), dict) else None
    final_badges = apply_badge_overrides(candidate_badges, overrides)

    updates["badges"] = Json(final_badges)
    updates["usual_routes"] = Json(distribution)
    updates["rare_score"] = Json(
        {
            "route": route_text,
            "count": rare_state.get("count"),
            "share": rare_state.get("share"),
            "zScore": rare_state.get("zScore"),
            "reason": rare_state.get("reason"),
            "operatorLoan": rare_state.get("operatorLoan"),
            "active": rare_state.get("active"),
            "lastTrigger": normalise_datetime(rare_state.get("lastTrigger")),
        }
    )
    if new_expiry:
        updates["new_badge_extended_until"] = new_expiry
    if rare_state.get("lastTrigger"):
        updates["rare_badge_last_seen_at"] = rare_state.get("lastTrigger")
        local_bus["rare_badge_last_seen_at"] = rare_state.get("lastTrigger")
    if rare_state.get("decayAt") is not None:
        updates["rare_badge_decay_at"] = rare_state.get("decayAt")
    if rare_state.get("triggered") and not bus_row.get("rare_badge_started_at"):
        updates["rare_badge_started_at"] = seen_at

    updated_bus = update_bus_record(connection, reg_key, updates) or fetch_bus_row(connection, reg_key)

    for event_type, details, event_ts in history_events:
        record_bus_history(connection, reg_key, event_type, details, event_ts=event_ts)

    if rare_state.get("triggered"):
        record_bus_history(
            connection,
            reg_key,
            "rare-working",
            {
                "route": route_text,
                "reason": rare_state.get("reason"),
                "operatorLoan": rare_state.get("operatorLoan"),
            },
            event_ts=seen_at,
        )

    result = {
        "bus": updated_bus,
        "sighting": sighting,
        "distribution": distribution,
        "badges": final_badges,
        "newState": {
            **new_state,
            "isNew": is_new,
        },
        "rareState": rare_state,
    }
    return result


def fetch_recent_sightings(
    connection,
    reg_key: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT sighting_id, reg, seen_at, lat, lon, route, stop_code, destination, operator_id, created_at
            FROM bus_sightings
            WHERE reg = %s
            ORDER BY seen_at DESC
            LIMIT %s
            """,
            (reg_key, max(1, limit)),
        )
        return cursor.fetchall() or []


def serialise_sighting(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "id": row.get("sighting_id"),
        "reg": row.get("reg"),
        "seenAt": normalise_datetime(row.get("seen_at")),
        "lat": row.get("lat"),
        "lon": row.get("lon"),
        "route": row.get("route"),
        "stopCode": row.get("stop_code"),
        "destination": row.get("destination"),
        "operatorId": row.get("operator_id"),
        "createdAt": normalise_datetime(row.get("created_at")),
    }


def fetch_bus_history(
    connection,
    reg_key: str,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT history_id, event_type, event_ts, details, created_at
            FROM bus_history
            WHERE reg = %s
            ORDER BY event_ts DESC
            LIMIT %s
            """,
            (reg_key, max(1, limit)),
        )
        return cursor.fetchall() or []


def serialise_history_event(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("history_id"),
        "type": row.get("event_type"),
        "occurredAt": normalise_datetime(row.get("event_ts")),
        "createdAt": normalise_datetime(row.get("created_at")),
        "details": row.get("details") or {},
    }


def serialise_bus_profile(
    connection,
    bus_row: Dict[str, Any],
    *,
    include_sightings: bool = False,
    include_history: bool = False,
    include_speed: bool = False,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    if not bus_row:
        return {}

    reg_key = bus_row.get("reg") or bus_row.get("reg_key")
    now_dt = now or datetime.now(timezone.utc)

    badges = bus_row.get("badges") or []
    if isinstance(badges, str):
        badges = [badges]

    distribution_raw = bus_row.get("usual_routes") or {}
    if not isinstance(distribution_raw, dict):
        distribution_raw = {}

    total_sightings = sum((details.get("count") or 0) for details in distribution_raw.values())
    is_new, new_expiry, new_state = evaluate_new_bus_state(bus_row, total_sightings, now_dt)

    rare_score = bus_row.get("rare_score") or {}
    if not isinstance(rare_score, dict):
        rare_score = {}

    operator = serialise_operator(fetch_operator_by_id(connection, bus_row.get("operator_id")))
    home_operator = serialise_operator(fetch_operator_by_id(connection, bus_row.get("home_operator_id")))

    last_seen_dt = parse_iso_datetime(bus_row.get("last_seen"))
    age_seconds = None
    freshness_state = "unknown"
    if last_seen_dt:
        age_seconds = max((now_dt - last_seen_dt).total_seconds(), 0.0)
        freshness_state = "live" if age_seconds <= 90 else "stale"

    profile = {
        "reg": reg_key,
        "registration": bus_row.get("registration"),
        "vehicleId": bus_row.get("vehicle_id"),
        "fleetNumber": bus_row.get("fleet_number"),
        "status": bus_row.get("status"),
        "vehicleType": bus_row.get("vehicle_type"),
        "wrap": bus_row.get("wrap"),
        "firstSeen": normalise_datetime(bus_row.get("first_seen")),
        "lastSeen": normalise_datetime(last_seen_dt),
        "currentRoute": bus_row.get("current_route"),
        "lastRouteUpdate": normalise_datetime(bus_row.get("last_route_update")),
        "operator": operator,
        "homeOperator": home_operator,
        "badges": badges,
        "badgeOverrides": bus_row.get("badge_overrides") or {},
        "usualRoutes": distribution_raw,
        "rareScore": rare_score,
        "newState": {
            **new_state,
            "isNew": is_new,
            "expiresAt": normalise_datetime(new_expiry),
        },
        "freshness": {
            "status": freshness_state,
            "ageSeconds": age_seconds,
        },
        "createdAt": normalise_datetime(bus_row.get("created_at")),
        "updatedAt": normalise_datetime(bus_row.get("updated_at")),
    }

    if include_sightings and reg_key:
        profile["sightings"] = [
            serialise_sighting(row)
            for row in fetch_recent_sightings(connection, reg_key)
        ]

    if include_history and reg_key:
        profile["history"] = [
            serialise_history_event(row)
            for row in fetch_bus_history(connection, reg_key)
        ]

    if include_speed and reg_key:
        profile["speedSparkline"] = compute_speed_sparkline(connection, reg_key, now=now_dt)

    profile["rareState"] = {
        "active": bool(rare_score.get("active")),
        "route": rare_score.get("route"),
        "count": rare_score.get("count"),
        "share": rare_score.get("share"),
        "zScore": rare_score.get("zScore"),
        "reason": rare_score.get("reason"),
        "operatorLoan": rare_score.get("operatorLoan"),
        "lastTrigger": rare_score.get("lastTrigger"),
    }

    return profile


def serialise_bus_summary(
    row: Dict[str, Any],
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    now_dt = now or datetime.now(timezone.utc)
    last_seen_dt = parse_iso_datetime(row.get("last_seen"))
    age_seconds = None
    if last_seen_dt:
        age_seconds = max((now_dt - last_seen_dt).total_seconds(), 0.0)
    badges = row.get("badges") or []
    if isinstance(badges, str):
        badges = [badges]
    return {
        "reg": row.get("reg"),
        "registration": row.get("registration"),
        "fleetNumber": row.get("fleet_number"),
        "status": row.get("status"),
        "lastSeen": normalise_datetime(last_seen_dt),
        "ageSeconds": age_seconds,
        "badges": badges,
        "currentRoute": row.get("current_route"),
        "operatorId": row.get("operator_id"),
    }


def search_buses(
    connection,
    query: Optional[str],
    *,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    pattern = f"%{query or ''}%"
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT *
            FROM buses
            WHERE (%s = '%%')
               OR reg ILIKE %s
               OR registration ILIKE %s
               OR fleet_number ILIKE %s
               OR current_route ILIKE %s
            ORDER BY last_seen DESC
            LIMIT %s
            """,
            (pattern, pattern, pattern, pattern, pattern, max(1, limit)),
        )
        return cursor.fetchall() or []


def list_rare_buses(
    connection,
    *,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT *
            FROM buses
            WHERE badges @> %s
               OR (rare_score->>'active')::BOOLEAN IS TRUE
            ORDER BY COALESCE(rare_badge_last_seen_at, last_seen) DESC
            LIMIT %s
            """,
            (Json([BADGE_RARE_WORKING]), max(1, limit)),
        )
        return cursor.fetchall() or []


def normalise_edit_action(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return ""
    lowered = text.replace("-", "_").replace(" ", "_").lower()
    if lowered in {"pin", "pin_badge", "badge_pin"}:
        return "pin_badge"
    if lowered in {"unpin", "unpin_badge", "remove_badge", "suppress_badge"}:
        return "unpin_badge"
    return lowered


def create_edit_request(
    connection,
    reg_key: str,
    action: str,
    badge: Optional[str],
    payload: Optional[Dict[str, Any]] = None,
    *,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    request_id = uuid.uuid4()
    badge_slug_value = badge_slug(badge)
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            INSERT INTO edit_requests (
                request_id,
                reg,
                action,
                badge,
                payload,
                status,
                created_by
            )
            VALUES (%s, %s, %s, %s, %s, 'pending', %s)
            RETURNING *
            """,
            (request_id, reg_key, action, badge_slug_value or None, Json(payload or {}), user_id),
        )
        return cursor.fetchone() or {}


def fetch_edit_requests(
    connection,
    *,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        if status:
            cursor.execute(
                """
                SELECT *
                FROM edit_requests
                WHERE status = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (status, max(1, limit)),
            )
        else:
            cursor.execute(
                """
                SELECT *
                FROM edit_requests
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (max(1, limit),),
            )
        return cursor.fetchall() or []


def get_edit_request(connection, request_id: str) -> Optional[Dict[str, Any]]:
    request_key = normalise_text(request_id)
    if not request_key:
        return None
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT *
            FROM edit_requests
            WHERE request_id::text = %s
            """,
            (request_key,),
        )
        return cursor.fetchone()


def update_edit_request_status(
    connection,
    request_id: str,
    *,
    status: str,
    reviewer: Optional[str] = None,
    notes: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            UPDATE edit_requests
            SET status = %s,
                reviewed_by = %s,
                reviewed_at = NOW(),
                reviewer_notes = %s
            WHERE request_id::text = %s
            RETURNING *
            """,
            (status, reviewer, notes, normalise_text(request_id)),
        )
        return cursor.fetchone()


def serialise_edit_request(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    return {
        "id": str(row.get("request_id")),
        "reg": row.get("reg"),
        "action": row.get("action"),
        "badge": row.get("badge"),
        "payload": payload,
        "status": row.get("status"),
        "createdBy": row.get("created_by"),
        "createdAt": normalise_datetime(row.get("created_at")),
        "reviewedBy": row.get("reviewed_by"),
        "reviewedAt": normalise_datetime(row.get("reviewed_at")),
        "notes": row.get("reviewer_notes"),
    }


def apply_badge_override_update(
    connection,
    bus_row: Dict[str, Any],
    badge: str,
    *,
    pinned: bool,
    reviewer: Optional[str] = None,
) -> Dict[str, Any]:
    reg_key = bus_row.get("reg")
    if not reg_key:
        raise ApiError("Bus registration missing for override.", status_code=400)

    overrides = bus_row.get("badge_overrides")
    if not isinstance(overrides, dict):
        overrides = {}

    badge_key = badge_slug(badge)
    if not badge_key:
        raise ApiError("A badge is required for override.", status_code=400)

    existing = overrides.get(badge_key)
    if isinstance(existing, dict):
        config = dict(existing)
    else:
        config = {}

    config["updatedAt"] = iso_now()
    if reviewer:
        config["updatedBy"] = reviewer
    config["pinned"] = bool(pinned)
    if not pinned:
        config["suppressed"] = True
    else:
        config.pop("suppressed", None)
    overrides[badge_key] = config

    final_badges = apply_badge_overrides(bus_row.get("badges") or [], overrides)

    updates = {
        "badge_overrides": Json(overrides),
        "badges": Json(final_badges),
    }
    updated = update_bus_record(connection, reg_key, updates) or fetch_bus_row(connection, reg_key)

    record_bus_history(
        connection,
        reg_key,
        "badge-override",
        {
            "badge": badge_key,
            "pinned": pinned,
            "reviewedBy": reviewer,
        },
    )

    return updated or bus_row


def apply_edit_request_effect(
    connection,
    request_row: Dict[str, Any],
    reviewer: Optional[str] = None,
) -> Dict[str, Any]:
    reg_key = request_row.get("reg")
    if not reg_key:
        raise ApiError("Edit request is missing a vehicle registration.", status_code=400)

    bus_row = fetch_bus_row(connection, reg_key)
    if not bus_row:
        raise ApiError("Bus not found for edit request.", status_code=404)

    action = normalise_edit_action(request_row.get("action"))
    badge_value = request_row.get("badge")

    if action == "pin_badge":
        return apply_badge_override_update(
            connection,
            bus_row,
            badge_value or BADGE_RARE_WORKING,
            pinned=True,
            reviewer=reviewer,
        )
    if action == "unpin_badge":
        return apply_badge_override_update(
            connection,
            bus_row,
            badge_value or BADGE_RARE_WORKING,
            pinned=False,
            reviewer=reviewer,
        )

    raise ApiError("Unsupported edit request action.", status_code=400)


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


_DATETIME_KEYWORDS: Tuple[str, ...] = (
    "timestamp",
    "last",
    "updated",
    "recorded",
    "reported",
    "observed",
    "captured",
    "logged",
    "date",
    "time",
    "seen",
)

_DATETIME_SKIP_KEYWORDS: Tuple[str, ...] = (
    "arrival",
    "expected",
    "countdown",
    "tostation",
    "tostop",
    "towards",
    "ttl",
    "interval",
    "deviation",
)


def _parse_any_datetime(value: Any) -> Optional[datetime]:
    parsed = parse_iso_datetime(value)
    if parsed is not None:
        return parsed

    if isinstance(value, (int, float)):
        try:
            timestamp = float(value)
        except (TypeError, ValueError):
            return None
        if timestamp > 10**12:
            timestamp /= 1000.0
        try:
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None

    text = normalise_text(value)
    if not text:
        return None

    if text.endswith("Z") and "+" not in text[text.rfind("Z") :]:
        parsed = parse_iso_datetime(text)
        if parsed is not None:
            return parsed

    match = re.search(r"/Date\((?P<stamp>-?\d+)(?:[+-]\d+)?\)/", text)
    if match:
        try:
            millis = int(match.group("stamp")) / 1000.0
            return datetime.fromtimestamp(millis, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None

    digits = re.sub(r"[^0-9]", "", text)
    if len(digits) >= 10:
        try:
            seconds = int(digits[:13]) / 1000.0 if len(digits) >= 13 else int(digits[:10])
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            pass

    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ):
        try:
            parsed = datetime.strptime(text, fmt)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    return None


def _should_consider_datetime_key(key: str) -> bool:
    lower_key = key.lower()
    if any(skip in lower_key for skip in _DATETIME_SKIP_KEYWORDS):
        return False
    return any(token in lower_key for token in _DATETIME_KEYWORDS)


def _collect_datetime_candidates(payload: Any, results: List[datetime]) -> None:
    if isinstance(payload, dict):
        for raw_key, value in payload.items():
            if isinstance(value, (dict, list)):
                _collect_datetime_candidates(value, results)
            if value in (None, ""):
                continue
            if isinstance(value, (int, float)):
                parsed = _parse_any_datetime(value)
                if parsed is not None:
                    results.append(parsed)
                    continue
            if not isinstance(value, str):
                continue
            key = normalise_text(raw_key)
            if not key:
                continue
            if not _should_consider_datetime_key(key) and "T" not in value:
                continue
            parsed = _parse_any_datetime(value)
            if parsed is not None:
                results.append(parsed)
    elif isinstance(payload, list):
        for item in payload:
            _collect_datetime_candidates(item, results)


def extract_latest_vehicle_timestamp(entry: Any) -> Optional[datetime]:
    candidates: List[datetime] = []
    _collect_datetime_candidates(entry, candidates)
    valid = [dt for dt in candidates if dt.year >= 2000]
    if not valid:
        return None
    return max(valid)


def _extract_field_value(entry: Any, candidate_keys: Tuple[str, ...]) -> str:
    if not candidate_keys:
        return ""
    lowered = [key.lower() for key in candidate_keys]
    queue: List[Any] = [entry]

    while queue:
        current = queue.pop(0)
        if isinstance(current, dict):
            for raw_key, value in current.items():
                if isinstance(value, (dict, list)):
                    queue.append(value)
                key = normalise_text(raw_key).lower()
                if not key:
                    continue
                if any(candidate == key or candidate in key for candidate in lowered):
                    text = normalise_text(value)
                    if text:
                        return text
        elif isinstance(current, list):
            queue.extend(current)

    return ""


def fetch_recent_vehicle_snapshots(days: int) -> Tuple[List[Dict[str, Any]], bool]:
    if not TFL_VEHICLE_API_URL:
        return [], False

    kwargs = build_tfl_request_kwargs()
    base_params = dict(kwargs.get("params") or {})
    headers = dict(kwargs.get("headers") or {})

    manual_page = 1
    manual_params: Dict[str, Any] = {"page": manual_page}
    if TFL_VEHICLE_PAGE_SIZE:
        manual_params["pageSize"] = TFL_VEHICLE_PAGE_SIZE

    next_request: Optional[Tuple[str, Dict[str, Any]]] = (
        TFL_VEHICLE_API_URL,
        manual_params,
    )

    requests_made = 0
    success = False
    snapshots: Dict[str, Dict[str, Any]] = {}
    now_utc = datetime.now(timezone.utc)
    threshold = now_utc - timedelta(days=days)

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
            print(f"[fleet-sync] Failed to fetch vehicle history: {exc}", flush=True)
            break

        try:
            payload = response.json()
        except ValueError as exc:
            print(f"[fleet-sync] Invalid JSON payload from vehicle history: {exc}", flush=True)
            break

        success = True

        for entry in _iter_vehicle_entries(payload):
            reg_key, registration = extract_vehicle_registration(entry)
            if not reg_key:
                continue

            seen_at = extract_latest_vehicle_timestamp(entry) or now_utc
            if seen_at > now_utc:
                seen_at = now_utc
            if seen_at < threshold:
                continue

            vehicle_id = _extract_field_value(
                entry,
                ("vehicleId", "vehicleRef", "vehicleNumber", "vehicleCode"),
            )
            line_label = _extract_field_value(
                entry,
                ("lineName", "lineId", "routeId", "serviceId"),
            )

            extras: List[str] = []
            if line_label:
                extras.append(f"Line {line_label}")
            if vehicle_id and vehicle_id.upper() != registration.upper():
                extras.append(f"Vehicle ID {vehicle_id}")
            extras.append(f"Seen {seen_at.date().isoformat()}")

            existing = snapshots.get(reg_key)
            if existing and existing.get("seenAt") >= seen_at:
                continue

            snapshots[reg_key] = {
                "regKey": reg_key,
                "registration": registration,
                "seenAt": seen_at,
                "vehicleId": vehicle_id,
                "line": line_label,
                "extras": extras,
            }

        link = _extract_next_link(payload)
        if link:
            next_request = _prepare_next_request(link, base_url=url)
            continue

        if manual_params.get("page") == manual_page and len(snapshots) == 0:
            next_request = None
            break

        manual_page += 1
        manual_params = {"page": manual_page}
        if TFL_VEHICLE_PAGE_SIZE:
            manual_params["pageSize"] = TFL_VEHICLE_PAGE_SIZE
        next_request = (TFL_VEHICLE_API_URL, manual_params)

    ordered = sorted(
        snapshots.values(),
        key=lambda item: item.get("seenAt") or threshold,
        reverse=True,
    )

    if ordered:
        print(
            f"[fleet-sync] Collated {len(ordered)} vehicle snapshots from TfL history feed",
            flush=True,
        )

    return ordered, success


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


def _prepare_next_request(link: str, *, base_url: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    reference_base = base_url or TFL_VEHICLE_API_URL
    absolute = urljoin(reference_base, str(link))
    parsed = urlparse(absolute)
    params = dict(parse_qsl(parsed.query or "", keep_blank_values=False))

    if parsed.scheme and parsed.netloc:
        next_base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    else:
        next_base = urljoin(reference_base, parsed.path or "")

    next_base = next_base or reference_base
    return next_base, params


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
            next_request = _prepare_next_request(link, base_url=url)
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
            next_request = _prepare_next_request(link, base_url=request_url)
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


_RETRYABLE_STATUS_CODES: Set[int] = {429, 500, 502, 503, 504}


def fetch_active_bus_lines() -> List[str]:
    url = _build_tfl_api_url("Line/Mode/bus")
    kwargs = build_tfl_request_kwargs()
    params = dict(kwargs.get("params") or {})
    params.setdefault("serviceTypes", "Regular,School")
    headers = dict(kwargs.get("headers") or {})

    try:
        response = requests.get(
            url,
            params=params or None,
            headers=headers or None,
            timeout=TFL_API_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"[live-tracker] Failed to fetch active bus lines: {exc}", flush=True)
        return []

    try:
        payload = response.json()
    except ValueError as exc:
        print(f"[live-tracker] Invalid JSON payload from line list: {exc}", flush=True)
        return []

    entries: Iterable[Any]
    if isinstance(payload, list):
        entries = payload
    elif isinstance(payload, dict):
        extracted: Iterable[Any] = []
        for key in ("lines", "value", "results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                extracted = value
                break
        else:
            extracted = [payload]
        entries = extracted
    else:
        return []

    lines: List[str] = []
    seen: Set[str] = set()
    for entry in entries:
        if isinstance(entry, str):
            candidate = normalise_text(entry)
        elif isinstance(entry, dict):
            candidate = normalise_text(entry.get("id") or entry.get("lineId") or entry.get("name"))
        else:
            candidate = normalise_text(entry)
        if not candidate:
            continue
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        lines.append(candidate)

    lines.sort()
    return lines


def _fetch_arrivals_for_line(
    line_id: str,
    base_params: Dict[str, Any],
    headers: Dict[str, str],
    stop_event: Optional[threading.Event] = None,
) -> Tuple[List[Dict[str, Any]], int, Optional[str]]:
    attempts = 0
    last_error: Optional[str] = None
    url = _build_tfl_api_url(f"Line/{quote(str(line_id) or '')}/Arrivals")
    backoff_seconds = LIVE_TRACKING_BACKOFF_MS / 1000.0

    while attempts < LIVE_TRACKING_MAX_RETRIES:
        attempts += 1
        params = dict(base_params)

        try:
            response = requests.get(
                url,
                params=params or None,
                headers=headers or None,
                timeout=TFL_API_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            last_error = str(exc)
            if attempts >= LIVE_TRACKING_MAX_RETRIES:
                return [], attempts, last_error
            delay = backoff_seconds * max(1, 2 ** (attempts - 1))
            jitter = random.uniform(0.0, backoff_seconds) if backoff_seconds else 0.0
            sleep_interval = delay + jitter
            if stop_event:
                if stop_event.wait(sleep_interval):
                    return [], attempts, "cancelled"
            else:
                time.sleep(sleep_interval)
            continue

        status = response.status_code
        if status in _RETRYABLE_STATUS_CODES and attempts < LIVE_TRACKING_MAX_RETRIES:
            last_error = f"HTTP {status}"
            delay = backoff_seconds * max(1, 2 ** (attempts - 1))
            jitter = random.uniform(0.0, backoff_seconds) if backoff_seconds else 0.0
            sleep_interval = delay + jitter
            if stop_event:
                if stop_event.wait(sleep_interval):
                    return [], attempts, "cancelled"
            else:
                time.sleep(sleep_interval)
            continue

        try:
            response.raise_for_status()
        except requests.RequestException as exc:
            last_error = str(exc)
            return [], attempts, last_error

        try:
            payload = response.json()
        except ValueError as exc:
            return [], attempts, f"invalid JSON: {exc}"

        if isinstance(payload, list):
            return payload, attempts, None
        if isinstance(payload, dict):
            for key in ("arrivals", "value", "results", "data"):
                value = payload.get(key)
                if isinstance(value, list):
                    return value, attempts, None
            return [payload], attempts, None
        return [], attempts, None

    return [], attempts, last_error


def normalise_live_arrival(
    line_id: str,
    entry: Any,
    *,
    now: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None

    vehicle_candidate = (
        entry.get("vehicleRegistrationNumber")
        or entry.get("registrationNumber")
        or entry.get("vehicleId")
        or entry.get("vehicleRef")
        or entry.get("vehicle")
    )
    vehicle_text = normalise_text(vehicle_candidate)
    vehicle_key = normalise_reg_key(vehicle_text)
    if not vehicle_key:
        return None

    reference_now = now or datetime.now(timezone.utc)

    seen_at = (
        parse_iso_datetime(entry.get("timestamp"))
        or parse_iso_datetime(entry.get("recordedAt"))
        or parse_iso_datetime(entry.get("timeToLive"))
        or parse_iso_datetime(entry.get("expectedArrival"))
        or reference_now
    )
    if seen_at > reference_now + timedelta(minutes=5):
        seen_at = reference_now

    expected_at = parse_iso_datetime(entry.get("expectedArrival"))

    def _int_or_none(value: Any) -> Optional[int]:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    record: Dict[str, Any] = {
        "vehicleKey": vehicle_key,
        "vehicleId": vehicle_text or vehicle_key,
        "registration": normalise_text(entry.get("vehicleRegistrationNumber") or entry.get("registrationNumber"))
        or vehicle_text
        or vehicle_key,
        "lineId": normalise_text(entry.get("lineId")) or normalise_text(line_id),
        "lineName": normalise_text(entry.get("lineName")) or normalise_text(line_id),
        "route": normalise_text(entry.get("lineName") or entry.get("routeId") or entry.get("lineId") or line_id),
        "destination": normalise_text(entry.get("destinationName") or entry.get("towards")),
        "naptanId": normalise_text(entry.get("naptanId") or entry.get("stopPointId") or entry.get("id")),
        "expectedArrival": expected_at.isoformat() if expected_at else "",
        "timeToStation": _int_or_none(entry.get("timeToStation")),
        "timestamp": seen_at.isoformat(),
        "stationName": normalise_text(entry.get("stationName") or entry.get("stopPointName") or entry.get("stopName")),
        "direction": normalise_text(entry.get("direction")),
        "bearing": normalise_text(entry.get("bearing")),
        "platformName": normalise_text(entry.get("platformName")),
        "towards": normalise_text(entry.get("towards")),
        "currentLocation": normalise_text(entry.get("currentLocation")),
        "modeName": normalise_text(entry.get("modeName")) or "bus",
        "serviceType": normalise_text(entry.get("serviceType")),
        "vehicleType": normalise_text(entry.get("vehicleType")),
        "operator": normalise_text(entry.get("operatorName") or entry.get("operator")),
    }

    lat = coerce_float(entry.get("latitude") or entry.get("lat"))
    lon = coerce_float(entry.get("longitude") or entry.get("lon"))
    if lat is not None:
        record["latitude"] = lat
    if lon is not None:
        record["longitude"] = lon

    arrival_id = normalise_text(entry.get("id"))
    if arrival_id:
        record["arrivalId"] = arrival_id

    record["_seen_at"] = seen_at
    return record


def collect_live_bus_snapshot(
    *,
    stop_event: Optional[threading.Event] = None,
) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    started_at = datetime.now(timezone.utc)
    meta: Dict[str, Any] = {
        "batchId": uuid.uuid4().hex,
        "startedAt": started_at.isoformat(),
        "finishedAt": None,
        "linesRequested": 0,
        "linesSucceeded": 0,
        "requestsMade": 0,
        "errors": [],
    }

    fleet: Dict[str, Dict[str, Any]] = {}
    log_entries: List[Dict[str, Any]] = []

    lines = fetch_active_bus_lines()
    if not lines:
        meta["finishedAt"] = datetime.now(timezone.utc).isoformat()
        meta["fleetSize"] = 0
        return fleet, log_entries, meta

    meta["linesRequested"] = len(lines)

    request_kwargs = build_tfl_request_kwargs()
    base_params = dict(request_kwargs.get("params") or {})
    headers = dict(request_kwargs.get("headers") or {})

    launch_delay = LIVE_TRACKING_LAUNCH_DELAY_MS / 1000.0

    with ThreadPoolExecutor(max_workers=LIVE_TRACKING_CONCURRENCY) as executor:
        futures: Dict[Any, str] = {}
        for index, line_id in enumerate(lines):
            if stop_event and stop_event.is_set():
                break
            future = executor.submit(
                _fetch_arrivals_for_line,
                line_id,
                base_params,
                headers,
                stop_event,
            )
            futures[future] = line_id
            if launch_delay > 0 and index < len(lines) - 1:
                if stop_event and stop_event.wait(launch_delay):
                    break
                if not stop_event:
                    time.sleep(launch_delay)

        for future in as_completed(futures):
            line_id = futures[future]
            if stop_event and stop_event.is_set():
                break
            try:
                arrivals, attempts, error_message = future.result()
            except Exception as exc:
                attempts = getattr(exc, "attempts", 1)
                meta["requestsMade"] += attempts
                meta["errors"].append({"lineId": line_id, "error": str(exc)})
                continue

            meta["requestsMade"] += attempts

            if error_message:
                meta["errors"].append({"lineId": line_id, "error": error_message})
                continue

            meta["linesSucceeded"] += 1

            for raw in arrivals or []:
                record = normalise_live_arrival(line_id, raw, now=started_at)
                if not record:
                    continue
                log_entries.append(dict(record))
                vehicle_key = record.get("vehicleKey")
                if not vehicle_key:
                    continue
                existing = fleet.get(vehicle_key)
                seen_at = record.get("_seen_at")
                if existing and existing.get("_seen_at") and seen_at:
                    if existing["_seen_at"] >= seen_at:
                        continue
                fleet[vehicle_key] = dict(record)

    log_sorted: List[Dict[str, Any]] = []
    for entry in sorted(log_entries, key=lambda item: item.get("_seen_at") or started_at):
        prepared = dict(entry)
        seen_at = prepared.get("_seen_at")
        if isinstance(seen_at, datetime):
            prepared["seenAt"] = prepared.get("timestamp") or seen_at.isoformat()
        else:
            prepared["seenAt"] = prepared.get("timestamp") or started_at.isoformat()
        log_sorted.append(prepared)

    meta["fleetSize"] = len(fleet)
    meta["finishedAt"] = datetime.now(timezone.utc).isoformat()

    return fleet, log_sorted, meta


class LiveArrivalsPoller:
    def __init__(self, enabled: bool, *, interval: int = LIVE_TRACKING_INTERVAL_SECONDS) -> None:
        self._enabled = bool(enabled)
        self._interval = max(int(interval), 5)
        self._stale_after = timedelta(seconds=LIVE_TRACKING_STALE_SECONDS)
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._fleet: Dict[str, Dict[str, Any]] = {}
        self._sightings: deque = deque(maxlen=LIVE_TRACKING_LOG_LIMIT)
        self._last_meta: Dict[str, Any] = {}
        self._last_cycle_started_at: Optional[str] = None
        self._last_cycle_finished_at: Optional[str] = None
        self._last_error: Optional[str] = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def is_running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self) -> bool:
        if not self._enabled:
            return False
        if self.is_running:
            return True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="live-arrivals", daemon=True)
        self._thread.start()
        return True

    def stop(self, timeout: float = 5.0) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=timeout)

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            fleet = [dict(entry) for entry in self._fleet.values()]
            sightings = [dict(entry) for entry in self._sightings]
            meta = dict(self._last_meta or {})
        meta.update(
            {
                "enabled": self._enabled,
                "running": self.is_running,
                "intervalSeconds": self._interval,
                "staleAfterSeconds": int(self._stale_after.total_seconds()),
                "lastCycleStartedAt": self._last_cycle_started_at,
                "lastCycleFinishedAt": self._last_cycle_finished_at,
                "lastError": self._last_error,
            }
        )
        return {"fleet": fleet, "sightings": sightings, "meta": meta}

    def _run(self) -> None:
        while not self._stop_event.is_set():
            cycle_start = datetime.now(timezone.utc)
            self._last_cycle_started_at = cycle_start.isoformat()
            snapshot: Dict[str, Dict[str, Any]] = {}
            log_entries: List[Dict[str, Any]] = []
            meta: Dict[str, Any] = {}

            try:
                snapshot, log_entries, meta = collect_live_bus_snapshot(stop_event=self._stop_event)
            except Exception as exc:
                meta = {
                    "batchId": uuid.uuid4().hex,
                    "startedAt": cycle_start.isoformat(),
                    "finishedAt": datetime.now(timezone.utc).isoformat(),
                    "linesRequested": 0,
                    "linesSucceeded": 0,
                    "requestsMade": 0,
                    "errors": [{"error": str(exc)}],
                }
                snapshot = {}
                log_entries = []
                self._last_error = str(exc)
                print(f"[live-tracker] Unexpected error collecting arrivals: {exc}", flush=True)
            else:
                errors = meta.get("errors") or []
                if errors:
                    self._last_error = errors[-1].get("error")
                    for error in errors:
                        line_id = error.get("lineId")
                        message = error.get("error") or "unknown error"
                        if line_id:
                            print(
                                f"[live-tracker] Line {line_id}: {message}",
                                flush=True,
                            )
                        else:
                            print(f"[live-tracker] {message}", flush=True)
                else:
                    self._last_error = None

            try:
                if snapshot:
                    self._persist_snapshot(snapshot)
            except Exception as exc:
                self._last_error = str(exc)
                print(f"[live-tracker] Failed to persist live snapshot: {exc}", flush=True)
            finally:
                self._update_state(snapshot, log_entries, meta)
                cycle_end = datetime.now(timezone.utc)
                self._last_cycle_finished_at = cycle_end.isoformat()
                sleep_for = max(self._interval - (cycle_end - cycle_start).total_seconds(), 1.0)
                self._stop_event.wait(sleep_for)

    def _persist_snapshot(self, snapshot: Dict[str, Dict[str, Any]]) -> None:
        now = datetime.now(timezone.utc)
        with get_connection() as connection:
            for vehicle_key, record in snapshot.items():
                seen_at_value = record.get("_seen_at")
                if isinstance(seen_at_value, datetime):
                    seen_at = seen_at_value
                else:
                    seen_at = parse_iso_datetime(seen_at_value) or now
                payload = self._build_payload(vehicle_key, record, seen_at)
                try:
                    record_bus_sighting(connection, payload, now=now)
                    connection.commit()
                except ApiError as exc:
                    connection.rollback()
                    print(f"[live-tracker] Skipped sighting for {vehicle_key}: {exc}", flush=True)
                except Exception as exc:
                    connection.rollback()
                    print(f"[live-tracker] Error recording sighting for {vehicle_key}: {exc}", flush=True)

    def _build_payload(
        self,
        vehicle_key: str,
        record: Dict[str, Any],
        seen_at: datetime,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "vehicleId": record.get("vehicleId") or vehicle_key,
            "vehicleRegistrationNumber": record.get("registration")
            or record.get("vehicleId")
            or vehicle_key,
            "registration": record.get("registration")
            or record.get("vehicleId")
            or vehicle_key,
            "lineId": record.get("lineId"),
            "lineName": record.get("lineName") or record.get("route"),
            "route": record.get("route"),
            "destination": record.get("destination"),
            "destinationName": record.get("destination"),
            "towards": record.get("towards") or record.get("destination"),
            "naptanId": record.get("naptanId"),
            "stopCode": record.get("naptanId"),
            "stationName": record.get("stationName"),
            "platformName": record.get("platformName"),
            "timestamp": record.get("timestamp") or seen_at.isoformat(),
            "expectedArrival": record.get("expectedArrival")
            or record.get("timestamp")
            or seen_at.isoformat(),
            "timeToStation": record.get("timeToStation"),
            "modeName": record.get("modeName") or "bus",
            "direction": record.get("direction"),
            "bearing": record.get("bearing"),
            "currentLocation": record.get("currentLocation"),
            "serviceType": record.get("serviceType"),
            "vehicleType": record.get("vehicleType"),
            "operator": record.get("operator"),
        }
        if record.get("latitude") is not None:
            payload["latitude"] = record["latitude"]
            payload["lat"] = record["latitude"]
        if record.get("longitude") is not None:
            payload["longitude"] = record["longitude"]
            payload["lon"] = record["longitude"]
        arrival_id = record.get("arrivalId")
        if arrival_id:
            payload["id"] = arrival_id
        return payload

    def _update_state(
        self,
        snapshot: Dict[str, Dict[str, Any]],
        log_entries: List[Dict[str, Any]],
        meta: Dict[str, Any],
    ) -> None:
        now = datetime.now(timezone.utc)
        cutoff = now - self._stale_after

        with self._lock:
            if snapshot:
                for vehicle_key, record in snapshot.items():
                    entry = dict(record)
                    seen_dt = entry.pop("_seen_at", None)
                    if not isinstance(seen_dt, datetime):
                        seen_dt = parse_iso_datetime(seen_dt)
                    seen_iso = entry.get("timestamp") or (seen_dt.isoformat() if seen_dt else now.isoformat())
                    entry["vehicleKey"] = vehicle_key
                    entry.setdefault("vehicleId", entry.get("vehicleKey"))
                    entry.setdefault("registration", entry.get("registration") or entry.get("vehicleId"))
                    entry.setdefault("seenAt", seen_iso)
                    if entry.get("latitude") is None:
                        entry.pop("latitude", None)
                    if entry.get("longitude") is None:
                        entry.pop("longitude", None)
                    self._fleet[vehicle_key] = entry

            for vehicle_key, entry in list(self._fleet.items()):
                seen_text = entry.get("seenAt") or entry.get("timestamp")
                seen_dt = parse_iso_datetime(seen_text)
                if seen_dt and seen_dt < cutoff:
                    del self._fleet[vehicle_key]

            if log_entries:
                for raw_entry in log_entries:
                    vehicle_key = raw_entry.get("vehicleKey") or raw_entry.get("vehicleId")
                    if not vehicle_key:
                        continue
                    entry = dict(raw_entry)
                    seen_dt = entry.pop("_seen_at", None)
                    if isinstance(seen_dt, datetime):
                        seen_iso = entry.get("seenAt") or entry.get("timestamp") or seen_dt.isoformat()
                    else:
                        seen_iso = entry.get("seenAt") or entry.get("timestamp") or now.isoformat()
                    entry["vehicleKey"] = vehicle_key
                    entry.setdefault("vehicleId", entry.get("vehicleKey"))
                    entry.setdefault("registration", entry.get("registration") or entry.get("vehicleId"))
                    entry["seenAt"] = seen_iso
                    if entry.get("latitude") is None:
                        entry.pop("latitude", None)
                    if entry.get("longitude") is None:
                        entry.pop("longitude", None)
                    self._sightings.append(entry)

            self._last_meta = {
                "lastUpdated": now.isoformat(),
                "fleetSize": len(self._fleet),
                "linesRequested": meta.get("linesRequested"),
                "linesSucceeded": meta.get("linesSucceeded"),
                "requestsMade": meta.get("requestsMade"),
                "batchId": meta.get("batchId"),
                "errors": meta.get("errors"),
                "startedAt": meta.get("startedAt"),
                "finishedAt": meta.get("finishedAt"),
            }


live_tracker = LiveArrivalsPoller(enabled=LIVE_TRACKING_ENABLED)
if LIVE_TRACKING_ENABLED:
    try:
        live_tracker.start()
    except Exception as exc:
        print(f"[live-tracker] Failed to start tracker thread: {exc}", flush=True)


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


def normalise_url(value: Any) -> str:
    text = normalise_text(value)
    if not text:
        return ""
    try:
        parsed = urlparse(text)
    except ValueError:
        return text
    if parsed.scheme:
        return text
    if text.startswith("//"):
        return f"https:{text}"
    return text


def estimate_read_minutes(*parts: Any) -> int:
    words = 0
    for part in parts:
        if not part:
            continue
        if not isinstance(part, str):
            part = str(part)
        words += len([token for token in part.split() if token])
    if words <= 0:
        return 3
    return max(1, round(words / 180))


def sanitise_tag_list(value: Any) -> List[str]:
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


def sanitise_blog_post_entry(entry: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None
    title = normalise_text(entry.get("title"))
    if not title:
        return None
    identifier = normalise_text(entry.get("id")) or uuid.uuid4().hex
    summary = normalise_text(entry.get("summary"))
    content = normalise_text(entry.get("content"))
    author = normalise_text(entry.get("author")) or "RouteFlow London team"
    hero_image = normalise_url(entry.get("heroImage") or entry.get("hero_image"))
    published_at = normalise_datetime(entry.get("publishedAt") or entry.get("date"))
    tags = sanitise_tag_list(entry.get("tags"))
    featured = bool(entry.get("featured"))
    read_time_value = entry.get("readTime")
    if isinstance(read_time_value, (int, float)) and read_time_value > 0:
        read_time = int(round(read_time_value))
    else:
        read_time = estimate_read_minutes(summary, content)

    return {
        "id": identifier,
        "title": title,
        "summary": summary,
        "content": content,
        "author": author,
        "heroImage": hero_image,
        "publishedAt": published_at or iso_now(),
        "tags": tags,
        "featured": featured,
        "readTime": read_time,
    }


def sanitise_blog_collection(entries: Any) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    if not isinstance(entries, list):
        return cleaned
    for entry in entries:
        sanitized = sanitise_blog_post_entry(entry)
        if not sanitized:
            continue
        identifier = sanitized.get("id")
        if not identifier or identifier in seen:
            continue
        cleaned.append(sanitized)
        seen.add(identifier)
    cleaned.sort(key=lambda item: item.get("publishedAt") or "", reverse=True)
    return cleaned


def sanitise_withdrawn_entry(entry: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None
    route = normalise_text(entry.get("route"))
    if not route:
        return None
    identifier = normalise_text(entry.get("id")) or uuid.uuid4().hex
    return {
        "id": identifier,
        "route": route,
        "start": normalise_text(entry.get("start")),
        "end": normalise_text(entry.get("end")),
        "launched": normalise_text(entry.get("launched")),
        "withdrawn": normalise_text(entry.get("withdrawn")),
        "operator": normalise_text(entry.get("operator")),
        "replacedBy": normalise_text(entry.get("replacedBy")),
    }


def sanitise_withdrawn_collection(entries: Any) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    if not isinstance(entries, list):
        return cleaned
    for entry in entries:
        sanitized = sanitise_withdrawn_entry(entry)
        if not sanitized:
            continue
        identifier = sanitized.get("id")
        if not identifier or identifier in seen:
            continue
        cleaned.append(sanitized)
        seen.add(identifier)
    cleaned.sort(key=lambda item: item.get("route") or "")
    return cleaned


def sanitise_route_tag_override_entry(entry: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None
    route = normalise_text(entry.get("route"))
    if not route:
        return None
    tags = sanitise_tag_list(entry.get("tags"))
    if not tags:
        return None
    identifier = normalise_text(entry.get("id")) or uuid.uuid4().hex
    return {"id": identifier, "route": route, "tags": tags}


def sanitise_route_tag_collection(entries: Any) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    if not isinstance(entries, list):
        return cleaned
    for entry in entries:
        sanitized = sanitise_route_tag_override_entry(entry)
        if not sanitized:
            continue
        identifier = sanitized.get("id")
        if not identifier or identifier in seen:
            continue
        cleaned.append(sanitized)
        seen.add(identifier)
    cleaned.sort(key=lambda item: item.get("route") or "")
    return cleaned


def _blog_sort_key(item: Dict[str, Any]) -> str:
    return item.get("publishedAt") or ""


def _route_sort_key(item: Dict[str, Any]) -> str:
    return item.get("route") or ""


DEFAULT_BLOG_POSTS_RAW: List[Dict[str, Any]] = [
    {
        "id": "blog-weekly-roundup-2025-05-23",
        "title": "Weekly London Transport News – 23 May 2025",
        "summary": "Northern line closures, express bus extras and Docklands works to note before the bank holiday.",
        "content": (
            "Track closures impact the Northern line between Golders Green and Edgware across the long weekend, "
            "with a rail replacement loop published inside RouteFlow so you can quickly check frequencies. "
            "Additional express journeys run on the X26 and X140 to support airport travel, while a slimmed timetable "
            "affects Woolwich Ferry crossings late Sunday."
        ),
        "author": "Network desk",
        "publishedAt": "2025-05-23T16:30:00.000Z",
        "tags": ["Live News"],
    },
    {
        "id": "blog-consultation-summer-2025",
        "title": "Have your say on summer bus consultations",
        "summary": "Transport for London is consulting on Central London night routes, Croydon tram resilience and a new Sutton Superloop link.",
        "content": (
            "Three consultations launched this week. Night buses N11 and N29 are proposed to swap termini to balance demand in "
            "the West End, Croydon trams gain additional turnback capability at Sandilands to improve recovery, and a Sutton "
            "to Kingston Superloop branch would join the orbital express family. We have highlighted the closing dates and "
            "supporting documents for each."
        ),
        "author": "Policy and planning",
        "publishedAt": "2025-05-21T09:00:00.000Z",
        "tags": ["Guides"],
    },
    {
        "id": "blog-bus-models-electric-era",
        "title": "Meet London’s newest electric double-deckers",
        "summary": "A closer look at the Wright StreetDeck Electroliner and BYD-Alexander Dennis B12 that are joining busy trunk corridors.",
        "content": (
            "Routes 43 and 133 headline the rollout of the StreetDeck Electroliner this quarter, bringing faster charging, "
            "lighter shells and upgraded driver assistance. The BYD-Alexander Dennis B12 batches destined for Putney convert "
            "long-standing diesel duties while keeping capacity identical for school peaks."
        ),
        "author": "Fleet editor",
        "publishedAt": "2025-05-18T13:15:00.000Z",
        "tags": ["Models"],
    },
    {
        "id": "blog-weekly-roundup-2025-05-16",
        "title": "Weekly London Transport News – 16 May 2025",
        "summary": "Elizabeth line diversions, Jubilee line testing nights and South London roadworks to plan around.",
        "content": (
            "Sunday morning diversions on the Elizabeth line divert trains into Platform 5 at Paddington, while Jubilee line "
            "extensions run late-night test services to trial the new timetable. Expect staged closures along Brixton Road "
            "through May as gas main works restrict traffic to single lanes in each direction."
        ),
        "author": "Network desk",
        "publishedAt": "2025-05-16T16:45:00.000Z",
        "tags": ["Live News"],
    },
    {
        "id": "blog-consultation-night-bus-refresh",
        "title": "Night bus refresh for the West End",
        "summary": "TfL proposes tweaks to the night grid between Tottenham Court Road, Victoria and Chelsea Embankment to better reflect late traffic.",
        "content": (
            "A proposed reroute of the N26 introduces a direct Marble Arch to Victoria link overnight, while the N5 would "
            "short-turn at Chelsea to release resource for an every-12-minute N137. We break down the reasoning, affected "
            "stops and how to respond to the consultation before it closes on 14 June."
        ),
        "author": "Policy and planning",
        "publishedAt": "2025-05-14T08:20:00.000Z",
        "tags": ["Guides"],
    },
    {
        "id": "blog-bus-models-refurb",
        "title": "Inside the mid-life refits keeping hybrids fresh",
        "summary": "Stagecoach and Arriva are refreshing their hybrid fleets with brighter interiors, USB-C charging and accessibility upgrades.",
        "content": (
            "Take a tour through the revamped Volvo B5LH and Enviro400H batches that return from refurbishment. We highlight the "
            "updated saloon lighting, seat trims and revised wheelchair bays, plus the garages scheduling early conversions so "
            "you know where to spot them first."
        ),
        "author": "Fleet editor",
        "publishedAt": "2025-05-10T11:00:00.000Z",
        "tags": ["Models"],
    },
    {
        "id": "blog-city-pulse",
        "title": "Keeping pace with London’s network",
        "summary": "See how RouteFlow London brings live arrivals, rare workings and smart planning into a single dashboard.",
        "content": (
            "London never stands still—and neither should your travel tools. RouteFlow London now stitches together live "
            "arrivals, service alerts and enthusiast insights so you can pivot quickly when the network changes. From "
            "highlighting rare allocations to surfacing accessibility information, the platform is designed to feel personal "
            "from the moment you sign in."
        ),
        "author": "RouteFlow London team",
        "publishedAt": "2025-04-18T09:30:00.000Z",
        "tags": ["Operators"],
    },
    {
        "id": "blog-arrivals-refresh",
        "title": "Live tracking gets a smarter arrivals board",
        "summary": "The tracking console now groups departures by mode, shows richer stop context and remembers your favourites.",
        "content": (
            "We have rebuilt the arrivals board with clarity in mind. Search suggestions surface faster, while new layout cues "
            "make it easy to separate buses, trams, river services and more. Pin your go-to stops, add quick notes for special "
            "workings and watch everything refresh automatically without losing your place."
        ),
        "author": "Product design",
        "publishedAt": "2025-05-06T07:45:00.000Z",
        "tags": ["Guides"],
    },
    {
        "id": "blog-journey-studio",
        "title": "Planning journeys with confidence",
        "summary": "Multi-mode filters, accessibility options and clearer itineraries make the planner ready for every kind of trip.",
        "content": (
            "Tell RouteFlow where you are heading and we’ll present options that respect the way you travel. Choose the modes "
            "you prefer, filter out stairs or escalators and compare legs at a glance. Each journey shows interchanges, line "
            "colours and essential timings so you know exactly what to expect."
        ),
        "author": "Journey planning",
        "publishedAt": "2025-05-12T11:15:00.000Z",
        "tags": ["Guides"],
    },
]


DEFAULT_BLOG_POSTS = sanitise_blog_collection(DEFAULT_BLOG_POSTS_RAW)


ADMIN_COLLECTION_CONFIGS: Dict[str, Dict[str, Any]] = {
    "blog-posts": {
        "collection": "admin_blog_posts",
        "sanitise": sanitise_blog_post_entry,
        "sanitise_collection": sanitise_blog_collection,
        "sort_key": _blog_sort_key,
        "sort_reverse": True,
        "default": DEFAULT_BLOG_POSTS,
    },
    "withdrawn-routes": {
        "collection": "admin_withdrawn_routes",
        "sanitise": sanitise_withdrawn_entry,
        "sanitise_collection": sanitise_withdrawn_collection,
        "sort_key": _route_sort_key,
        "sort_reverse": False,
        "default": [],
    },
    "route-tags": {
        "collection": "admin_route_tags",
        "sanitise": sanitise_route_tag_override_entry,
        "sanitise_collection": sanitise_route_tag_collection,
        "sort_key": _route_sort_key,
        "sort_reverse": False,
        "default": [],
    },
}


def resolve_admin_collection(name: str) -> Dict[str, Any]:
    key = normalise_text(name).lower().replace(" ", "-")
    config = ADMIN_COLLECTION_CONFIGS.get(key)
    if not config:
        raise ApiError("Collection not found.", status_code=404)
    return config


def load_admin_collection(connection, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = fetch_collection_items(connection, config["collection"])
    items: List[Dict[str, Any]] = []
    stale_ids: List[str] = []
    seen: Set[str] = set()

    for row in rows:
        raw = dict(row.get("data") or {})
        if "id" not in raw and row.get("item_id"):
            raw["id"] = row.get("item_id")
        sanitized = config["sanitise"](raw)
        if not sanitized:
            item_id = normalise_text(row.get("item_id"))
            if item_id:
                stale_ids.append(item_id)
            continue
        identifier = sanitized.get("id")
        if not identifier or identifier in seen:
            continue
        items.append(sanitized)
        seen.add(identifier)

    if stale_ids:
        for item_id in stale_ids:
            delete_collection_item(connection, config["collection"], item_id)
        connection.commit()

    if not items:
        default_items = config.get("default") or []
        return list(default_items)

    reverse = bool(config.get("sort_reverse"))
    sort_key: Callable[[Dict[str, Any]], Any] = config.get("sort_key") or (lambda item: item.get("id") or "")
    items.sort(key=sort_key, reverse=reverse)
    return items


def replace_admin_collection(connection, config: Dict[str, Any], entries: List[Dict[str, Any]]):
    sanitized_list = config["sanitise_collection"](entries)
    existing_rows = fetch_collection_items(connection, config["collection"])
    existing_ids = {normalise_text(row.get("item_id")) for row in existing_rows if row.get("item_id")}
    new_ids = {item.get("id") for item in sanitized_list if item.get("id")}

    for item_id in existing_ids - new_ids:
        delete_collection_item(connection, config["collection"], item_id)

    for item in sanitized_list:
        item_id = item.get("id")
        if not item_id:
            continue
        upsert_collection_item(connection, config["collection"], item_id, item)

    reverse = bool(config.get("sort_reverse"))
    sort_key: Callable[[Dict[str, Any]], Any] = config.get("sort_key") or (lambda entry: entry.get("id") or "")
    sanitized_list.sort(key=sort_key, reverse=reverse)
    return sanitized_list


@app.route("/api/content/<collection_name>", methods=["GET", "PUT"])
def admin_content_collection(collection_name: str):
    config = resolve_admin_collection(collection_name)

    if request.method == "GET":
        with get_connection() as connection:
            items = load_admin_collection(connection, config)
        return jsonify({"items": items})

    require_admin_user()

    payload = request.get_json(silent=True) or {}
    entries = payload.get("items") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        raise ApiError("A list of items is required.", status_code=400)

    with get_connection() as connection:
        items = replace_admin_collection(connection, config, entries)
        connection.commit()

    return jsonify({"items": items})
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
        "gallery": sanitise_gallery(
            payload.get("gallery"),
            status="approved",
            limit=MAX_FLEET_GALLERY_IMAGES,
        ),
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


def replace_fleet_with_snapshots(
    connection,
    snapshots: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not snapshots:
        return []

    delete_all_fleet_buses(connection)

    created: List[Dict[str, Any]] = []
    for snapshot in snapshots:
        reg_key = normalise_reg_key(snapshot.get("regKey"))
        registration = normalise_text(snapshot.get("registration")) or reg_key
        if not reg_key or not registration:
            continue

        seen_at = snapshot.get("seenAt")
        if isinstance(seen_at, datetime):
            seen_dt = seen_at.astimezone(timezone.utc)
        else:
            seen_dt = parse_iso_datetime(seen_at) or datetime.now(timezone.utc)

        seen_iso = seen_dt.isoformat()
        new_until_iso = (seen_dt + NEW_BUS_DURATION).isoformat()

        extras = sanitise_extras(snapshot.get("extras"))

        payload = {
            "regKey": reg_key,
            "registration": registration,
            "fleetNumber": normalise_text(snapshot.get("vehicleId")),
            "status": "Active",
            "vehicleType": "Bus",
            "extras": extras,
            "newUntil": new_until_iso,
            "isNewBus": True,
            "createdAt": seen_iso,
            "lastUpdated": seen_iso,
        }

        try:
            bus = upsert_fleet_bus(
                connection,
                payload,
                fallback_created_at=seen_iso,
            )
        except ApiError as exc:
            print(
                f"[fleet-sync] Skipped snapshot for {reg_key}: {exc}",
                flush=True,
            )
            continue

        created.append(bus)

    if created:
        connection.commit()
    else:
        connection.rollback()

    return created


def maybe_sync_live_buses(
    connection,
    existing_reg_keys: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], bool]:
    global _last_fleet_sync_attempt, _last_fleet_sync_success

    if not FLEET_AUTO_SYNC_ENABLED:
        return [], False

    if existing_reg_keys is None:
        existing_reg_keys = set()

    now = time.monotonic()
    if (
        FLEET_AUTO_SYNC_INTERVAL_SECONDS > 0
        and now - _last_fleet_sync_attempt < FLEET_AUTO_SYNC_INTERVAL_SECONDS
    ):
        return [], False

    with _fleet_sync_lock:
        now = time.monotonic()
        if (
            FLEET_AUTO_SYNC_INTERVAL_SECONDS > 0
            and now - _last_fleet_sync_attempt < FLEET_AUTO_SYNC_INTERVAL_SECONDS
        ):
            return [], False

        _last_fleet_sync_attempt = now
        snapshots, history_success = fetch_recent_vehicle_snapshots(
            FLEET_VEHICLE_HISTORY_DAYS
        )
        if history_success and snapshots:
            created = replace_fleet_with_snapshots(connection, snapshots)
            if created:
                _last_fleet_sync_success = time.monotonic()
                print(
                    f"[fleet-sync] Rebuilt {len(created)} vehicles from TfL vehicle history feed",
                    flush=True,
                )
                return created, True
            print(
                "[fleet-sync] TfL vehicle history feed returned no usable entries; falling back to incremental sync",
                flush=True,
            )

        registrations, success = fetch_all_bus_registrations()
        if not success or not registrations:
            return [], False

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
        return created, False


def delete_pending_for_reg(connection, reg_key: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            DELETE FROM app_collections
            WHERE collection = %s AND data->>'regKey' = %s
            """,
            (FLEET_COLLECTION_PENDING, reg_key),
        )


def delete_all_fleet_buses(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            DELETE FROM app_collections
            WHERE collection = %s
            """,
            (FLEET_COLLECTION_BUSES,),
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
    *,
    images: Optional[Sequence[Dict[str, Any]]] = None,
    submitted_by: Optional[str] = None,
) -> Dict[str, Any]:
    delete_pending_for_reg(connection, reg_key)

    change_id = uuid.uuid4().hex
    sanitized = sanitise_bus_payload(
        {**payload, "regKey": reg_key, "registration": registration},
    )
    sanitized.pop("createdAt", None)
    sanitized.pop("lastUpdated", None)
    sanitized.pop("gallery", None)

    pending_images = (
        list(images)
        if images is not None
        else sanitise_gallery(
            payload.get("images") or payload.get("pendingImages"),
            status="pending",
            submitted_by=submitted_by,
            limit=MAX_FLEET_PENDING_IMAGES,
        )
    )
    if pending_images and MAX_FLEET_PENDING_IMAGES:
        pending_images = pending_images[:MAX_FLEET_PENDING_IMAGES]

    pending_data = {
        "id": change_id,
        "regKey": reg_key,
        "registration": registration,
        "submittedAt": iso_now(),
        "status": "pending",
        "data": sanitized,
    }

    if pending_images:
        pending_data["images"] = pending_images

    if submitted_by:
        pending_data["submittedBy"] = submitted_by

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
    synced_buses, replaced = maybe_sync_live_buses(connection, existing_keys)
    if replaced:
        buses = {}
    for bus in synced_buses:
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


def require_fleet_admin() -> Dict[str, Any]:
    return require_admin_user()


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


def _optional_text(value: Any) -> Optional[str]:
    text = normalise_text(value)
    return text or None


def serialise_profile_extras(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "displayName": normalise_text(row.get("display_name")),
        "photoURL": normalise_text(row.get("photo_url")),
        "gender": normalise_text(row.get("gender")),
        "updatedAt": to_iso(row.get("updated_at")),
    }


def sanitise_profile_extras_payload(payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    if not isinstance(payload, dict):
        return {}
    display_name = payload.get("displayName") or payload.get("display_name")
    gender = payload.get("gender")
    photo_url = (
        payload.get("photoURL")
        or payload.get("photoUrl")
        or payload.get("avatar")
        or payload.get("image")
    )
    return {
        "display_name": _optional_text(display_name),
        "photo_url": _optional_text(photo_url),
        "gender": _optional_text(gender),
    }


def fetch_profile_extras(connection, uid: str) -> Optional[Dict[str, Any]]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT display_name, photo_url, gender, created_at, updated_at
            FROM profile_extras
            WHERE uid = %s
            """,
            (uid,),
        )
        row = cursor.fetchone()
        return row


def upsert_profile_extras(connection, uid: str, payload: Dict[str, Optional[str]]):
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            INSERT INTO profile_extras (uid, display_name, photo_url, gender)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (uid)
            DO UPDATE SET
                display_name = EXCLUDED.display_name,
                photo_url = EXCLUDED.photo_url,
                gender = EXCLUDED.gender,
                updated_at = NOW()
            RETURNING display_name, photo_url, gender, created_at, updated_at
            """,
            (
                uid,
                payload.get("display_name"),
                payload.get("photo_url"),
                payload.get("gender"),
            ),
        )
        return cursor.fetchone()


@app.route("/api/profile", methods=["GET", "PATCH"])
def profile_extras_endpoint():
    user_info = require_authenticated_user()
    uid = normalise_text(user_info.get("localId"))
    if not uid:
        raise AuthError("Authenticated user is missing an id", status_code=403)

    if request.method == "GET":
        with get_connection() as connection:
            row = fetch_profile_extras(connection, uid)
        extras = serialise_profile_extras(row)
        if extras is None:
            return jsonify({"error": "Profile extras not found."}), 404
        return jsonify(extras)

    payload = request.get_json(silent=True) or {}
    sanitized = sanitise_profile_extras_payload(payload)

    if not sanitized:
        return ("", 204)

    with get_connection() as connection:
        row = upsert_profile_extras(connection, uid, sanitized)
        connection.commit()

    extras = serialise_profile_extras(row)
    if extras is None:
        return ("", 204)
    return jsonify(extras)


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


@app.route("/api/fleet/live", methods=["GET"])
def fleet_live_snapshot():
    snapshot = live_tracker.snapshot()
    if not live_tracker.enabled:
        meta = snapshot.setdefault("meta", {})
        meta.setdefault("enabled", False)
        meta["message"] = (
            "Live fleet tracking is disabled. Set FLEET_LIVE_TRACKING_ENABLED=true to enable the poller."
        )
        return jsonify(snapshot), 503
    return jsonify(snapshot)


@app.route("/api/fleet/<reg_key>", methods=["GET"])
def fleet_profile(reg_key: str):
    reg = normalise_reg_key(reg_key)
    if not reg:
        raise ApiError("A valid vehicle registration is required.", status_code=400)

    with get_connection() as connection:
        bus_row = fetch_bus_row(connection, reg)
        if not bus_row:
            raise ApiError("Bus not found.", status_code=404)
        profile = serialise_bus_profile(
            connection,
            bus_row,
            include_sightings=True,
            include_history=True,
            include_speed=True,
        )
    return jsonify({"bus": profile})


@app.route("/api/fleet/<reg_key>/sightings", methods=["GET"])
def fleet_profile_sightings(reg_key: str):
    reg = normalise_reg_key(reg_key)
    if not reg:
        raise ApiError("A valid vehicle registration is required.", status_code=400)
    limit = request.args.get("limit", "50")
    try:
        limit_value = max(1, min(int(limit), 500))
    except ValueError:
        limit_value = 50

    with get_connection() as connection:
        bus_row = fetch_bus_row(connection, reg)
        if not bus_row:
            raise ApiError("Bus not found.", status_code=404)
        rows = fetch_recent_sightings(connection, reg, limit=limit_value)
        sightings = [serialise_sighting(row) for row in rows]
    return jsonify({"reg": reg, "sightings": sightings})


@app.route("/api/fleet/<reg_key>/history", methods=["GET"])
def fleet_profile_history(reg_key: str):
    reg = normalise_reg_key(reg_key)
    if not reg:
        raise ApiError("A valid vehicle registration is required.", status_code=400)
    limit = request.args.get("limit", "100")
    try:
        limit_value = max(1, min(int(limit), 500))
    except ValueError:
        limit_value = 100

    with get_connection() as connection:
        bus_row = fetch_bus_row(connection, reg)
        if not bus_row:
            raise ApiError("Bus not found.", status_code=404)
        rows = fetch_bus_history(connection, reg, limit=limit_value)
        history = [serialise_history_event(row) for row in rows]
    return jsonify({"reg": reg, "history": history})


@app.route("/api/fleet/search", methods=["GET"])
def fleet_search_endpoint():
    query = request.args.get("q", "")
    limit = request.args.get("limit", "25")
    try:
        limit_value = max(1, min(int(limit), 100))
    except ValueError:
        limit_value = 25

    with get_connection() as connection:
        rows = search_buses(connection, query, limit=limit_value)
        now = datetime.now(timezone.utc)
        results = [serialise_bus_summary(row, now=now) for row in rows]
    return jsonify({"results": results, "query": query})


@app.route("/api/fleet/rare", methods=["GET"])
def fleet_rare_endpoint():
    limit = request.args.get("limit", "50")
    try:
        limit_value = max(1, min(int(limit), 100))
    except ValueError:
        limit_value = 50

    with get_connection() as connection:
        rows = list_rare_buses(connection, limit=limit_value)
        now = datetime.now(timezone.utc)
        results = [serialise_bus_summary(row, now=now) for row in rows]
    return jsonify({"results": results})


@app.route("/api/fleet/sightings", methods=["POST"])
def fleet_ingest_sightings():
    payload = request.get_json(silent=True) or {}
    entries = payload.get("sightings") if isinstance(payload, dict) else None
    if entries is None:
        entries = [payload]
    if not isinstance(entries, list):
        raise ApiError("Sighting payload must be a list or object.", status_code=400)

    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    with get_connection() as connection:
        for entry in entries:
            if not isinstance(entry, dict):
                errors.append({"error": "invalid", "entry": entry})
                continue
            try:
                outcome = record_bus_sighting(connection, entry)
                connection.commit()
            except ApiError as exc:
                connection.rollback()
                errors.append(
                    {
                        "error": str(exc),
                        "registration": entry.get("registration") or entry.get("vehicleId"),
                    }
                )
                continue
            except Exception as exc:
                connection.rollback()
                errors.append(
                    {
                        "error": str(exc),
                        "registration": entry.get("registration") or entry.get("vehicleId"),
                    }
                )
                continue

            if outcome:
                results.append(
                    {
                        "reg": outcome["bus"].get("reg") if outcome.get("bus") else None,
                        "badges": outcome.get("badges"),
                        "sighting": serialise_sighting(outcome.get("sighting")),
                    }
                )

    status_code = 200 if not errors else 207
    return jsonify({"ingested": len(results), "results": results, "errors": errors}), status_code


@app.route("/api/operators", methods=["GET"])
def operators_list():
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT o.*, COUNT(b.reg) AS fleet_size
                FROM operators o
                LEFT JOIN buses b ON b.operator_id = o.operator_id
                GROUP BY o.operator_id
                ORDER BY o.name ASC
                """
            )
            rows = cursor.fetchall() or []
    operators = []
    for row in rows:
        operator = serialise_operator(row)
        if operator:
            operator["fleetSize"] = int(row.get("fleet_size") or 0)
            operators.append(operator)
    return jsonify({"operators": operators})


@app.route("/api/operators/<int:operator_id>", methods=["GET"])
def operators_detail(operator_id: int):
    limit = request.args.get("limit", "100")
    try:
        limit_value = max(1, min(int(limit), 200))
    except ValueError:
        limit_value = 100

    with get_connection() as connection:
        operator_row = fetch_operator_by_id(connection, operator_id)
        if not operator_row:
            raise ApiError("Operator not found.", status_code=404)
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT *
                FROM buses
                WHERE operator_id = %s
                ORDER BY last_seen DESC
                LIMIT %s
                """,
                (operator_id, limit_value),
            )
            rows = cursor.fetchall() or []
        now = datetime.now(timezone.utc)
        fleet = [serialise_bus_summary(row, now=now) for row in rows]
        operator = serialise_operator(operator_row)
        operator["fleetSize"] = len(fleet)
    return jsonify({"operator": operator, "buses": fleet})


@app.route("/api/edits", methods=["GET", "POST"])
def edits_collection():
    if request.method == "GET":
        status_filter = normalise_text(request.args.get("status")) or None
        limit = request.args.get("limit", "100")
        try:
            limit_value = max(1, min(int(limit), 500))
        except ValueError:
            limit_value = 100
        with get_connection() as connection:
            rows = fetch_edit_requests(connection, status=status_filter, limit=limit_value)
        edits = [serialise_edit_request(row) for row in rows if row]
        return jsonify({"edits": edits})

    payload = request.get_json(silent=True) or {}
    reg_input = payload.get("reg") or payload.get("registration")
    reg = normalise_reg_key(reg_input)
    if not reg:
        raise ApiError("A vehicle registration is required.", status_code=400)

    action = normalise_edit_action(payload.get("action"))
    if action not in {"pin_badge", "unpin_badge"}:
        raise ApiError("Unsupported edit action.", status_code=400)

    badge_value = payload.get("badge") or payload.get("label") or BADGE_RARE_WORKING
    user_id = normalise_text(payload.get("userId") or payload.get("submittedBy")) or None
    extra_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}

    with get_connection() as connection:
        bus_row = fetch_bus_row(connection, reg)
        if not bus_row:
            raise ApiError("Bus not found.", status_code=404)
        request_row = create_edit_request(
            connection,
            reg,
            action,
            badge_value,
            extra_payload,
            user_id=user_id,
        )
        connection.commit()

        edit = serialise_edit_request(request_row)
    return jsonify({"edit": edit}), 201


@app.route("/api/edits/<request_id>/approve", methods=["POST"])
def edits_approve(request_id: str):
    require_fleet_admin()
    payload = request.get_json(silent=True) or {}
    reviewer = normalise_text(payload.get("reviewer") or payload.get("reviewedBy")) or None
    notes = payload.get("notes")

    with get_connection() as connection:
        row = get_edit_request(connection, request_id)
        if not row:
            raise ApiError("Edit request not found.", status_code=404)
        if row.get("status") != "pending":
            raise ApiError("Edit request has already been processed.", status_code=409)
        updated_bus = apply_edit_request_effect(connection, row, reviewer)
        updated_request = update_edit_request_status(
            connection,
            request_id,
            status="approved",
            reviewer=reviewer,
            notes=notes if notes is None else str(notes),
        )
        profile = serialise_bus_profile(connection, updated_bus)
        connection.commit()

    return jsonify({
        "status": "approved",
        "edit": serialise_edit_request(updated_request),
        "bus": profile,
    })


@app.route("/api/edits/<request_id>/reject", methods=["POST"])
def edits_reject(request_id: str):
    require_fleet_admin()
    payload = request.get_json(silent=True) or {}
    reviewer = normalise_text(payload.get("reviewer") or payload.get("reviewedBy")) or None
    notes = payload.get("notes")

    with get_connection() as connection:
        row = get_edit_request(connection, request_id)
        if not row:
            raise ApiError("Edit request not found.", status_code=404)
        if row.get("status") != "pending":
            raise ApiError("Edit request has already been processed.", status_code=409)
        updated_request = update_edit_request_status(
            connection,
            request_id,
            status="rejected",
            reviewer=reviewer,
            notes=notes if notes is None else str(notes),
        )
        connection.commit()

    return jsonify({
        "status": "rejected",
        "edit": serialise_edit_request(updated_request),
    })


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

    submitted_by = normalise_text(
        payload.get("submittedBy") or payload.get("submitted_by")
    )
    pending_images = sanitise_gallery(
        payload.get("images") or payload.get("pendingImages"),
        status="pending",
        submitted_by=submitted_by,
        limit=MAX_FLEET_PENDING_IMAGES,
    )

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
            prepared.pop("gallery", None)
            bus = upsert_fleet_bus(
                connection,
                prepared,
                fallback_created_at=prepared.get("createdAt"),
            )
            pending_change = None
            if pending_images:
                pending_change = create_pending_change(
                    connection,
                    reg_key,
                    registration,
                    {"regKey": reg_key, "registration": registration},
                    images=pending_images,
                    submitted_by=submitted_by,
                )
            connection.commit()
            response: Dict[str, Any] = {"status": "created", "bus": bus}
            if pending_change:
                response["pendingImages"] = len(pending_change.get("images") or [])
            return jsonify(response), 201

        pending = create_pending_change(
            connection,
            reg_key,
            registration,
            {**bus_payload, "regKey": reg_key, "registration": registration},
            images=pending_images,
            submitted_by=submitted_by,
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
    admin_user = require_fleet_admin()
    reviewer = normalise_text(admin_user.get("email")) or normalise_text(
        admin_user.get("localId")
    )
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

        pending_images = pending.get("images") if isinstance(pending, dict) else None
        approved_images: List[Dict[str, Any]] = []
        if pending_images:
            for entry in pending_images:
                sanitized = sanitise_image_entry(
                    entry,
                    status="approved",
                    submitted_by=normalise_text(
                        entry.get("submittedBy") if isinstance(entry, dict) else ""
                    ),
                )
                if not sanitized:
                    continue
                if reviewer and not normalise_text(sanitized.get("approvedBy")):
                    sanitized["approvedBy"] = reviewer
                if not normalise_text(sanitized.get("approvedAt")):
                    sanitized["approvedAt"] = iso_now()
                approved_images.append(sanitized)

        if approved_images:
            merged["gallery"] = merge_gallery_entries(
                merged.get("gallery") or existing.get("gallery") or [],
                approved_images,
                limit=MAX_FLEET_GALLERY_IMAGES,
            )

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
