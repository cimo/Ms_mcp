#!/bin/bash

if [ -n "${1}" ] && [ -n "${2}" ]
then
    source="./.ms_cronjob-volume/"
    
    mapfile -d '' -t fileList < <(find "${source}" -type f ! -name ".gitkeep" -print0 2>/dev/null)

    if [ ${#fileList[@]} -eq 0 ]
    then
        echo "Copying from volume..."

        docker run --rm \
        --user $(id -u):$(id -g) \
        -v cimo_${1}_ms_cronjob-volume:/home/source/:ro \
        -v $(pwd)/.ms_cronjob-volume/:/home/target/ \
        alpine sh -c "cp -r /home/source/* /home/target/"
    fi

    echo "Execute container."

    if [ "${2}" = "build-up" ]
    then
        docker compose -f docker-compose.yaml --env-file ./env/${1}.env build --no-cache &&
        docker compose -f docker-compose.yaml --env-file ./env/${1}.env up --detach --pull always
    elif [ "${2}" = "up" ]
    then
        docker compose -f docker-compose.yaml --env-file ./env/${1}.env up --detach --pull always
    fi
fi
