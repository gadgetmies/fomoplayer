import threading
import time
import unittest

import prefetch


class _Tracker:
    """Records how many prepare calls run at once, per kind of item."""

    def __init__(self, delay=0.05):
        self.delay = delay
        self.lock = threading.Lock()
        self.running = {'bucket': 0, 'store': 0}
        self.max_running = {'bucket': 0, 'store': 0}
        self.started = []

    def prepare(self, item):
        kind = 'store' if item.get('store') else 'bucket'
        with self.lock:
            self.started.append(item['id'])
            self.running[kind] += 1
            self.max_running[kind] = max(self.max_running[kind], self.running[kind])
        try:
            time.sleep(self.delay)
            if item.get('fail'):
                raise RuntimeError(f"item {item['id']} failed")
            return item['id'] * 10
        finally:
            with self.lock:
                self.running[kind] -= 1


def _is_store(item):
    return bool(item.get('store'))


class OrderedPrefetchTest(unittest.TestCase):
    def test_results_come_back_in_input_order(self):
        # Later items finish first; the caller still sees them in order.
        def prepare(item):
            time.sleep(0.01 * (5 - item))
            return item

        results = [future.result() for _, future in prefetch.ordered(range(5), prepare, workers=4)]
        self.assertEqual(results, [0, 1, 2, 3, 4])

    def test_bucket_items_are_prepared_concurrently(self):
        tracker = _Tracker()
        items = [{'id': i} for i in range(8)]
        for _, future in prefetch.ordered(items, tracker.prepare, _is_store, workers=4):
            future.result()
        self.assertEqual(tracker.max_running['bucket'], 4)

    def test_store_items_are_prepared_one_at_a_time(self):
        tracker = _Tracker()
        items = [{'id': i, 'store': True} for i in range(6)]
        results = [f.result() for _, f in prefetch.ordered(items, tracker.prepare, _is_store, workers=4)]
        self.assertEqual(results, [i * 10 for i in range(6)])
        self.assertEqual(tracker.max_running['store'], 1)

    def test_no_more_than_workers_plus_one_items_are_submitted_ahead(self):
        tracker = _Tracker(delay=0)
        items = [{'id': i} for i in range(10)]
        gen = prefetch.ordered(items, tracker.prepare, workers=2)
        first, future = next(gen)
        future.result()
        time.sleep(0.05)
        # Items 0..2 fill the window; handing out item 0 submits item 3.
        self.assertEqual(sorted(tracker.started), [0, 1, 2, 3])
        gen.close()

    def test_an_exception_surfaces_on_its_own_item(self):
        tracker = _Tracker(delay=0)
        items = [{'id': 0}, {'id': 1, 'fail': True}, {'id': 2}]
        outcomes = []
        for item, future in prefetch.ordered(items, tracker.prepare, workers=2):
            try:
                outcomes.append(future.result())
            except RuntimeError as e:
                outcomes.append(str(e))
        self.assertEqual(outcomes, [0, 'item 1 failed', 20])

    def test_leaving_early_does_not_start_the_rest(self):
        tracker = _Tracker(delay=0.02)
        items = [{'id': i} for i in range(20)]
        for _, future in prefetch.ordered(items, tracker.prepare, workers=2):
            future.result()
            break
        self.assertLessEqual(len(tracker.started), 4)


if __name__ == '__main__':
    unittest.main()
