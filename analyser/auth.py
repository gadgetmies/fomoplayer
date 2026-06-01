"""Shared authentication helpers for the analyser workers.

The analyser authenticates to the Fomo Player backend with a long-lived Fomo
Player API key (`Authorization: Bearer fp_...`), mirroring the `fomoplayer` CLI.
There is no Google OIDC login flow, browser, or token cache — API keys are
long-lived, so nothing needs refreshing.

Key resolution order:
1. `FOMOPLAYER_API_KEY` from the environment.
2. The `apiKey` field of the CLI config file, written by `fomoplayer login`.
   The CLI uses the `conf` npm package (which uses `env-paths` under the hood),
   so the location is platform-specific:
     - macOS:   ~/Library/Preferences/fomoplayer-nodejs/config.json
     - Linux:   $XDG_CONFIG_HOME/fomoplayer-nodejs/config.json
                (default: ~/.config/fomoplayer-nodejs/config.json)
     - Windows: %LOCALAPPDATA%\\fomoplayer-nodejs\\Config\\config.json
   For backward compatibility the analyser also accepts an older
   `~/.config/fomoplayer/config.json` path (without the `-nodejs` suffix)
   that previous docs referenced.
"""

import json
import os
import sys


def _cli_config_candidates():
    """Return CLI config paths to try, in priority order.

    Mirrors the `env-paths` logic used by the CLI's `conf` package on each OS,
    then falls back to the legacy XDG-style path the README originally listed.
    """
    home = os.path.expanduser("~")
    candidates = []

    if sys.platform == "darwin":
        candidates.append(
            os.path.join(home, "Library", "Preferences", "fomoplayer-nodejs", "config.json")
        )
    elif sys.platform.startswith("win"):
        local_app_data = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA")
        if local_app_data:
            candidates.append(
                os.path.join(local_app_data, "fomoplayer-nodejs", "Config", "config.json")
            )
    else:
        # Linux / other POSIX
        xdg = os.getenv("XDG_CONFIG_HOME") or os.path.join(home, ".config")
        candidates.append(os.path.join(xdg, "fomoplayer-nodejs", "config.json"))

    # Legacy / cross-OS fallback: the path the analyser README previously
    # documented (without the `-nodejs` suffix `conf` appends).
    legacy_home = os.getenv("XDG_CONFIG_HOME") or os.path.join(home, ".config")
    candidates.append(os.path.join(legacy_home, "fomoplayer", "config.json"))

    return candidates


def _api_key_from_cli_config():
    for path in _cli_config_candidates():
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r") as file:
                key = json.load(file).get("apiKey") or None
        except (json.JSONDecodeError, OSError):
            continue
        if key:
            return key
    return None


def get_api_key():
    """Return the Fomo Player API key, or raise an actionable error.

    Prefers `FOMOPLAYER_API_KEY`; falls back to the `fomoplayer` CLI config.
    """
    key = os.getenv("FOMOPLAYER_API_KEY") or _api_key_from_cli_config()
    if not key:
        raise SystemExit(
            "No Fomo Player API key found. Run `fomoplayer login` on an admin "
            "account, or set FOMOPLAYER_API_KEY in the environment. The key's "
            "account must have an OIDC subject in the backend's ADMIN_USER_SUBS."
        )
    return key


def auth_header():
    """Return the Authorization header for an authenticated backend request."""
    return {"Authorization": f"Bearer {get_api_key()}"}


def get_api_url():
    """Return the backend base URL from `FOMOPLAYER_API_URL`, or raise.

    No deployment URL is baked into the source (see repo CLAUDE.md).
    """
    url = os.getenv("FOMOPLAYER_API_URL")
    if not url:
        raise SystemExit(
            "FOMOPLAYER_API_URL must be set (e.g. https://fomoplayer.com/api). "
            "Export it in your shell profile or pass it inline before invoking "
            "the analyser."
        )
    return url


def request_error(action, res):
    """Build an error message for a failed backend response.

    On `403` the backend returns `{"error":"Access denied"}` for non-admin
    credentials, so the message spells out the admin-subject prerequisite.
    """
    if res.status_code == 403:
        return (
            f"{action} returned 403 (access denied): {res.text}. The API key's "
            "account must have an OIDC subject listed in the backend's "
            "ADMIN_USER_SUBS to call /admin/* endpoints."
        )
    return f"{action} returned an error {res.status_code}: {res.text}"
