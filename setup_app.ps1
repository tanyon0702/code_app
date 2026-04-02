$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$venvRoot = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$requirementsPath = Join-Path $projectRoot "requirements.txt"
$defaultModelPath = Join-Path $projectRoot "model\Qwen3.5-9B-Q4_K_S.gguf"
$serverCandidates = @(
    (Join-Path $projectRoot "llama.cpp\build\bin\Release\llama-server.exe"),
    (Join-Path $projectRoot "llama.cpp\build\bin\llama-server.exe"),
    (Join-Path $projectRoot "llama-server.exe")
)

function Assert-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found. Install it and run setup again."
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

function Ensure-VenvReady {
    if (-not (Test-Path $venvPython)) {
        Write-Host "Creating virtual environment..."
        & python -m venv $venvRoot
    }

    if (-not (Test-Path $venvPython)) {
        throw "Virtual environment creation failed."
    }

    & $venvPython -m ensurepip --upgrade | Out-Null

    & $venvPython -m pip --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "pip is missing in .venv even after ensurepip."
    }
}

Write-Host "Checking required tools..."
Assert-Command -Name "python"
Assert-Command -Name "node"
Assert-Command -Name "npm"

Ensure-VenvReady

Write-Host "Installing backend dependencies..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r $requirementsPath

Write-Host "Installing frontend dependencies..."
Push-Location $frontendRoot
try {
    & npm install
} finally {
    Pop-Location
}

$serverPath = Resolve-LlamaServerPath
if ($serverPath) {
    Write-Host "Found llama-server: $serverPath"
} else {
    Write-Warning "llama-server.exe was not found."
    Write-Warning "Place it in .\llama.cpp\build\bin\Release\ or set LLAMA_SERVER_BIN."
}

$modelPath = Resolve-ModelPath
if ($modelPath) {
    Write-Host "Found model: $modelPath"
} else {
    Write-Warning "GGUF model was not found."
    Write-Warning "Place it in .\model\Qwen3.5-9B-Q4_K_S.gguf or set LLAMA_MODEL_PATH."
}

Write-Host ""
Write-Host "Setup completed."
Write-Host "Next:"
Write-Host "  1. Ensure llama-server and model are available"
Write-Host "  2. Run .\start_app.bat"
