import base64
import json
import logging
import os
import threading
import time
from typing import Any, Dict
from urllib import error, request


LOGGER = logging.getLogger("docya.farmalink")

DEFAULT_BASE_URL = "https://test-servicios.farmalink.com.ar/api/recetaElect/v3"
DEFAULT_OAUTH_URL = "https://test-servicios.farmalink.com.ar/api/oauth/token/generate"

_token_cache: Dict[str, Any] = {"token": None, "expires_at": 0.0}
_token_lock = threading.Lock()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_int(name: str, default: int) -> int:
    v = _env(name)
    try:
        return int(v) if v else default
    except ValueError:
        return default


def _get_oauth_token() -> str:
    """Return a valid Farmalink Bearer token, fetching a new one only when expired."""
    with _token_lock:
        if _token_cache["token"] and time.time() < _token_cache["expires_at"] - 60:
            return _token_cache["token"]

        oauth_url = _env("FARMALINK_OAUTH_URL", DEFAULT_OAUTH_URL)
        client_id = _env("FARMALINK_CLIENT_ID")
        client_secret = _env("FARMALINK_CLIENT_SECRET")
        auth_b64 = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")

        from urllib.parse import urlencode
        body = urlencode({
            "grant_type": "client_credentials",
            "scope": "Switch.RecetaElectRest",
        }).encode("utf-8")

        req = request.Request(
            oauth_url,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "Authorization": f"Basic {auth_b64}",
                "User-Agent": "DocYa-Farmalink/3.0",
            },
            method="POST",
        )
        with request.urlopen(req, timeout=_env_int("FARMALINK_TIMEOUT_SECONDS", 20)) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        token: str = data["access_token"]
        expires_in: int = int(data.get("expires_in", 43200))
        _token_cache["token"] = token
        _token_cache["expires_at"] = time.time() + expires_in
        LOGGER.info("Farmalink OAuth token renovado, expira en %ds", expires_in)
        return token


def create_farmalink_payload(prescription: Dict[str, Any]) -> Dict[str, Any]:
    patient = prescription.get("patient", {})
    doctor = prescription.get("doctor", {})
    medications = prescription.get("medications", [])

    return {
        "prescription_number": prescription.get("cuir"),
        "patient_cuil": patient.get("cuil"),
        "patient_dni": patient.get("dni"),
        "doctor": {
            "full_name": doctor.get("full_name"),
            "specialty": doctor.get("specialty"),
            "license_number": doctor.get("license_number"),
            "care_address": doctor.get("care_address"),
        },
        "medications": [
            {
                "ifa": med.get("ifa"),
                "commercial_name": med.get("commercial_name"),
                "presentation": med.get("presentation"),
                "pharmaceutical_form": med.get("pharmaceutical_form"),
                "quantity": med.get("quantity"),
                "instructions": med.get("instructions"),
            }
            for med in medications
        ],
        "diagnosis": prescription.get("diagnosis"),
        "issued_at": prescription.get("issued_at"),
    }


def _farmalink_post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    base_url = _env("FARMALINK_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    use_mock = _env("FARMALINK_USE_MOCK", "true").lower() != "false"

    if use_mock:
        response = {
            "ok": True,
            "mock": True,
            "status_code": 200,
            "endpoint": path,
            "message": "Mock Farmalink accepted payload",
            "payload_echo": payload,
        }
        LOGGER.info("Farmalink mock response: %s", json.dumps(response, ensure_ascii=False))
        return response

    try:
        token = _get_oauth_token()
    except Exception as exc:
        LOGGER.exception("Farmalink OAuth token fetch failed")
        return {"ok": False, "mock": False, "status_code": None, "endpoint": path, "error": f"OAuth error: {exc}"}

    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{base_url}/{path.lstrip('/')}",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "DocYa-Farmalink/3.0",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=_env_int("FARMALINK_TIMEOUT_SECONDS", 20)) as resp:
            raw = resp.read().decode("utf-8") if resp else ""
            parsed = json.loads(raw) if raw else {}
            response = {
                "ok": 200 <= resp.status < 300,
                "mock": False,
                "status_code": resp.status,
                "endpoint": path,
                "response": parsed,
            }
            LOGGER.info("Farmalink response: %s", json.dumps(response, ensure_ascii=False))
            return response
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            parsed_error: Any = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed_error = raw or str(exc)
        response = {
            "ok": False,
            "mock": False,
            "status_code": exc.code,
            "endpoint": path,
            "error": parsed_error,
        }
        LOGGER.warning("Farmalink HTTP error: %s", json.dumps(response, ensure_ascii=False))
        return response
    except Exception as exc:
        response = {
            "ok": False,
            "mock": False,
            "status_code": None,
            "endpoint": path,
            "error": str(exc),
        }
        LOGGER.exception("Farmalink unexpected error")
        return response


def send_prescription_to_farmalink(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _farmalink_post("altaReceta", payload)
