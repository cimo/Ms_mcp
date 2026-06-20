import sys
sys.dont_write_bytecode = True

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Source
from engine import Engine

class HandlerHttpRequest(BaseHTTPRequestHandler):
    def _store(self, text):
        payload = json.loads(text)

        cookie = payload.get("cookie", "")
        mcpSessionId = payload.get("mcpSessionId", "")
        uniqueId = payload.get("uniqueId", "")
        fileName = payload.get("fileName", "")

        return engine.store(cookie, mcpSessionId, uniqueId, fileName)

    def _search(self, text):
        payload = json.loads(text)

        cookie = payload.get("cookie", "")
        mcpSessionId = payload.get("mcpSessionId", "")
        uniqueId = payload.get("uniqueId", "")
        prompt = payload.get("prompt", "")
        entityList = payload.get("entityList", [])
        themeList = payload.get("themeList", [])

        return engine.search(cookie, mcpSessionId, uniqueId, prompt, entityList, themeList)

    def _delete(self, text):
        payload = json.loads(text)

        mcpSessionId = payload.get("mcpSessionId", "")
        fileName = payload.get("fileName", "")

        return engine.delete(mcpSessionId, fileName)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))

        text = self.rfile.read(length).decode("utf-8")

        result = {}

        if self.path == "/store":
            result = self._store(text)
        elif self.path == "/search":
            result = self._search(text)
        elif self.path == "/delete":
            result = self._delete(text)
        else:
            result = engine.process(text)

        body = json.dumps(result, ensure_ascii=False).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

        self.wfile.write(body)

    def log_message(self, format, *argumentList):
        return

engine = Engine()

port = 1111
serverHttp = ThreadingHTTPServer(("127.0.0.1", port), HandlerHttpRequest)

print(f"Onnx - rag_grphify - Ready on => 127.0.0.1:{port}\n")

serverHttp.serve_forever()
