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

# Onnx - document_parser
pathModel="/home/app/onnx/document_parser/model/"
urlModel="https://huggingface.co/PaddlePaddle/PP-DocLayout_plus-L_onnx/resolve/main/"

fileName="pp-docLayout_plus-l.onnx"

if [ ! -f "${pathModel}${fileName}" ]
then
    echo "Download document_parser: ${fileName}"

    if ! curl -fsSL "${urlModel}inference.onnx" -o "${pathModel}${fileName}"
    then
        echo "Skip document_parser - ${fileName}: download failed."

        rm -f "${pathModel}${fileName}"
    fi
fi

python3 "${PATH_ROOT}onnx/document_parser/server.py" >> "${PATH_ROOT}${MS_M_PATH_LOG}document_parser.log" 2>&1 &

# Onnx - rag_graphify
pathModel="/home/app/onnx/rag_graphify/model/"
urlModel="https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/"

fileList="onnx/model.onnx gliner_config.json config.json tokenizer.json tokenizer_config.json spm.model special_tokens_map.json added_tokens.json"

for file in ${fileList}
do
    fileName=$(basename "${file}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify: ${fileName}"

        if ! curl -fsSL "${urlModel}${file}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

python3 "${PATH_ROOT}onnx/rag_graphify/server.py" >> "${PATH_ROOT}${MS_M_PATH_LOG}rag_graphify.log" 2>&1 &
