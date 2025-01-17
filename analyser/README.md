# Instructions

Install pyenv with the following command: 

```brew install pyenv```

Install python 3.13 with the following command: 

```pyenv install 3.12```

Create a virtual environment with the following command: 

```python3 -m venv venv```

Activate the virtual environment with the following command: 

```source venv/bin/activate```

Install dependencies with the following command: 

```pip install -r requirements.txt```

Initialise Postgres vector database

```brew install postgres```
```brew install pgvector```
```createdb multi-store-player-vector```
```createdb multi-store-player-vector-test```

Run the analyser:

```python3 main.py```