[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$frontendRoot = Join-Path $projectRoot 'web-portwise'
$backendRoot = Join-Path $projectRoot 'backend'
$runtimeRoot = Join-Path $projectRoot '.runtime'
$manifestPath = Join-Path $runtimeRoot 'servers.json'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

function Assert-Command([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { throw "Required command not found: $Name. Install it, reopen the terminal, and retry." }
    return $command.Source
}

function Get-InputHash([string[]]$Paths) {
    return (($Paths | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
        (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash
    }) -join ':')
}

function Test-RecordedProcess($Record) {
    if (-not $Record) { return $false }
    $process = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$Record.pid)" -ErrorAction SilentlyContinue
    if (-not $process -or -not $details) { return $false }
    if ($details.ExecutablePath -ine $Record.executable) { return $false }
    if ([Math]::Abs(($process.StartTime.ToUniversalTime() - ([datetime]$Record.started_at).ToUniversalTime()).TotalSeconds) -gt 2) { return $false }
    if ($Record.kind -eq 'frontend' -and $details.CommandLine -notlike "*$frontendRoot*") { return $false }
    if ($Record.kind -eq 'backend' -and $details.ExecutablePath -ine (Join-Path $backendRoot '.venv\Scripts\python.exe')) { return $false }
    return $true
}

function Test-Http([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return ($response.StatusCode -eq 200)
    } catch { return $false }
}

function Wait-Http([string]$Url, $Process, [string]$ErrorLog) {
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        if (Test-Http $Url) { return }
        $Process.Refresh()
        if ($Process.HasExited) { throw "Server exited. Read $ErrorLog" }
        Start-Sleep -Milliseconds 400
    }
    throw "Server did not become ready at $Url. Read $ErrorLog"
}

function Assert-PortAvailable([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() } catch { throw "Port $Port is already in use by another process. Reuse that service or stop it before launching this project." }
    finally { $listener.Stop() }
}

$node = Assert-Command 'node.exe'
$nodeVersion = [version]((& $node -p 'process.versions.node') | Select-Object -Last 1)
if ($nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12 or newer is required. Node.js 24 is recommended.' }
$npm = Assert-Command 'npm.cmd'
$python = Join-Path $backendRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    if ($SkipInstall) { throw 'backend/.venv is missing. Run without -SkipInstall first.' }
    $pyLauncher = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        & $pyLauncher.Source -3.12 -m venv (Join-Path $backendRoot '.venv')
    } else {
        $systemPython = Assert-Command 'python.exe'
        $pythonVersion = [version]((& $systemPython -c 'import platform; print(platform.python_version())') | Select-Object -Last 1)
        if ($pythonVersion -lt [version]'3.12') { throw 'Python 3.12 or newer is required.' }
        & $systemPython -m venv (Join-Path $backendRoot '.venv')
    }
    if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }
}

if (-not $SkipInstall) {
    $requirements = Join-Path $backendRoot 'requirements.txt'
    $backendHash = Get-InputHash @($requirements)
    $backendStamp = Join-Path $runtimeRoot 'backend-dependencies.sha256'
    $backendInstalled = (Test-Path -LiteralPath $backendStamp) -and ((Get-Content -LiteralPath $backendStamp -Raw).Trim() -eq $backendHash)
    if (-not $backendInstalled) {
        Write-Host 'Installing backend dependencies into backend/.venv ...'
        & $python -m pip --isolated install --no-user -r $requirements
        if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed. Check network access and retry.' }
        Set-Content -LiteralPath $backendStamp -Value $backendHash -Encoding ASCII
    }
    $packagePath = Join-Path $frontendRoot 'package.json'
    $lockPath = Join-Path $frontendRoot 'package-lock.json'
    $frontendHash = Get-InputHash @($packagePath, $lockPath)
    $frontendStamp = Join-Path $runtimeRoot 'frontend-dependencies.sha256'
    $frontendInstalled = (Test-Path -LiteralPath $frontendStamp) -and ((Get-Content -LiteralPath $frontendStamp -Raw).Trim() -eq $frontendHash)
    if (-not $frontendInstalled -or -not (Test-Path -LiteralPath (Join-Path $frontendRoot 'node_modules\vite\bin\vite.js'))) {
        Write-Host 'Installing frontend dependencies ...'
        Push-Location $frontendRoot
        try {
            if (Test-Path -LiteralPath $lockPath) { & $npm ci --no-audit --no-fund }
            else { & $npm install --no-audit --no-fund }
            if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed. Check network access and retry.' }
        } finally { Pop-Location }
        Set-Content -LiteralPath $frontendStamp -Value (Get-InputHash @($packagePath, $lockPath)) -Encoding ASCII
    }
}

$records = @()
if (Test-Path -LiteralPath $manifestPath) {
    $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($previous.project_root -ne $projectRoot) { throw 'The runtime manifest belongs to another checkout.' }
    $records = @($previous.processes | Where-Object { Test-RecordedProcess $_ })
}
$services = @(
    @{ kind='backend'; executable=$python; arguments=@('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8011'); cwd=$backendRoot; port=8011; url='http://127.0.0.1:8011/api/health' },
    @{ kind='frontend'; executable=$node; arguments=@(('"' + (Join-Path $frontendRoot 'node_modules\vite\bin\vite.js') + '"'),'--host','127.0.0.1','--port','5180','--strictPort'); cwd=$frontendRoot; port=5180; url='http://127.0.0.1:5180/' }
)

foreach ($service in $services) {
    $existing = $records | Where-Object { $_.kind -eq $service.kind } | Select-Object -First 1
    if ($existing) {
        if (-not (Test-Http $service.url)) { throw "$($service.kind) is running but not healthy. Read .runtime logs and run scripts/stop.ps1 before retrying." }
        Write-Host "Reusing $($service.kind) PID $($existing.pid)."
        continue
    }
    Assert-PortAvailable $service.port
    $outLog = Join-Path $runtimeRoot "$($service.kind).out.log"
    $errLog = Join-Path $runtimeRoot "$($service.kind).err.log"
    $server = Start-Process -FilePath $service.executable -ArgumentList $service.arguments -WorkingDirectory $service.cwd -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $server.Refresh()
    $records += [pscustomobject]@{ kind=$service.kind; pid=$server.Id; executable=$service.executable; started_at=$server.StartTime.ToUniversalTime().ToString('o'); port=$service.port }
    [pscustomobject]@{ project_root=$projectRoot; status='starting'; processes=@($records) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Wait-Http $service.url $server $errLog
}

[pscustomobject]@{ project_root=$projectRoot; status='running'; updated_at=(Get-Date).ToUniversalTime().ToString('o'); processes=@($records); frontend_url='http://127.0.0.1:5180/'; api_url='http://127.0.0.1:8011/api/health' } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host ''
Write-Host 'GANGZHI TWIN is ready: http://127.0.0.1:5180/' -ForegroundColor Cyan
Write-Host 'API documentation: http://127.0.0.1:8011/docs'
Write-Host 'Logs and process records: .runtime/'
Write-Host 'Stop this checkout: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop.ps1'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5180/' }
