# Conformance fixtures of `track-embedding/1`

Copied unchanged from the `fixtures/track-embedding-1/` folder of the shared
specification's repository, github.com/gadgetmies/track-embedding, release tag
`v1.0.1` (MIT licence). Synthetic audio in the formats the specification lists,
with reference vectors made by this analyser's former Essentia pipeline
(`reference.json` names the commit). `test_embedding.py` requires every vector
the analyser computes to have cosine similarity of at least 0.99999 with its
reference. Copy them again from the tag the analyser pins when that tag changes.
