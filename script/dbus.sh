#!/bin/bash

xdgRuntimeDir=$XDG_RUNTIME_DIR
userId="/run/user/$(id -u)/"

XDG_RUNTIME_DIR="${userId}" \
DBUS_SESSION_BUS_ADDRESS="unix:path=${userId}bus" \
dbus-daemon --session --address="unix:path=${userId}bus" --fork

ln -sf "${userId}bus" "${xdgRuntimeDir}bus"