$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$requirementsPath = Join-Path $projectRoot "requirements.txt"
$defaultModelPath = Join-Path $projectRoot "model\Qwen3.5-9B-Q4_K_S.gguf"
$serverCandidates = @(
    (Join-Path $projectRoot "llama.cpp\build\bin\Release\llama-server.exe"),
    (Join-Path $projectRoot "llama.cpp\build\bin\llama-server.exe"),
    (Join-Path $projectRoot "llama-server.exe")
)
$backendUrl = "http://127.0.0.1:8001"
$frontendUrl = "http://127.0.0.1:1420"

function Get-PythonCommand {
    if (Test-Path $venvPython) {
        return $venvPython
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return $pythonCommand.Source
    }

    throw "Python was not found. Run .\setup_app.bat first."
}

function Test-BackendDependencies {
    param(
        [string]$PythonCommand
    )

    try {
        & $PythonCommand -c "import fastapi, uvicorn" | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Resolve-LlamaServerPath {
    if ($env:LLAMA_SERVER_BIN -and (Test-Path $env:LLAMA_SERVER_BIN)) {
        return $env:LLAMA_SERVER_BIN
    }

    foreach ($candidate in $serverCandidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Resolve-ModelPath {
    if ($env:LLAMA_MODEL_PATH -and (Test-Path $env:LLAMA_MODEL_PATH)) {
        return $env:LLAMA_MODEL_PATH
    }

    if (Test-Path $defaultModelPath) {
        return $defaultModelPath
    }

    return $null
}

function Assert-Ready {
    $pythonCommand = Get-PythonCommand

    if (-not (Test-BackendDependencies -PythonCommand $pythonCommand)) {
        throw "Backend dependencies are missing. Run .\setup_app.bat first."
    }

    if (-not (Test-Path (Join-Path $frontendRoot "node_modules"))) {
        throw "Frontend dependencies are missing. Run .\setup_app.bat first."
    }

    if (-not (Resolve-LlamaServerPath)) {
        throw "llama-server.exe was not found. Put it under .\llama.cpp\build\bin\Release\ or set LLAMA_SERVER_BIN."
    }

    if (-not (Resolve-ModelPath)) {
        throw "GGUF model was not found. Put it under .\model\Qwen3.5-9B-Q4_K_S.gguf or set LLAMA_MODEL_PATH."
    }

    return $pythonCommand
}

function Test-UrlReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    return $false
}

function Start-Backend {
    param(
        [string]$PythonCommand
    )

    if (Test-UrlReady -Url "$backendUrl/api/health" -TimeoutSeconds 1) {
        Write-Host "Backend is already running."
        return
    }

    Write-Host "Starting backend..."
    $escapedPython = $PythonCommand.Replace("'", "''")
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$projectRoot'; & '$escapedPython' -m uvicorn backend_app:app --reload --port 8001"
    ) | Out-Null

    if (-not (Test-UrlReady -Url "$backendUrl/api/health" -TimeoutSeconds 60)) {
        throw "Backend failed to start on port 8001."
    }
}

function Start-Frontend {
    if (Test-UrlReady -Url $frontendUrl -TimeoutSeconds 1) {
        Write-Host "Frontend is already running."
        return
    }

    Write-Host "Starting frontend..."
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$frontendRoot'; npm run dev"
    ) | Out-Null

    if (-not (Test-UrlReady -Url $frontendUrl -TimeoutSeconds 60)) {
        throw "Frontend failed to start on port 1420."
    }
}

$pythonCommand = Assert-Ready
Start-Backend -PythonCommand $pythonCommand
Start-Frontend

Write-Host "Opening app in browser..."
Start-Process $frontendUrl
