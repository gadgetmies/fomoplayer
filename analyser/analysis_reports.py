"""Batched result reports to the backend, with a per-entry fallback.

The admin endpoints the analyser reports to (`/admin/analyse`,
`/admin/waveform`) take a list and fail the whole request if one entry fails,
so a failed batch is resent one entry per request: only the bad entries stay
queued. Shared by `main.py` and `analyse_previews.py`.
"""

import requests

from auth import auth_header, get_api_url

API_TIMEOUT_S = 120


def _label(entry):
    return entry.get('id') or entry.get('preview_id')


def post_with_fallback(path, entries):
    """POST `entries` to `path` in one request; if that fails, resend them one
    by one. Returns how many entries the backend accepted."""
    if not entries:
        return 0
    try:
        res = requests.post(f"{get_api_url()}{path}", headers=auth_header(), json=entries,
                            timeout=API_TIMEOUT_S)
        if res.status_code == 200:
            print(f"Reported {len(entries)} result(s) to {path}")
            return len(entries)
        print(f"Reporting {len(entries)} result(s) to {path} failed: {res.status_code} {res.text[:500]}")
    except requests.RequestException as e:
        print(f"Reporting {len(entries)} result(s) to {path} failed: {e!r}")
    if len(entries) == 1:
        return 0
    print("Resending the results one by one")
    accepted = 0
    for entry in entries:
        try:
            res = requests.post(f"{get_api_url()}{path}", headers=auth_header(), json=[entry],
                                timeout=API_TIMEOUT_S)
            if res.status_code == 200:
                accepted += 1
            else:
                print(f"Error reporting results for preview {_label(entry)}: {res.status_code} {res.text[:500]}")
        except requests.RequestException as e:
            print(f"Error reporting results for preview {_label(entry)}: {e!r}")
    return accepted


def post_analysis(entries):
    """Report embeddings and missing previews to `/admin/analyse`."""
    return post_with_fallback('/admin/analyse', entries)
