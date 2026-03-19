#!/bin/bash

for pathEnvFile in "./env/${ENV_NAME}".*
do
    if [ -f "${pathEnvFile}" ]
    then
        while IFS= read -r line
        do
            if [ -n "${line}" ]
            then
                key=$(echo "${line}" | cut -d "=" -f 1)

                value=$(echo "${line}" | cut -d "=" -f 2-)
                value=$(echo "${value}" | sed "s/^'\(.*\)'$/\1/")

                if [ -z "$(printenv "${key}")" ]
                then
                    export "${key}=${value}"
                fi
            fi
        done < "${pathEnvFile}"
    fi
done

export PATH="${PATH_ROOT}.local/bin/:${PATH_ROOT}.cargo/bin/:${PATH}"