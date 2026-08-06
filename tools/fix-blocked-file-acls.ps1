#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$homer = Split-Path -Parent $tools
$learn = Split-Path (Split-Path (Split-Path -Parent $homer) -Parent) -Parent
$log = Join-Path $env:TEMP 'fix-microgrid-acl.log'
$user = 'AzureAD\ShengkaiPan'
$sid = 'S-1-12-1-1787776380-1123636402-2548406153-3971158408'

$relFiles = @(
    'backend\app\routers\product_admin.py',
    'frontend\src\api\client.ts',
    'frontend\src\product-config-main.tsx',
    'start-product-config.cmd',
    'tools\product-admin-api.mjs'
)

"[$((Get-Date).ToString('s'))] Starting ACL fix" | Out-File $log -Encoding UTF8
"Homer=$homer" | Out-File $log -Append -Encoding UTF8
"Learn=$learn" | Out-File $log -Append -Encoding UTF8

foreach ($rel in $relFiles) {
    $full = Join-Path $homer $rel
    "Fixing $full" | Out-File $log -Append -Encoding UTF8
    if (-not (Test-Path -LiteralPath $full)) {
        "Missing: $full" | Out-File $log -Append -Encoding UTF8
        continue
    }
    takeown /F "$full" /A 2>&1 | Out-File $log -Append -Encoding UTF8
    icacls "$full" /inheritance:e 2>&1 | Out-File $log -Append -Encoding UTF8
    icacls "$full" /reset 2>&1 | Out-File $log -Append -Encoding UTF8
    icacls "$full" /grant "${user}:(F)" 2>&1 | Out-File $log -Append -Encoding UTF8
    icacls "$full" /grant "*${sid}:(F)" 2>&1 | Out-File $log -Append -Encoding UTF8
    Remove-Item -LiteralPath $full -Force -ErrorAction SilentlyContinue 2>&1 | Out-File $log -Append -Encoding UTF8
    if (Test-Path -LiteralPath $full) {
        "Still locked: $full" | Out-File $log -Append -Encoding UTF8
    } else {
        "Deleted: $full" | Out-File $log -Append -Encoding UTF8
    }
}

Set-Location $learn
$gitRelPrefix = (Resolve-Path -LiteralPath $homer).Path.Substring($learn.Length + 1).Replace('\', '/')
foreach ($rel in $relFiles) {
    $gitPath = "$gitRelPrefix/$($rel.Replace('\','/'))"
    git checkout HEAD -- "$gitPath" 2>&1 | Out-File $log -Append -Encoding UTF8
}

"Done" | Out-File $log -Append -Encoding UTF8
