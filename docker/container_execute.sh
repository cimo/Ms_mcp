#!/bin/bash

p1=$(printf '%s' "${1}" | xargs)
p2=$(printf '%s' "${2}" | xargs)

if [ "$#" -lt 2 ]
then
    echo -e "\n❌ container_execute.sh - Missing parameter."

    exit 1
fi

parameter1="${p1}"
parameter2="${p2}"

echo -e "\nCopying from volume..."

projectName="cimo"

docker run --rm \
-e HOST_UID="$(id -u)" \
-e HOST_GID="$(id -g)" \
-v "${projectName}_${parameter1}_ms_cronjob-volume:/home/source/:ro" \
-v "$(pwd)/certificate/:/home/target/" \
alpine sh -c 'cp -a "/home/source/." "/home/target/" && chown -R "${HOST_UID}:${HOST_GID}" "/home/target/" && chmod -R u+rwX,go+rX "/home/target/" && chmod 600 "/home/target/ca.key" "/home/target/tls.key"'

echo -e "\nExecute container."

if [ "${parameter2}" = "build-up" ]
then
    docker compose -f "docker-compose.yaml" --env-file "./env/${parameter1}.env" --env-file "./env/${parameter1}.secret.env" build --no-cache &&
    docker compose -f "docker-compose.yaml" --env-file "./env/${parameter1}.env" --env-file "./env/${parameter1}.secret.env" up --detach --pull always
elif [ "${parameter2}" = "up" ]
then
    docker compose -f "docker-compose.yaml" --env-file "./env/${parameter1}.env" --env-file "./env/${parameter1}.secret.env" up --detach --pull always
fi
