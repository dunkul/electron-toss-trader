<#
.SYNOPSIS
  8888 포트를 사용 중인 프로세스를 찾아 종료합니다.
#>

$port = 8888

$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if (-not $connections) {
    Write-Host "포트 $port 를 사용 중인 프로세스가 없습니다."
    exit 0
}

$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $pids) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "포트 $port 사용 중: PID $processId ($($proc.ProcessName)) 를 종료합니다."
        Stop-Process -Id $processId -Force
    }
}

Write-Host "완료되었습니다."
