@echo off
setlocal
title KETARI Platform Launcher
color 0A

rem ============================================================
rem  KETARI Platform Launcher
rem
rem  Starts all four services, each in its own window:
rem    5001  AI matching service   (python-ai-service/app.py)
rem    5002  AI chat service       (python-ai-service/chat_service.py)
rem    5000  Backend API           (backend, npm run dev)
rem    3000  Frontend              (frontend, npm start)
rem ============================================================

set "ROOT=%~dp0"
set "PYTHON=%ROOT%python-ai-service\venv\Scripts\python.exe"

echo.
echo ========================================
echo   KETARI Platform Launcher
echo ========================================
echo.

rem ---- Check prerequisites before launching anything ----------
if not exist "%PYTHON%" (
    echo [ERROR] Python virtual environment not found:
    echo         %PYTHON%
    echo.
    echo Create it first:
    echo     cd python-ai-service
    echo     python -m venv venv
    echo     venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%backend\node_modules" (
    echo [ERROR] Backend dependencies are missing. Run: cd backend ^&^& npm install
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%frontend\node_modules" (
    echo [ERROR] Frontend dependencies are missing. Run: cd frontend ^&^& npm install
    echo.
    pause
    exit /b 1
)

echo [1/4] Starting AI Matching Service (port 5001)...
start "KETARI - AI Matching" cmd /k "cd /d "%ROOT%python-ai-service" && "%PYTHON%" app.py"

echo [2/4] Starting AI Chat Service (port 5002)...
start "KETARI - AI Chat" cmd /k "cd /d "%ROOT%python-ai-service" && "%PYTHON%" chat_service.py"
ping 127.0.0.1 -n 4 >nul

echo [3/4] Starting Backend API (port 5000)...
start "KETARI - Backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"
ping 127.0.0.1 -n 6 >nul

echo [4/4] Starting Frontend (port 3000)...
start "KETARI - Frontend" cmd /k "cd /d "%ROOT%frontend" && npm start"

echo.
echo ========================================
echo   All services started
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000/api
echo   AI Svc:   http://localhost:5001
echo   AI Chat:  http://localhost:5002/api/chat
echo ========================================
echo.
echo Each service runs in its own window. Close a window to stop that service.
echo.
pause
endlocal
