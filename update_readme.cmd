@echo off
chcp 65001 1>nul 2>nul
call "%~sdp0\json_sort.cmd" --help 1>"readme_json_sort.nfo"

exit /b 0
