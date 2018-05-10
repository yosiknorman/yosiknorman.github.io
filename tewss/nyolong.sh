#!/usr/bin/expect

   spawn sftp get sysop@172.19.144.240:/home/sysop/nyoba_pipe/filter.txt .
   expect "sysop@172.19.144.240 password :"
   send "sysop"
   send "exit"
