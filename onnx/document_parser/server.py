import sys
sys.dont_write_bytecode = True

import os
import glob
import shutil
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

    def _pageImageGenerate(self, pathInput):
        pathPage = f"{os.path.dirname(pathInput)}/page/"

        if os.path.isdir(pathPage):
            shutil.rmtree(pathPage)

        os.makedirs(pathPage, exist_ok=True)

        subprocess.run(["pdftoppm", "-jpeg", "-r", "150", pathInput, f"{pathPage}page"], capture_output=True, text=True)

        fileNameList = glob.glob(f"{pathPage}page-*.jpg")

        for a in range(len(fileNameList)):
            pageNumber = int(os.path.splitext(os.path.basename(fileNameList[a]))[0].split("-")[1])

            os.rename(fileNameList[a], f"{pathPage}{pageNumber}.jpg")    
    
    def _routeEngine(self, text):
        engine = Engine()

        payload = json.loads(text)

        pathInput = payload.get("pathInput")
        pathOutput = payload.get("pathOutput")

        fileName = os.path.basename(pathInput)

        return engine.execute(pathInput, pathOutput, fileName)

    def _routeLayout(self, text):
        payload = json.loads(text)

        pathInput = payload.get("pathInput")
        pathOutput = payload.get("pathOutput")

        extension = os.path.splitext(pathInput)[1].lower()
        fileName = os.path.basename(pathInput)

        result = {}

        if extension == ".pdf":
            self._pageImageGenerate(pathInput)

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

class ServerHttp(ThreadingHTTPServer):
    def handle_error(self, request, clientAddress):
        errorText = str(sys.exc_info()[1])

        bodyByte = json.dumps({"error": errorText}, ensure_ascii=False).encode("utf-8")

        headerText = f"HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: {len(bodyByte)}\r\nConnection: close\r\n\r\n"

        request.sendall(headerText.encode("utf-8") + bodyByte)

        print(f"Error: {errorText}")

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

serverHttp = ServerHttp((host, port), HandlerHttpRequest)

print(f"Onnx - document_parser - Ready on => {host}:{port}")

serverHttp.serve_forever()
