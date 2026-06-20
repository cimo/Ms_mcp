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

# Onnx - rag_graphify
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/onnx/model.onnx" -o "/home/app/onnx/rag_graphify/model/fp32.onnx"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/gliner_config.json" -o "/home/app/onnx/rag_graphify/model/gliner_config.json"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/config.json" -o "/home/app/onnx/rag_graphify/model/config.json"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/tokenizer.json" -o "/home/app/onnx/rag_graphify/model/tokenizer.json"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/tokenizer_config.json" -o "/home/app/onnx/rag_graphify/model/tokenizer_config.json"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/spm.model" -o "/home/app/onnx/rag_graphify/model/spm.model"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/special_tokens_map.json" -o "/home/app/onnx/rag_graphify/model/special_tokens_map.json"
curl -fsSL "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/added_tokens.json" -o "/home/app/onnx/rag_graphify/model/added_tokens.json"

python3 "${PATH_ROOT}onnx/rag_graphify/server.py" >> "${PATH_ROOT}${MS_M_PATH_LOG}rag_graphify.log" 2>&1 &
