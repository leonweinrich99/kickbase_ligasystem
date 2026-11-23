import time
import requests

BASE_URL = "https://api.kickbase.com/v4"

_SESSION = requests.Session()
_RETRY_STATUSES = {429, 500, 502, 503, 504}


def get_json_with_token(url, token, max_retries=4):
    """Fetch JSON data from a given URL using token for authorization.

    Nutzt eine gemeinsame HTTP-Session mit automatischem Retry + exponentiellem
    Backoff bei Rate-Limits (429) und kurzfristigen Server-/Netzwerkfehlern,
    damit bei ~450 Spielern x 3 Requests keine Teams mehr stillschweigend
    herausfallen (Bug-Fall Bremen/Freiburg/Augsburg/Schalke).
    """

    headers = {"Authorization": f"Bearer {token}"}
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            resp = _SESSION.get(url, headers=headers, timeout=30)
            if resp.status_code in _RETRY_STATUSES and attempt < max_retries:
                retry_after = resp.headers.get("Retry-After")
                try:
                    wait_s = float(retry_after) if retry_after else (1.5 * (2 ** attempt))
                except ValueError:
                    wait_s = 1.5 * (2 ** attempt)
                time.sleep(min(wait_s, 15.0))
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            last_error = exc
            if attempt < max_retries:
                time.sleep(min(1.5 * (2 ** attempt), 15.0))
                continue
            raise

    raise last_error
