# Ms_mcp
Microservice mcp.

Depend on "Ms_cronjob" (use "ms_cronjob-volume" to share the certificate).

It's possible to use a custom certificate instead of self‑signed.
Just add it to the "/certificate/custom/" folder and change the env variable before build the container.

## Info:
- Cross platform (Windows, Linux)
- Tool: Document parser, Math, OCR, RAG.
- Task: Automation web.
- Agent: Work in progress..

## Installation
1. For build and up write on terminal:
```
bash docker/container_execute.sh "local" "build-up"
```

2. Just for up write on terminal:
```
bash docker/container_execute.sh "local" "up"
```

## Reset
1. Delete this from the root:
    - .cache
    - .config
    - .local
    - .npm
    - .pki
    - .venv
    - dist
    - node_modules
    - package-lock.json

2. Follow the "Installation" instructions.

## Command
1. For execute "Chrome" GUI write on terminal:
```
bash script/chrome.sh
```
