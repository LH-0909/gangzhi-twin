[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifestPath = Join-Path $projectRoot '.runtime\servers.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { Write-Host 'No process manifest exists for this checkout.'; exit 0 }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.project_root -ne $projectRoot) { throw 'The runtime manifest belongs to another checkout. No process was stopped.' }

$allStopped = $true
foreach ($record in $manifest.processes) {
    $serverPid = [int]$record.pid
    $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if (-not $process) { Write-Host "$($record.kind) PID $serverPid is already stopped."; continue }
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
    $sameExecutable = $details -and ($details.ExecutablePath -ieq $record.executable)
    $sameCreation = [Math]::Abs(($process.StartTime.ToUniversalTime() - ([datetime]$record.started_at).ToUniversalTime()).TotalSeconds) -le 2
    $belongsToCheckout = $false
    if ($record.kind -eq 'backend') { $belongsToCheckout = $details.ExecutablePath -ieq (Join-Path $projectRoot 'backend\.venv\Scripts\python.exe') }
    if ($record.kind -eq 'frontend') { $belongsToCheckout = $details.CommandLine -like "*$(Join-Path $projectRoot 'web-portwise')*" }
    if (-not $sameExecutable -or -not $sameCreation -or -not $belongsToCheckout) {
        Write-Warning "PID $serverPid no longer matches this checkout. It was not stopped."
        $allStopped = $false
        continue
    }
    Stop-Process -Id $serverPid
    Write-Host "Stopped $($record.kind) PID $serverPid."
}
$manifest | Add-Member -MemberType NoteProperty -Name stopped_at -Value (Get-Date).ToUniversalTime().ToString('o') -Force
$manifest.status = if ($allStopped) { 'stopped' } else { 'partially_stopped' }
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host 'Simulation data and logs were retained.'
