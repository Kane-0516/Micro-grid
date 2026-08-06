@echo off
set HOST=0.0.0.0
set PORT=5173
cd /d "C:\Panskai-work\Learn\07-??\02-Pre-sale\MicroGrid-homerpro\frontend"
call npm run dev -- --host 0.0.0.0 --port 5173 --open /product-config.html
