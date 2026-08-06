@echo off
echo Starting Terraflow build and run process...

REM Check if .env file exists and set env file flag
set "USE_ENV_FILE="
REM Get the script directory and resolve project root
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
set "ENV_PATH=%PROJECT_ROOT%\.env"
if exist "%ENV_PATH%" (
    echo Found .env file at: %ENV_PATH%
    set "USE_ENV_FILE=1"
) else (
    echo .env file not found at: %ENV_PATH%
    echo Terraflow will use default configuration
)

echo.
echo Step 1: Installing frontend dependencies...
cd ..\..\src\frontend
if errorlevel 1 (
    echo Error: Could not navigate to src\frontend directory
    pause
    exit /b 1
)

echo Running npm install...
call npm install
if errorlevel 1 (
    echo Error: npm install failed
    pause
    exit /b 1
)

echo.
echo Step 2: Building frontend...
echo Running npm run build...
call npm run build
if errorlevel 1 (
    echo Error: npm run build failed
    pause
    exit /b 1
)

echo.
echo Step 3: Copying build files to backend...
cd ..\..

REM Check if build directory exists
if not exist "src\frontend\build" (
    if not exist "src\frontend\dist" (
        echo Error: Neither build nor dist directory found in src\frontend
        pause
        exit /b 1
    )
    set BUILD_DIR=src\frontend\dist
) else (
    set BUILD_DIR=src\frontend\build
)

echo Copying from %BUILD_DIR% to src\backend\base\terraflow\frontend\
REM Create target directory if it doesn't exist
if not exist "src\backend\base\terraflow\frontend" (
    mkdir "src\backend\base\terraflow\frontend"
)

REM Remove existing files in target directory (FORCES CLEAN REPLACEMENT)
echo Removing existing files from target directory...
if exist "src\backend\base\terraflow\frontend\*" (
    del /q /s "src\backend\base\terraflow\frontend\*"
    for /d %%d in ("src\backend\base\terraflow\frontend\*") do rmdir /s /q "%%d"
)

REM Copy all files from build directory
xcopy "%BUILD_DIR%\*" "src\backend\base\terraflow\frontend\" /e /i /y
if errorlevel 1 (
    echo Error: Failed to copy build files
    pause
    exit /b 1
)

echo Build files copied successfully!

echo.
echo Step 4: Running Terraflow...
echo.
echo Attention: Wait until uvicorn is running before opening the browser
echo.
REM Change to project root directory for uv
cd "%PROJECT_ROOT%"
if defined USE_ENV_FILE (
    echo Using env file: .env
    uv run --env-file ".env" terraflow run
) else (
    uv run terraflow run
)
if errorlevel 1 (
    echo Error: Failed to run terraflow
    pause
    exit /b 1
)

echo.
echo Terraflow build and run process completed!
pause