@echo off
chcp 65001 1>nul 2>nul

set "NODE_DISABLE_COLORS=1"
call "node" "%~sdp0\json_sort.js" --verbose %*
set "EXIT_CODE=%ErrorLevel%"

echo.[INFO] EXIT_CODE: %EXIT_CODE%  1>&2

popd
::pause  1>&2
exit /b %EXIT_CODE%
