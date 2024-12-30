import sys
import os
from threading import Thread, Event


def input_thread(prompt: str, event: Event):
    try:
        os.write(sys.stdout.fileno(), prompt.encode("utf-8"))
        os.read(sys.stdin.fileno(), 1)
    except:
        pass
    finally:
        event.set()


def start_input_thread(prompt: str, event: Event):
    t = Thread(name="input", target=lambda: input_thread(prompt, event), daemon=True)
    t.start()
