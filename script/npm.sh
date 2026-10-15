#!/bin/bash

p1=$(printf '%s' "${1}" | xargs)

if [ "$#" -lt 1 ] || [ -z "${p1}" ]
then
    echo -e "\n❌ npm.sh - Missing parameter."

    exit 1
fi

parameter1="${p1}"

rm -rf "${PATH_ROOT}node_modules/" "${PATH_ROOT}package-lock.json"

if ! npm install
then
    echo -e "\n❌ npm.sh - npm install failed."

    exit 1
fi

npm run "${parameter1}"
