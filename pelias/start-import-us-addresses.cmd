@echo off
setlocal

set "WSL_REPO=/mnt/c/Panskai-work/PyPSA/MicroGrid"
set "OUT_LOG=C:\Panskai-work\PyPSA\MicroGrid\.tools\pelias-data\us\import-addresses.out.log"
set "ERR_LOG=C:\Panskai-work\PyPSA\MicroGrid\.tools\pelias-data\us\import-addresses.err.log"

if exist "%OUT_LOG%" del "%OUT_LOG%"
if exist "%ERR_LOG%" del "%ERR_LOG%"

wsl bash -lc "bash %WSL_REPO%/pelias/run-import-us-addresses.sh > %WSL_REPO%/.tools/pelias-data/us/import-addresses.out.log 2> %WSL_REPO%/.tools/pelias-data/us/import-addresses.err.log"
