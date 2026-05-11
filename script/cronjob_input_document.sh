#!/bin/bash

path="${PATH_ROOT}${MS_M_PATH_FILE}input/"

currentTime=$(date +%s)

for data in "${path}"*
do
    if [ -e "${data}" ]
    then
        statData=$(stat -c %Y "${data}")
        time=$((${currentTime} - ${statData}))

        if [ ${time} -gt "${MS_M_PERSISTENCE_SECOND}" ]
        then
            if [ -d "${data}" ]
            then
                bash "${PATH_ROOT}${MS_M_PATH_SCRIPT}rag_delete_database.sh" "${data}/"
                
                rm -rf "${data}"

                echo -e "\nFolder '${data}' deleted."
            else
                rm -f "${data}"
                
                echo -e "\nFile '${data}' deleted."
            fi
        fi
    fi
done