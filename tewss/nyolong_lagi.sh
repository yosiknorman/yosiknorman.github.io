#!/bin/bash
while [[ true ]]; do
    SSH_USER="sysop@172.19.144.241"
    sshpass -p sysop scp "${SSH_USER}:/home/sysop/nyoba_pipe/data/filter.txt" "/home/yosik/tews/filter.txt"
    ./convertToGeojson.R
    sleep $(( 5 ))
done
