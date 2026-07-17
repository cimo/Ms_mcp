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
urlModel="https://huggingface.co/cimo001/PP-DocLayout_plus-L/resolve/main/"

mkdir -p "${pathModel}"

fileList="onnx/pp-docLayout_plus-l.onnx"

for file in ${fileList}
do
    fileName=$(basename "${file}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download document_parser PP-DocLayout_plus-L: ${fileName}"

        if ! curl -fsSL "${urlModel}${file}" -o "${pathModel}${fileName}"
        then
            echo "Skip document_parser PP-DocLayout_plus-L - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

python3 "${PATH_ROOT}onnx/document_parser/server.py" >> "${PATH_ROOT}${MS_M_PATH_LOG}document_parser.log" 2>&1 &

# Onnx - rag_graphify - embeddinggemma-300m
pathModel="/home/app/onnx/rag_graphify/model/embeddinggemma-300m/"
urlModel="https://huggingface.co/cimo001/embeddinggemma-300m/resolve/main/"

mkdir -p "${pathModel}"

fileList="onnx/model.onnx onnx/model.onnx_data tokenizer.model tokenizer_config.json special_tokens_map.json config.json"

for file in ${fileList}
do
    fileName=$(basename "${file}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify embeddinggemma-300m: ${fileName}"

        if ! curl -fsSL "${urlModel}${file}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify embeddinggemma-300m - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

# Onnx - rag_graphify - gliner_multi-v2.1
pathModel="/home/app/onnx/rag_graphify/model/gliner_multi-v2.1/"
urlModel="https://huggingface.co/cimo001/gliner_multi-v2.1/resolve/main/"

mkdir -p "${pathModel}"

fileList="onnx/model.onnx gliner_config.json config.json tokenizer_config.json spm.model special_tokens_map.json added_tokens.json"

for file in ${fileList}
do
    fileName=$(basename "${file}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify gliner_multi-v2.1: ${fileName}"

        if ! curl -fsSL "${urlModel}${file}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify gliner_multi-v2.1 - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

# Onnx - rag_graphify - bge-reranker-v2-m3
pathModel="/home/app/onnx/rag_graphify/model/bge-reranker-v2-m3/"
urlModel="https://huggingface.co/cimo001/bge-reranker-v2-m3/resolve/main/"

mkdir -p "${pathModel}"

fileList="onnx/model.onnx onnx/model.onnx_data tokenizer_config.json special_tokens_map.json config.json sentencepiece.bpe.model"

for file in ${fileList}
do
    fileName=$(basename "${file}")

    if [ ! -f "${pathModel}${fileName}" ]
    then
        echo "Download rag_graphify bge-reranker-v2-m3: ${fileName}"

        if ! curl -fsSL "${urlModel}${file}" -o "${pathModel}${fileName}"
        then
            echo "Skip rag_graphify bge-reranker-v2-m3 - ${fileName}: download failed."

            rm -f "${pathModel}${fileName}"
        fi
    fi
done

python3 "${PATH_ROOT}onnx/rag_graphify/server.py" >> "${PATH_ROOT}${MS_M_PATH_LOG}rag_graphify.log" 2>&1 &
