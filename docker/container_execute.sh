#!/bin/bash

set -euo pipefail

p1=$(printf '%s' "${1}" | xargs)
p2=$(printf '%s' "${2}" | xargs)

if [ "$#" -lt 2 ]
then
    echo -e "\n❌ container_execute.sh - Missing parameter."

    exit 1
fi

parameter1="${1}"
parameter2="${2}"

echo -e "\nCopying from volume..."

docker run --rm \
-v cimo_${parameter1}_ms_cronjob-volume:/home/source/:ro \
-v $(pwd)/certificate/:/home/target/ \
alpine sh -c "cp -r /home/source/* /home/target/"

echo -e "\nExecute container."

if [ "${parameter2}" = "build-up" ]
then
    docker compose -f docker-compose.yaml --env-file ./env/${parameter1}.env --env-file ./env/${parameter1}.secret.env build --no-cache &&
    docker compose -f docker-compose.yaml --env-file ./env/${parameter1}.env --env-file ./env/${parameter1}.secret.env up --detach --pull always
elif [ "${parameter2}" = "up" ]
then
    docker compose -f docker-compose.yaml --env-file ./env/${parameter1}.env --env-file ./env/${parameter1}.secret.env up --detach --pull always
fi
