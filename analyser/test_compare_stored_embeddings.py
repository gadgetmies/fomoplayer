"""Tests for the gate decision of compare_stored_embeddings.py: the switch to
the shared package needs at least the wanted number of compared previews and
samples, every one at cosine >= 0.99999, and no item that failed to embed."""

import unittest

try:
    import compare_stored_embeddings as gate
except ImportError:  # track-embedding or psycopg2 not installed
    gate = None


def _row(kind, status='compared', cosine=0.999999, **extra):
    return {'kind': kind, 'id': 1, 'source': 'Beatport', 'status': status, 'cosine': cosine,
            'codec': 'mp3', 'sample_rate': '44100', 'channels': 2, 'error': None, **extra}


@unittest.skipIf(gate is None, 'track-embedding is not installed')
class GateTest(unittest.TestCase):
    def rows(self, previews=3, samples=2):
        return [_row('preview') for _ in range(previews)] + [_row('sample') for _ in range(samples)]

    def test_passes_when_every_vector_matches(self):
        summary = gate.summarise(self.rows(), 3, 2)
        self.assertTrue(summary['passed'])
        self.assertEqual((summary['previews']['compared'], summary['samples']['compared']), (3, 2))
        self.assertEqual(summary['version'], 'track-embedding/1')

    def test_one_vector_below_the_tolerance_fails(self):
        rows = self.rows() + [_row('sample', cosine=0.99998)]
        summary = gate.summarise(rows, 3, 2)
        self.assertFalse(summary['passed'])
        self.assertEqual(summary['samples']['below_gate'], 1)
        self.assertEqual(summary['samples']['min_cosine'], 0.99998)

    def test_too_few_compared_items_fail(self):
        rows = self.rows(previews=2) + [_row('preview', status='unavailable', cosine=None)]
        self.assertFalse(gate.summarise(rows, 3, 2)['passed'])

    def test_an_item_that_failed_to_embed_fails(self):
        rows = self.rows() + [_row('preview', status='error', cosine=None, error='DecodeError')]
        self.assertFalse(gate.summarise(rows, 3, 2)['passed'])

    def test_unavailable_audio_alone_does_not_fail(self):
        rows = self.rows() + [_row('preview', status='unavailable', cosine=None)]
        summary = gate.summarise(rows, 3, 2)
        self.assertTrue(summary['passed'])
        self.assertEqual(summary['previews']['statuses'], {'compared': 3, 'unavailable': 1})


if __name__ == '__main__':
    unittest.main()
