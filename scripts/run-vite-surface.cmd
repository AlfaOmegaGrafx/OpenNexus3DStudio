@echo off
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" "%~dp0..\node_modules\vite\bin\vite.js" --host 10.0.0.32 --strictPort false
