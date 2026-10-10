"""Serve the throwaway game-screen prototype locally: python3 docs/spec/mockups/game-screen-layout/serve.py."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial

if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    print("Game screen prototype: http://127.0.0.1:4310/?variant=A", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 4310), partial(SimpleHTTPRequestHandler, directory=str(root))).serve_forever()
