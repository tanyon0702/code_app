$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$backendUrl = "http://127.0.0.1:8001"
$frontendUrl = "http://127.0.0.1:1420"

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
    if (Test-UrlReady -Url "$backendUrl/api/health" -TimeoutSeconds 1) {
        Write-Host "Backend is already running."
        return
    }

    Write-Host "Starting backend..."
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$projectRoot'; python -m uvicorn backend_app:app --reload --port 8001"
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

Start-Backend
Start-Frontend

Write-Host "Opening app in browser..."
Start-Process $frontendUrl
