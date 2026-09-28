# SPDX-License-Identifier: Apache-2.0
# Host observer only. Never starts the payload, reads its stdout or writes files.
param(
  [Parameter(Mandatory=$true)][string]$JobId,
  [Parameter(Mandatory=$true)][string]$Owner,
  [Parameter(Mandatory=$true)][string]$WrapperPath,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [int]$ThresholdMs=30000,
  [int]$LaunchTimeoutMs=120000,
  [int]$CompletionTimeoutMs=3600000
)
$ErrorActionPreference='Stop'
if($JobId -notmatch '^job-[0-9a-f-]{36}$' -or $Owner -notmatch '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' -or $ThresholdMs -lt 0 -or $ThresholdMs -gt 30000){throw 'Invalid observer parameters'}
$deadline=[DateTime]::UtcNow.AddMilliseconds($LaunchTimeoutMs)
$observed=$null
while([DateTime]::UtcNow -lt $deadline){
  $candidates=Get-CimInstance Win32_Process -Filter "Name='node.exe'"
  foreach($candidate in $candidates){
    if($candidate.CommandLine -and $candidate.CommandLine.Contains($JobId) -and $candidate.CommandLine.Replace('/','\').Contains($WrapperPath.Replace('/','\'))){
      try {
        $observed=Get-Process -Id $candidate.ProcessId
        # Force and retain a handle before exit; never reopen a recycled PID.
        $handle=$observed.Handle
        $started=$observed.StartTime
        break
      }catch{$observed=$null}
    }
  }
  if($observed){break}
  Start-Sleep -Milliseconds 100
}
if(-not $observed){Write-Output 'CPJW_OBSERVER_LAUNCH_NOT_OBSERVED';exit 2}
Write-Output ('CPJW_OBSERVER_ATTACHED '+$observed.Id)
try {
  if(-not $observed.WaitForExit($CompletionTimeoutMs)){Write-Output 'CPJW_OBSERVER_COMPLETION_TIMEOUT';exit 2}
  $code=$observed.ExitCode
  $duration=($observed.ExitTime-$started).TotalMilliseconds
  Write-Output ('CPJW_OBSERVER_EXIT '+$code)
  if($duration -le $ThresholdMs){Write-Output 'CPJW_OBSERVER_SHORT';exit 0}
  if($env:CODEX_PROCESS_JOBS_DISABLE_CODEX_QUEUE -eq '1'){Write-Output 'CPJW_OBSERVER_NOTIFICATION_DISABLED';exit 0}
  & $NodePath (Join-Path $PSScriptRoot 'process-notify.mjs') $JobId $Owner ([string]$code)
  exit $LASTEXITCODE
} finally {$observed.Dispose()}
