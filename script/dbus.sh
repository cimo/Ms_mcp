#!/bin/bash

xdgRuntimeDirectory="${XDG_RUNTIME_DIR}"
userRuntimeDirectory="/run/user/$(id -u)/"

XDG_RUNTIME_DIR="${userRuntimeDirectory}" \
DBUS_SESSION_BUS_ADDRESS="unix:path=${userRuntimeDirectory}/bus" \
dbus-daemon --session --address="unix:path=${userRuntimeDirectory}/bus" --fork

ln -sf "${userRuntimeDirectory}/bus" "${xdgRuntimeDirectory}/bus"
