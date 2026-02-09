#!/bin/bash

google-chrome --no-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --hide-crash-restore-bubble >> "${PATH_ROOT}${MS_M_PATH_LOG}chrome.log" 2>&1 &