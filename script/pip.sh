#!/bin/bash

pathEnv="${PATH_ROOT}.venv/"

if [ ! -d "${pathEnv}" ]
then
    python3 -m venv "${pathEnv}"
fi

. "${pathEnv}bin/activate"

python3 -m pip install --no-cache-dir --upgrade pip==26.2.1

python3 -m pip install -r "${PATH_ROOT}requirement.txt"

# Onnx
cpuVendor=$(awk -F: '/vendor_id/{gsub(/^[ \t]+/,"",$2); print $2; exit}' "/proc/cpuinfo")

if [ "${cpuVendor}" = "AuthenticAMD" ]
then
    python3 -m pip install onnxruntime==1.24.4
elif [ "${cpuVendor}" = "GenuineIntel" ]
then
    python3 -m pip install onnxruntime-openvino==1.24.1
fi

# Onnx - rag_graphify - embeddinggemma-300m
pathModel="/home/app/onnx/rag_graphify/model/google/embeddinggemma-300m/"
urlModel="https://huggingface.co/cimo001/google/resolve/main/embeddinggemma-300m/"

mkdir -p "${pathModel}"

modelList=(
    "onnx/model.onnx"
    "onnx/model.onnx_data"
    "onnx/tokenizer.model"
)

for model in "${modelList[@]}"
do
    fileName=$(basename "${model}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify embeddinggemma-300m: ${fileName}"

        if ! curl -fsSL "${urlModel}${model}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify embeddinggemma-300m - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

# Onnx - rag_graphify - gliner_multi-v2.1
pathModel="/home/app/onnx/rag_graphify/model/urchade/gliner_multi-v2.1/"
urlModel="https://huggingface.co/cimo001/urchade/resolve/main/gliner_multi-v2.1/"

mkdir -p "${pathModel}"

modelList=(
    "onnx/model.onnx"
    "onnx/spm.model"
)

for model in "${modelList[@]}"
do
    fileName=$(basename "${model}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify gliner_multi-v2.1: ${fileName}"

        if ! curl -fsSL "${urlModel}${model}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify gliner_multi-v2.1 - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

# Onnx - rag_graphify - bge-reranker-v2-m3
pathModel="/home/app/onnx/rag_graphify/model/baai/bge-reranker-v2-m3/"
urlModel="https://huggingface.co/cimo001/baai/resolve/main/bge-reranker-v2-m3/"

mkdir -p "${pathModel}"

modelList=(
    "onnx/model.onnx"
    "onnx/model.onnx_data"
    "onnx/sentencepiece.bpe.model"
)

for model in "${modelList[@]}"
do
    fileName=$(basename "${model}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify bge-reranker-v2-m3: ${fileName}"

        if ! curl -fsSL "${urlModel}${model}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify bge-reranker-v2-m3 - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

python3 "${PATH_ROOT}onnx/rag_graphify/server.py" >> "${PATH_ROOT}${MS_M_PATH_LOG}rag_graphify.log" 2>&1 &
