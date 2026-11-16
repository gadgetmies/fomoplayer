"""Prepare the next items of a batch in the background, in queue order.

The preview workers spend most of an item's time either waiting on the network
(download) or on the CPU (model inference, drawing a waveform). `ordered`
overlaps the two: while the caller processes one item, the next few are
downloaded and decoded on background threads.

- Results come back in input order, so reports and the embedding sanity check
  see items in queue order.
- At most `workers + 1` items are submitted ahead of the caller, which bounds
  how many prepared (decoded) files sit on disk at once.
- Items for which `use_store_pool(item)` is true are prepared on one
  dedicated thread, one at a time: they contact a store (Bandcamp lookups and
  downloads), whose rate limiting and caches are per-process state and must
  stay serial. The other items (audio stored in our own bucket) are prepared
  on `workers` threads.

Threads, not processes: preparing is network I/O and an ffmpeg subprocess,
neither of which holds the GIL.
"""

from collections import deque
from concurrent.futures import ThreadPoolExecutor


def ordered(items, prepare, use_store_pool=lambda item: False, workers=4):
    """Yield `(item, future)` for each item in order, where `future.result()`
    returns `prepare(item)` or raises what it raised.

    Leaving the loop early (break, exception) cancels the items not started
    yet and waits for the running ones to finish.
    """
    workers = max(1, int(workers))
    window = workers + 1
    items = iter(items)
    pending = deque()
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='prefetch') as bucket_pool, \
            ThreadPoolExecutor(max_workers=1, thread_name_prefix='prefetch-store') as store_pool:
        def submit_next():
            for item in items:
                pool = store_pool if use_store_pool(item) else bucket_pool
                pending.append((item, pool.submit(prepare, item)))
                return True
            return False

        try:
            while len(pending) < window and submit_next():
                pass
            while pending:
                item, future = pending.popleft()
                # Refill before handing the item out, so the next download
                # runs while the caller works on this one.
                submit_next()
                yield item, future
        finally:
            for _, future in pending:
                future.cancel()
