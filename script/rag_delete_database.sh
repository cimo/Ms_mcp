#!/bin/bash

p1=$(printf '%s' "${1}" | xargs)

if [ "$#" -lt 1 ]
then
    echo -e "\n❌ rag_delete_database.sh - Missing parameter."

    exit 1
fi

parameter1="${1}"

localeFromEnvName() {
    local env_name="${1:-$ENV_NAME}"
    local result="${env_name##*_}"

    if [ -z "$result" ] || [ "$result" = "local" ]; then
        result="jp"
    fi

    echo "$result"
}

protocol="http"

if [ "$(localeFromEnvName)" = "jp" ]
then
    protocol="https"
fi

sessionId=$(basename "${parameter1}")
cookie="${PATH_ROOT}${MS_M_PATH_FILE}tmp/ms_mcp_cookie.txt"

baseUrl="${protocol}://${DOMAIN}:${SERVER_PORT}"
curl -fsSL -c "${cookie}" -H "mcp-session-id: ${sessionId}" "${baseUrl}/login" > /dev/null 2>&1

for fileFolder in "${parameter1}"*
do
    baseFileName=$(basename "${fileFolder}")

    curl -fsSL -b "${cookie}" \
        -H "Content-Type: application/json" \
        -H "mcp-session-id: ${sessionId}" \
        -X POST "${baseUrl}/api/file-uploaded-delete" \
        -d "{\"fileName\": \"\", \"baseFileName\":\"${baseFileName}\"}" > /dev/null 2>&1

    echo -e "\nUploaded file folder '${fileFolder}' deleted."
done

rm -f "${cookie}"
 