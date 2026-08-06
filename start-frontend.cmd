@echo off
set BACKEND_URL=http://127.0.0.1:6001
set HOST=0.0.0.0
set PORT=5173
cd /d "C:\Panskai-work\PyPSA\MicroGrid-homerpro\frontend"
"C:\Users\1\AppData\Local\Programs\Python\Python313\python.exe" serve-dist-proxy.py > "C:\Panskai-work\PyPSA\MicroGrid-homerpro\frontend\frontend-proxy.out.log" 2> "C:\Panskai-work\PyPSA\MicroGrid-homerpro\frontend\frontend-proxy.err.log"
