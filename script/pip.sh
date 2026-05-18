#!/bin/bash

pathEnv="${PATH_ROOT}.venv/"

if [ ! -d "${pathEnv}" ]
then
    python3 -m venv "${pathEnv}"
fi

. "${pathEnv}bin/activate"

python3 -m pip install -r "${PATH_ROOT}requirement.txt"

# Onnx
cpuVendor=$(awk -F: '/vendor_id/{gsub(/^[ \t]+/,"",$2); print $2; exit}' /proc/cpuinfo)

if [ "${cpuVendor}" = "AuthenticAMD" ]
then
    python3 -m pip install onnxruntime==1.24.4
elif [ "$cpuVendor" = "GenuineIntel" ]
then
    python3 -m pip install onnxruntime-openvino==1.24.1
fi
