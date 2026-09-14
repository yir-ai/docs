param(
    [ValidateSet('Watch', 'Status', 'Restart')]
    [string]$Action = 'Status',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:DocsRoot = Split-Path -Parent $PSScriptRoot
$script:WatcherPath = [IO.Path]::GetFullPath($PSCommandPath).Replace('\', '/')
$script:BlumePath = (Join-Path $script:DocsRoot 'node_modules/blume/bin/blume.mjs').Replace('\', '/')
$script:DocsPort = 40084

function Get-DocsListeners {
    @(Get-NetTCPConnection -LocalPort $script:DocsPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-DocsWatcher {
    param([int]$ProcessId)
    $entry = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $entry) { return 0 }
    $command = ([string]$entry.CommandLine).Replace('\', '/')
    $blumePattern = '(?:^|[\s"])' + [regex]::Escape($script:BlumePath) + '"?\s+dev(?:\s|$)'
    if ($entry.Name -ne 'node.exe' -or $command -notmatch $blumePattern) { return 0 }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.ParentProcessId)" -ErrorAction SilentlyContinue
    if ($null -eq $parent) { return 0 }
    $parentCommand = ([string]$parent.CommandLine).Replace('\', '/')
    if ($parentCommand -notmatch '(?i)-File\s+(?:"([^"]+)"|(\S+))') { return 0 }
    $parentScript = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
    try { $parentScript = [IO.Path]::GetFullPath($parentScript).Replace('\', '/') } catch { return 0 }
    if ($parent.Name -in @('pwsh.exe', 'powershell.exe') -and
        $parentScript -eq $script:WatcherPath -and
        $parentCommand -match '(?i)-Action\s+"?Watch"?(?:\s|$)') {
        return [int]$parent.ProcessId
    }
    return 0
}

function Stop-DocsTree {
    param([int]$ProcessId)
    foreach ($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)) {
        Stop-DocsTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Restart-Docs {
    $listeners = @(Get-DocsListeners)
    if ($listeners.Count -ne 1) { throw 'Docs has no unique listener. Start Dev: Docs (Blume) in VS Code first.' }
    $oldPid = [int]$listeners[0]
    $watcher = Get-DocsWatcher -ProcessId $oldPid
    if ($watcher -eq 0) { throw 'Port 40084 is not owned by this Docs Watch task; nothing was stopped.' }
    if ($DryRun) {
        Write-Host "[docs-dev] Would restart Docs PID=$oldPid under watcher PID=$watcher."
        return
    }
    # Recheck ownership immediately before stopping the managed process tree.
    if ((Get-DocsWatcher -ProcessId $oldPid) -ne $watcher) { throw 'Docs ownership changed; nothing was stopped.' }
    Stop-DocsTree -ProcessId $oldPid
    $deadline = (Get-Date).AddSeconds(60)
    do {
        if (-not (Get-Process -Id $watcher -ErrorAction SilentlyContinue)) { throw 'Docs watcher exited during restart.' }
        foreach ($newPid in @(Get-DocsListeners)) {
            if ($newPid -ne $oldPid -and (Get-DocsWatcher -ProcessId $newPid) -eq $watcher) {
                Write-Host "[docs-dev] Restarted: PID=$newPid, watcher PID=$watcher, port=$script:DocsPort."
                return
            }
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw 'Docs did not recover within 60 seconds. Check the original VS Code terminal.'
}

function New-DocsStartInfo {
    $nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodeCommand.Source
    $startInfo.Arguments = '"' + $script:BlumePath + '" dev --port 40084 --host 0.0.0.0'
    $startInfo.WorkingDirectory = $script:DocsRoot
    $startInfo.UseShellExecute = $false
    $startInfo.EnvironmentVariables.Remove('VSCODE_INSPECTOR_OPTIONS')
    if ($startInfo.EnvironmentVariables['NODE_OPTIONS'] -like '*ms-vscode.js-debug*') {
        $startInfo.EnvironmentVariables.Remove('NODE_OPTIONS')
    }
    return $startInfo
}

function Watch-Docs {
    if ($DryRun) { throw 'DryRun is supported only for Restart.' }
    if (-not (Test-Path -LiteralPath $script:BlumePath)) { throw 'Run pnpm install --frozen-lockfile first.' }
    $child = $null
    try {
        while ($true) {
            if (@(Get-DocsListeners).Count -gt 0) { throw 'Port 40084 is already occupied; refusing to start another Docs service.' }
            $startInfo = New-DocsStartInfo
            # Inherit the task console directly; no extra window, log wrapper, or detached server.
            $child = [Diagnostics.Process]::Start($startInfo)
            Write-Host "[docs-dev] Started PID=$($child.Id). Stop this VS Code task to stop Docs."
            while (-not $child.HasExited) { Start-Sleep -Milliseconds 500 }
            Write-Host "[docs-dev] Exited ($($child.ExitCode)); restarting in 2 seconds."
            Start-Sleep -Seconds 2
        }
    }
    finally {
        if ($null -ne $child -and -not $child.HasExited) { Stop-DocsTree -ProcessId $child.Id }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    if ($env:OS -ne 'Windows_NT') { throw 'This VS Code service manager requires Windows. Use pnpm exec blume dev on other platforms.' }
    switch ($Action) {
        'Watch' { Watch-Docs }
        'Restart' { Restart-Docs }
        'Status' {
            $listeners = @(Get-DocsListeners)
            if ($listeners.Count -eq 0) { Write-Host '[docs-dev] Not running.' }
            foreach ($listener in $listeners) {
                $watcher = Get-DocsWatcher -ProcessId $listener
                Write-Host "[docs-dev] PID=$listener, watcher=$watcher, port=$script:DocsPort (watcher=0 means unmanaged)."
            }
        }
    }
}
