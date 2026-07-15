import sys
sys.dont_write_bytecode = True

import os
import json
import time
import signal
import socket
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Source
from engine import Engine

class HandlerHttpRequest(BaseHTTPRequestHandler):
    engine = Engine()

    def _routeDelete(self, text):
        payload = json.loads(text)

        mcpSessionId = payload.get("mcpSessionId")
        fileName = payload.get("fileName")

        return self.engine.delete(mcpSessionId, fileName)

    def _routeSearch(self, text):
        payload = json.loads(text)

        mcpSessionId = payload.get("mcpSessionId")
        prompt = payload.get("prompt")
        entityList = payload.get("entityList")
        themeList = payload.get("themeList")

        return self.engine.search(mcpSessionId, prompt, entityList, themeList)

    def _routeStore(self, text):
        payload = json.loads(text)

        mcpSessionId = payload.get("mcpSessionId")
        fileName = payload.get("fileName")

        return self.engine.store(mcpSessionId, fileName)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))

        text = self.rfile.read(length).decode("utf-8")

        result = {}

        if self.path == "/store":
            result = self._routeStore(text)
        elif self.path == "/search":
            result = self._routeSearch(text)
        elif self.path == "/delete":
            result = self._routeDelete(text)

        body = json.dumps(result, ensure_ascii=False).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

        self.wfile.write(body)

    def log_message(self, format, *argumentList):
        return

urlSplit = os.environ["MS_M_URL_API_ONNX_RG"].replace("http://", "").split(":")
host = urlSplit[0]
port = int(urlSplit[1])

checkSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
isRunning = checkSocket.connect_ex((host, port)) == 0
checkSocket.close()

if isRunning:
    pathScript = os.path.dirname(os.path.abspath(__file__))
    pgrepRun = subprocess.run(["pgrep", "-f", f"{pathScript}/server.py"], capture_output=True, text=True)
    pidSplit = pgrepRun.stdout.split()

    for a in range(len(pidSplit)):
        if int(pidSplit[a]) != os.getpid():
            os.kill(int(pidSplit[a]), signal.SIGTERM)

    while isRunning:
        time.sleep(0.1)

        checkSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        isRunning = checkSocket.connect_ex((host, port)) == 0
        checkSocket.close()

serverHttp = ThreadingHTTPServer((host, port), HandlerHttpRequest)

print(f"Onnx - rag_graphify - Ready on => {host}:{port}")

serverHttp.serve_forever()
