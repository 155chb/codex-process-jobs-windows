# SPDX-License-Identifier: Apache-2.0
# Host observer only: retained process wait; never executes payload or reads output.
param([Parameter(Mandatory=$true)][string]$ToolUseId,
 [Parameter(Mandatory=$true)][string]$WrapperPath,
 [int]$ThresholdMs=30000,[int]$LaunchTimeoutMs=60000)
$ErrorActionPreference='Stop'
if($ToolUseId -notmatch '^exec-[0-9a-f-]{36}$' -or $ThresholdMs -lt 0 -or $ThresholdMs -gt 30000){throw 'Invalid threshold observer parameters'}
$deadline=[DateTime]::UtcNow.AddMilliseconds($LaunchTimeoutMs)
$observed=$null
while([DateTime]::UtcNow -lt $deadline){
 foreach($candidate in (Get-CimInstance Win32_Process -Filter "Name='node.exe'")){
  if($candidate.CommandLine -and $candidate.CommandLine.Contains($ToolUseId) -and $candidate.CommandLine.Replace('/','\').Contains($WrapperPath.Replace('/','\'))){
   if($candidate.CommandLine -notmatch 'job-[0-9a-f-]{36}'){continue}
   $taskId=$Matches[0]
   try{$observed=Get-Process -Id $candidate.ProcessId;$handle=$observed.Handle;$started=$observed.StartTime;break}catch{$observed=$null}
  }
 }
 if($observed){break}
 Start-Sleep -Milliseconds 100
}
if(-not $observed){'{"state":"not-observed"}';exit 0}
try{
 $remaining=[Math]::Max(1,[int]([Math]::Ceiling($ThresholdMs-([DateTime]::Now-$started).TotalMilliseconds))+1)
 if($observed.WaitForExit($remaining)){'{"state":"completed"}';exit 0}
 @{state='long-running';id=$taskId;pid=$observed.Id} | ConvertTo-Json -Compress
}finally{$observed.Dispose()}
