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
from layout import Pdf, Office
from engine import Engine

class HandlerHttpRequest(BaseHTTPRequestHandler):
    layoutPdf = Pdf()

    def _fileName(self, pathInput):
        result = os.path.basename(pathInput)

        if os.path.splitext(pathInput)[1].lower() == ".pdf":
            result = f"{os.path.basename(os.path.dirname(pathInput))}.pdf"

        return result

    def _routeEngine(self, text):
        engine = Engine()

        payload = json.loads(text)

        pathInput = payload.get("pathInput")
        pathOutput = payload.get("pathOutput")

        fileName = self._fileName(pathInput)

        return engine.execute(pathInput, pathOutput, fileName)

    def _routeLayout(self, text):
        payload = json.loads(text)

        pathInput = payload.get("pathInput")
        pathOutput = payload.get("pathOutput")

        extension = os.path.splitext(pathInput)[1].lower()

        fileName = self._fileName(pathInput)

        result = {}

        if extension == ".pdf":
            result = self.layoutPdf.execute(f"{os.path.dirname(pathInput)}/page/", pathOutput, fileName)
        elif extension == ".docx":
            layoutDocx = Office.Docx()

            result = layoutDocx.execute(pathInput, pathOutput, fileName)
        elif extension == ".xlsx":
            layoutXlsx = Office.Xlsx()

            result = layoutXlsx.execute(pathInput, pathOutput, fileName)
        elif extension == ".pptx":
            layoutPptx = Office.Pptx()

            result = layoutPptx.execute(pathInput, pathOutput, fileName)

        return result

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))

        text = self.rfile.read(length).decode("utf-8")

        result = {}

        if self.path == "/layout":
            result = self._routeLayout(text)
        elif self.path == "/engine":
            result = self._routeEngine(text)

        body = json.dumps(result, ensure_ascii=False).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

        self.wfile.write(body)

    def log_message(self, format, *argumentList):
        return

urlSplit = os.environ["MS_M_URL_API_ONNX_DP"].replace("http://", "").split(":")
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

print(f"Onnx - document_parser - Ready on => {host}:{port}")

serverHttp.serve_forever()
