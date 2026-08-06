@echo off
set API_HOST=0.0.0.0
set API_PORT=6001
set CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.40.31:5173
set GEOCODER_DEFAULT_REGION=us
set GEOCODER_API_URL=http://localhost:4000/v1/search
set GEOCODER_REVERSE_API_URL=http://localhost:4000/v1/reverse
set GEOCODER_API_URL_CN=http://localhost:4000/v1/search
set GEOCODER_REVERSE_API_URL_CN=http://localhost:4000/v1/reverse
set GEOCODER_API_URL_US=http://localhost:4000/v1/search
set GEOCODER_REVERSE_API_URL_US=http://localhost:4000/v1/reverse
cd /d C:\Panskai-work\PyPSA\MicroGrid-homerpro\backend
C:\Users\1\AppData\Local\Programs\Python\Python313\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 6001 --app-dir C:\Panskai-work\PyPSA\MicroGrid-homerpro\backend 1>> C:\Panskai-work\PyPSA\MicroGrid-homerpro\backend\server-start.out.log 2>> C:\Panskai-work\PyPSA\MicroGrid-homerpro\backend\server-start.err.log
