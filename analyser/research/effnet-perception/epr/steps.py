"""A resumable step: done.txt (one finished key per line), results.csv, failures.csv and summary.json under
OUT/<step>/. One append-only done file rather than a marker file per item: the output volume is FAT32, where
thousands of small files are slow."""
import csv
import json
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed

from .config import out_path


class Step:
    def __init__(self, name):
        self.name = name
        self.dir = out_path(name, 'x').parent
        self.results_path = out_path(name, 'results.csv')
        self.failures_path = out_path(name, 'failures.csv')
        self.done_path = out_path(name, 'done.txt')
        self._done = set(self.done_path.read_text().split('\n')) - {''} if self.done_path.exists() else set()
        self.started = time.time()
        self.processed = 0
        self.failed = 0
        self.skipped = 0

    def is_done(self, key):
        return str(key) in self._done

    def mark_done(self, key):
        self._done.add(str(key))
        with open(self.done_path, 'a') as f:
            f.write(f'{key}\n')

    def path(self, *parts):
        return out_path(self.name, *parts)

    @staticmethod
    def _append(path, rows):
        if not rows:
            return
        new = not path.exists()
        fields = list(rows[0].keys())
        if not new:
            with open(path, newline='') as f:
                fields = next(csv.reader(f), fields)
        with open(path, 'a', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
            if new:
                w.writeheader()
            w.writerows(rows)

    def add(self, rows):
        self._append(self.results_path, rows if isinstance(rows, list) else [rows])

    def fail(self, key, error):
        self.failed += 1
        self._append(self.failures_path, [{'key': key, 'error': str(error)[:2000]}])

    def results(self):
        if not self.results_path.exists():
            return []
        with open(self.results_path, newline='') as f:
            return list(csv.DictReader(f))

    def run(self, items, work, key=lambda i: i, workers=1):
        """Run work(item) -> list of result rows for every item not already done. Failures are recorded, not
        raised. work must be a top-level function when workers > 1."""
        todo = []
        for item in items:
            if self.is_done(key(item)):
                self.skipped += 1
            else:
                todo.append(item)
        print(f'[{self.name}] {len(todo)} to do, {self.skipped} already done', flush=True)

        def finish(item, rows):
            self.add(rows or [])
            self.mark_done(key(item))
            self.processed += 1
            if self.processed % 10 == 0:
                print(f'[{self.name}] {self.processed}/{len(todo)} ({self.failed} failed)', flush=True)

        if workers <= 1:
            for item in todo:
                try:
                    finish(item, work(item))
                except Exception as e:  # recorded, the step goes on
                    self.fail(key(item), f'{e}\n{traceback.format_exc(limit=3)}')
        else:
            with ProcessPoolExecutor(workers) as pool:
                futures = {pool.submit(work, item): item for item in todo}
                for fut in as_completed(futures):
                    item = futures[fut]
                    try:
                        finish(item, fut.result())
                    except Exception as e:
                        self.fail(key(item), e)
        return self

    def summary(self, **extra):
        data = {'step': self.name, 'processed': self.processed, 'skipped': self.skipped, 'failed': self.failed,
                'seconds': round(time.time() - self.started, 1), **extra}
        out_path(self.name, 'summary.json').write_text(json.dumps(data, indent=2, default=str))
        print(f'[{self.name}] done: {json.dumps(data, default=str)}', flush=True)
        return 1 if self.failed else 0
