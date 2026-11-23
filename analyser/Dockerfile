# Embedding service (embedding_service.py): audio in, track-embedding/1 vector out.
# Build from analyser/: docker build -t fomoplayer-embedding analyser
# Python 3.12: numpy 1.26.4 (pinned to match the analyser) has no 3.13 wheel and
# this slim image has no compiler to build it.
FROM python:3.12-slim

# git: pip installs the track-embedding package from its release tag.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-service.txt .
RUN pip install --no-cache-dir -r requirements-service.txt

COPY audio_decode.py embedding.py embedding_service.py ./
# The model (CC BY-NC-SA 4.0, see models/README.md) is downloaded at build time,
# checked against the sha256 pinned in the track-embedding package.
COPY models/README.md models/
RUN python -c "import embedding; embedding.ensure_models()"

ENV PYTHONUNBUFFERED=1
RUN useradd --system --no-create-home embedding
USER embedding

CMD ["python", "embedding_service.py"]
