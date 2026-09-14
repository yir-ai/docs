$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-service.ps1')

function Assert-Equal($Actual, $Expected) {
    if ($Actual -ne $Expected) { throw "Expected '$Expected', got '$Actual'." }
}
function Assert-Throws([scriptblock]$Body, [string]$Pattern) {
    try { & $Body } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
        return
    }
    throw 'Expected operation to fail.'
}

function Get-Command {
    param($Name, $CommandType, $ErrorAction)
    @(
        [pscustomobject]@{ Source = 'C:\Program Files\nodejs\node.exe' },
        [pscustomobject]@{ Source = 'C:\nvm4w\nodejs\node.exe' }
    )
}
$startInfo = New-DocsStartInfo
Assert-Equal $startInfo.FileName 'C:\Program Files\nodejs\node.exe'
Assert-Equal $startInfo.WorkingDirectory $script:DocsRoot
Assert-Equal $startInfo.Arguments ('"' + $script:BlumePath + '" dev --port 40084 --host 0.0.0.0')
Remove-Item Function:\Get-Command

$script:Fixture = @{}
function Get-CimInstance {
    param($ClassName, $Filter, $ErrorAction)
    $key = [int]($Filter -replace '^ProcessId = ', '')
    return $script:Fixture[$key]
}
$script:Fixture[101] = [pscustomobject]@{
    ProcessId = 101; ParentProcessId = 100; Name = 'node.exe'
    CommandLine = 'node "' + $script:BlumePath + '" dev --port 40084 --host 0.0.0.0'
}
$script:Fixture[100] = [pscustomobject]@{
    ProcessId = 100; ParentProcessId = 1; Name = 'pwsh.exe'
    CommandLine = 'pwsh -NoProfile -File "' + $script:WatcherPath + '" -Action Watch'
}
Assert-Equal (Get-DocsWatcher 101) 100
$script:Fixture[100].CommandLine = 'pwsh -File "C:/another-repo/scripts/dev-service.ps1" -Action Watch'
Assert-Equal (Get-DocsWatcher 101) 0
$script:Fixture[100].CommandLine = 'pwsh -File "' + $script:WatcherPath + '" -Action Status'
Assert-Equal (Get-DocsWatcher 101) 0
$script:Fixture[100].CommandLine = 'pwsh -File "' + $script:WatcherPath + '" -Action Watch'
$script:Fixture[101].CommandLine = 'node "C:/another-repo/node_modules/blume/bin/blume.mjs" dev'
Assert-Equal (Get-DocsWatcher 101) 0
$script:Fixture[101].CommandLine = 'node "' + $script:BlumePath + '" dev --port 40084'

$script:Listeners = @()
$script:Stops = 0
function Get-DocsListeners { $script:Listeners }
function Get-Process { param($Id, $ErrorAction); [pscustomobject]@{ Id = $Id } }
function Stop-DocsTree {
    param($ProcessId)
    Assert-Equal $ProcessId 101
    $script:Stops++
    $script:Listeners = @(102)
}
Assert-Throws { Restart-Docs } 'no unique listener'
$script:Listeners = @(101, 102)
Assert-Throws { Restart-Docs } 'no unique listener'
$script:Listeners = @(999)
Assert-Throws { Restart-Docs } 'not owned'
Assert-Equal $script:Stops 0
$script:Listeners = @(101)
$DryRun = $true
Restart-Docs
Assert-Equal $script:Stops 0
$DryRun = $false
$script:Fixture[102] = [pscustomobject]@{
    ProcessId = 102; ParentProcessId = 100; Name = 'node.exe'
    CommandLine = 'node "' + $script:BlumePath + '" dev --port 40084'
}
Restart-Docs
Assert-Equal $script:Stops 1
Write-Host 'Docs service ownership, refusal, dry-run, and restart recovery tests passed.'
