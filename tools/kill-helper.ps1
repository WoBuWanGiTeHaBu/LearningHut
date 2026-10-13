$Log = "E:\AIProject\LearningHut\stale-check.txt"
$ErrorActionPreference = "SilentlyContinue"
$names = @("Study Helper", "electron")
$found = @()
foreach ($n in $names) {
  $p = Get-Process -Name $n -ErrorAction SilentlyContinue
  if ($p) { $found += $p }
}
$out = New-Object System.Collections.Generic.List[string]
if ($found.Count -eq 0) {
  $out.Add("NONE")
} else {
  foreach ($p in $found) {
    $out.Add("PID=$($p.Id) NAME=$($p.ProcessName) PATH=$($p.Path)")
  }
  $found | Stop-Process -Force -ErrorAction SilentlyContinue
  $out.Add("KILLED")
}
Start-Sleep -Milliseconds 1000
$remain = @()
foreach ($n in $names) {
  $r = Get-Process -Name $n -ErrorAction SilentlyContinue
  if ($r) { $remain += $r }
}
$out.Add("REMAIN=" + $remain.Count)
$out | Set-Content -Encoding utf8 -LiteralPath $Log
