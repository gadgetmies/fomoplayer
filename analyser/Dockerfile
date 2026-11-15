# Embedding service (embedding_service.py): audio in, Discogs-EffNet vector out.
# Build from analyser/: docker build -t fomoplayer-embedding analyser
# Python 3.12: numpy 1.26.4 (pinned to match the analyser) has no 3.13 wheel and
# this slim image has no compiler to build it.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-service.txt .
RUN pip install --no-cache-dir -r requirements-service.txt

COPY models/discogs_multi_embeddings-effnet-bs64-1.pb models/
COPY audio_decode.py embedding.py embedding_service.py ./

ENV PYTHONUNBUFFERED=1 TF_CPP_MIN_LOG_LEVEL=2
RUN useradd --system --no-create-home embedding
USER embedding

CMD ["python", "embedding_service.py"]
