#!/bin/bash

pathInput="${PATH_ROOT}${MS_M_PATH_FILE}input/"

currentTime=$(date +%s)

for data in "${pathInput}"*/
do
    if [ -d "${data}" ]
    then
        statData=$(stat -c %Y "${data}")
        time=$((${currentTime} - ${statData}))

        if [ ${time} -gt 600 ]
        then
            rm -rf "${data}"

            echo "Folder '${data}' removed."
        fi
    fi
done