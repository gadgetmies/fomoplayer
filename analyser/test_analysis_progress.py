import contextlib
import io
import os
import tempfile
import unittest
from unittest import mock

import analysis_progress


def progress(*args, **kwargs):
    return " · ".join(analysis_progress.progress(*args, **kwargs))


class Fetcher:
    """Stands in for the database: returns the queued counts and counts calls."""

    def __init__(self, *counts):
        self.counts = list(counts)
        self.calls = 0

    def __call__(self):
        self.calls += 1
        result = self.counts.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def counts(total, remaining, in_bucket, ignored=0):
    return {"total": total, "remaining": remaining, "in_bucket": in_bucket, "ignored": ignored}


class ProgressTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cache = os.path.join(self.dir.name, "progress.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_first_count_shows_bucket_remaining_and_total_without_a_rate(self):
        line = progress(self.cache, 300, now=1000, fetch=Fetcher(counts(139423, 21454, 973)))
        self.assertEqual(line, "bucket 973 · left 21454/139423 · …/h · ETA …")

    def test_database_is_asked_once_per_refresh_interval(self):
        fetch = Fetcher(counts(100, 50, 5), counts(100, 40, 5))
        first = progress(self.cache, 300, now=1000, fetch=fetch)
        second = progress(self.cache, 300, now=1299, fetch=fetch)
        self.assertEqual(fetch.calls, 1)
        self.assertEqual(first, second)
        progress(self.cache, 300, now=1300, fetch=fetch)
        self.assertEqual(fetch.calls, 2)

    def test_rate_and_eta_come_from_analysed_growth_over_the_last_hour(self):
        # 440 analysed in an hour while 100 new previews arrived: the rate
        # counts analyses, not the net change in what is left.
        progress(self.cache, 300, now=0, fetch=Fetcher(counts(139000, 21894, 973)))
        line = progress(self.cache, 300, now=3600, fetch=Fetcher(counts(139100, 21554, 900)))
        self.assertEqual(line, "bucket 900 · left 21554/139100 · 440/h · ETA 2d 1h")

    def test_rate_uses_the_sample_about_an_hour_old_not_the_oldest(self):
        progress(self.cache, 300, now=0, fetch=Fetcher(counts(1000, 1000, 0)))       # 0 analysed
        progress(self.cache, 300, now=3600, fetch=Fetcher(counts(1000, 900, 0)))     # 100 analysed
        line = progress(self.cache, 300, now=7200, fetch=Fetcher(counts(1000, 600, 0)))  # 400 analysed
        self.assertEqual(line, "bucket 0 · left 600/1000 · 300/h · ETA 2h 00m")

    def test_no_rate_before_ten_minutes_of_counts(self):
        progress(self.cache, 300, now=0, fetch=Fetcher(counts(1000, 1000, 0)))
        line = progress(self.cache, 300, now=599, fetch=Fetcher(counts(1000, 990, 0)))
        self.assertIn("…/h", line)

    def test_no_progress_shows_no_eta(self):
        progress(self.cache, 300, now=0, fetch=Fetcher(counts(1000, 500, 10)))
        line = progress(self.cache, 300, now=3600, fetch=Fetcher(counts(1000, 500, 10)))
        self.assertEqual(line, "bucket 10 · left 500/1000 · 0/h · ETA –")

    def test_nothing_left_shows_done(self):
        line = progress(self.cache, 300, now=0, fetch=Fetcher(counts(1000, 0, 0)))
        self.assertEqual(line, "bucket 0 · left 0/1000 · done")

    def test_previews_that_are_never_downloaded_show_as_ignored(self):
        line = progress(self.cache, 300, now=0, fetch=Fetcher(counts(139483, 0, 0, ignored=274)))
        self.assertEqual(line, "bucket 0 · left 0/139483 · ignored 274 · done")

    def test_ignored_previews_do_not_count_as_analysed(self):
        # 100 previews analysed in an hour while 50 more became ignored: the
        # rate is 100/h, not 150/h.
        progress(self.cache, 300, now=0, fetch=Fetcher(counts(1000, 600, 0, ignored=100)))
        line = progress(self.cache, 300, now=3600, fetch=Fetcher(counts(1000, 450, 0, ignored=150)))
        self.assertEqual(line, "bucket 0 · left 450/1000 · ignored 150 · 100/h · ETA 4h 30m")

    def test_failed_refresh_shows_the_last_line_as_stale(self):
        progress(self.cache, 300, now=0, fetch=Fetcher(counts(1000, 500, 10)))
        line = progress(self.cache, 300, now=600, fetch=Fetcher(RuntimeError("connection refused")))
        self.assertEqual(line, "bucket 10 · left 500/1000 · …/h · ETA … (stale)")

    def test_failed_first_refresh_shows_a_short_error(self):
        line = progress(self.cache, 300, now=0, fetch=Fetcher(RuntimeError("no DATABASE_URL from railway")))
        self.assertEqual(line, "progress: no DATABASE_URL from railway")

    def run_main(self, *argv):
        out = io.StringIO()
        with mock.patch.dict(os.environ, {"ANALYSIS_PROGRESS_DATABASE_URL": "postgres://unused"}), \
                mock.patch.object(analysis_progress, "fetch_counts", lambda url: counts(10, 5, 1)), \
                contextlib.redirect_stdout(out):
            self.assertEqual(analysis_progress.main(["--cache", self.cache, *argv]), 0)
        return out.getvalue()

    def test_main_prints_one_line_by_default(self):
        self.assertEqual(self.run_main(), "bucket 1 · left 5/10 · …/h · ETA …\n")

    def test_main_prints_each_half_for_two_status_lines(self):
        self.assertEqual(self.run_main("--part", "counts"), "bucket 1 · left 5/10\n")
        self.assertEqual(self.run_main("--part", "rate"), "…/h · ETA …\n")

    def test_error_goes_on_the_counts_line_only(self):
        with mock.patch.object(analysis_progress, "database_url", side_effect=RuntimeError("no DATABASE_URL")), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            analysis_progress.main(["--cache", self.cache, "--part", "rate"])
            analysis_progress.main(["--cache", self.cache, "--part", "counts"])
        self.assertEqual(out.getvalue(), "\nprogress: no DATABASE_URL\n")


if __name__ == "__main__":
    unittest.main()
