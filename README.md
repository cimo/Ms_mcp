# Ms_mcp

Microservice mcp.

Depend on "Ms_cronjob" (use "ms_cronjob-volume" to share the certificate).

It's possible to use a custom certificate instead of "Ms_cronjob", just add it to the "certificate" folder before build the container.

## Info:

-   Cross platform (Windows, Linux)
-   Tool: Math, Automate, Document

## Installation

1. For build and up write on terminal:

```
bash docker/container_execute.sh "local" "build-up"
```

3. Just for up write on terminal:

```
bash docker/container_execute.sh "local" "up"
```

## Reset

1. Remove this from the root:

    - .cache
    - .config
    - .local
    - .ms_cronjob-volume/certificate
    - .npm
    - .pki
    - dist
    - node_modules
    - package-lock.json

2. Follow the "Installation" instructions.

## Command

1. For execute "Chrome" GUI write on terminal:

    ```
    bash script/chrome.sh
    ```
