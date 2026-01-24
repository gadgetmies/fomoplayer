#!/bin/zsh
source venv/bin/activate
while true; do; echo "Processing next batch"; python main.py -p true -m discogs_multi_embeddings-effnet-bs64-1; done

