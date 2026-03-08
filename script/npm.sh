#!/bin/bash

p1=$(printf '%s' "${1}" | xargs)

if [ "$#" -lt 1 ]
then
    echo "npm.sh - Missing parameter."

    exit 1
fi

parameter1="${1}"

rm -rf "${PATH_ROOT}node_modules/" "${PATH_ROOT}package-lock.json"
npm install
npm run "${parameter1}"
