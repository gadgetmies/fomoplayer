"""Detects bit-identical embeddings across a rolling window of recent items.

Shared by the embedding worker (`main.py`) and the combined preview worker
(`analyse_previews.py`); moved out of `main.py` unchanged.
"""

import datetime
import hashlib
import json
import os

SANITY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".embedding_sanity.json")
COLLISIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embedding_collisions.jsonl")


class EmbeddingSanityChecker:
    """Detects bit-identical embeddings across a rolling window of recent items.

    Two different inputs producing the exact same vector almost always means the
    model is broken (all-zero output, constant output, etc.). The checker
    fingerprints each vector (SHA256 of the rounded list), persists a window of
    the last N entries to disk, and warns / prompts when a new vector matches a
    different earlier id. After the operator confirms once for a run, no further
    prompts fire that run.
    """

    def __init__(self, window_size, skip_prompt):
        self.window_size = max(0, window_size)
        self.skip_prompt = skip_prompt
        self.entries = []
        self.confirmed_continue = False
        if self.window_size > 0 and os.path.isfile(SANITY_FILE):
            try:
                with open(SANITY_FILE) as f:
                    self.entries = json.load(f).get("entries", [])
            except (json.JSONDecodeError, OSError) as e:
                print(f"[sanity] Could not load {SANITY_FILE}: {e}. Starting fresh.")

    @staticmethod
    def _signature(vector):
        # Round to absorb tiny non-determinism (e.g. nondeterministic GPU ops);
        # bit-identical real embeddings to 6 decimals across 1280 dims means the
        # model is degenerate, not that two tracks happen to sound alike.
        rounded = [round(float(x), 6) for x in vector]
        return hashlib.sha256(json.dumps(rounded).encode("utf-8")).hexdigest()

    def _persist(self):
        try:
            with open(SANITY_FILE, "w") as f:
                json.dump({"entries": self.entries[-self.window_size:]}, f)
        except OSError as e:
            print(f"[sanity] WARNING: failed to persist {SANITY_FILE}: {e}")

    @staticmethod
    def _describe(item_id, label):
        """Format an entry as 'id=<x>' or 'id=<x> [<label>]' for log lines."""
        if label:
            return f"id={item_id} [{label}]"
        return f"id={item_id}"

    @staticmethod
    def _append_collision(signature, new_entry, old_entry):
        """Append one collision pair to COLLISIONS_FILE (JSONL, append-only).

        Operators investigate later with e.g.
            jq -s 'group_by(.hash) | map({hash:.[0].hash, ids:[.[].new.id]+[.[].old.id]|unique})' embedding_collisions.jsonl
        to reconstruct full clusters of items that produced the same vector.
        """
        record = {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "hash": signature,
            "new": {
                "id": new_entry["id"],
                "label": new_entry.get("label"),
                "group_key": new_entry.get("group_key"),
            },
            "old": {
                "id": old_entry["id"],
                "label": old_entry.get("label"),
                "group_key": old_entry.get("group_key"),
            },
        }
        try:
            with open(COLLISIONS_FILE, "a") as f:
                f.write(json.dumps(record) + "\n")
        except OSError as e:
            print(f"[sanity] WARNING: failed to append to {COLLISIONS_FILE}: {e}")

    def record_and_check(self, item_id, vector, label=None, group_key=None):
        """Return True to continue, False if the operator chose to abort.

        - `label` is shown next to the id in warnings (e.g. `track_id=123`).
        - `group_key` (if given) identifies a logical source larger than the
          single item: e.g. for store previews the track_id, so two previews
          of the same track aren't flagged as a model failure. Two entries
          with the same `group_key` are NOT treated as collisions.
        - Every collision pair is appended to COLLISIONS_FILE for later
          investigation, even when --skip-sanity-confirmation suppresses the
          interactive prompt.
        """
        if self.window_size <= 0:
            return True

        signature = self._signature(vector)
        item_id_str = str(item_id)
        group_key_str = str(group_key) if group_key is not None else None

        new_entry = {"id": item_id_str, "hash": signature}
        if label:
            new_entry["label"] = label
        if group_key_str:
            new_entry["group_key"] = group_key_str

        def is_same_source(entry):
            # Same preview/sample id → re-analysis, not a model bug.
            if entry.get("id") == item_id_str:
                return True
            # Same group (e.g. two previews of one track) → expected, not a bug.
            if group_key_str and entry.get("group_key") == group_key_str:
                return True
            return False

        collisions = [e for e in self.entries
                      if e.get("hash") == signature and not is_same_source(e)]

        if collisions:
            for old in collisions:
                self._append_collision(signature, new_entry, old)

            # One earlier match is usually the same recording released twice
            # (e.g. a Bandcamp single and its album), so don't stop for it. A
            # broken model gives the same vector for many tracks in a row.
            other_sources = {e.get("group_key") or e.get("id") for e in collisions}
            if len(other_sources) == 1:
                print(
                    f"[sanity] {self._describe(item_id_str, label)} matches "
                    f"{self._describe(collisions[0]['id'], collisions[0].get('label'))} "
                    "bit-for-bit; treating it as a duplicate release.",
                    flush=True,
                )
                self.entries.append(new_entry)
                self._persist()
                return True

            first = collisions[0]
            new_desc = self._describe(item_id_str, label)
            old_desc = self._describe(first["id"], first.get("label"))
            others = len(collisions) - 1
            suffix = (
                f" (and {others} other earlier match{'es' if others != 1 else ''})"
                if others else ""
            )
            print(
                f"\n[sanity] WARNING: embedding for {new_desc} is bit-identical to "
                f"a previously generated embedding for {old_desc}{suffix}.",
                flush=True,
            )
            print(
                f"[sanity] Full collision record(s) appended to {COLLISIONS_FILE}",
                flush=True,
            )
            print(
                "[sanity] This usually indicates a broken / degenerate model "
                "(constant or all-zero output), not two genuinely identical tracks.",
                flush=True,
            )
            if self.confirmed_continue:
                print("[sanity] (continue already confirmed earlier this run — proceeding)", flush=True)
            elif self.skip_prompt:
                print("[sanity] --skip-sanity-confirmation set — proceeding without prompt.", flush=True)
            else:
                try:
                    answer = input("[sanity] Continue anyway? [y/N]: ").strip().lower()
                except EOFError:
                    answer = ""
                if answer not in ("y", "yes"):
                    print("[sanity] Operator declined — aborting batch.", flush=True)
                    return False
                self.confirmed_continue = True

        self.entries.append(new_entry)
        self._persist()
        return True
