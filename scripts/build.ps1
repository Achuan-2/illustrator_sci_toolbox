[CmdletBinding()]
param(
    [switch]$NoRelease,
    [switch]$NoCommit,
    [switch]$NoPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-CheckedCommand {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$Operation
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed (exit code $LASTEXITCODE)."
    }
}

function Get-ReleaseNotes {
    param([string]$Path, [string]$Version)

    $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
    $versionHeading = '^#{1,6}\s+v?' + [regex]::Escape($Version) + '(?=\s|$)'
    $nextVersionHeading = '^#{1,6}\s+v?\d+\.\d+\.\d+(?=\s|$)'
    $start = -1
    $end = $lines.Count
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($start -lt 0) {
            if ($lines[$i] -match $versionHeading) { $start = $i + 1 }
        } elseif ($lines[$i] -match $nextVersionHeading) {
            $end = $i
            break
        }
    }

    if ($start -lt 0) { throw "CHANGELOG.md has no section for v$Version." }
    $notes = ($lines | Select-Object -Skip $start -First ($end - $start)) -join "`r`n"
    if ([string]::IsNullOrWhiteSpace($notes)) {
        throw "CHANGELOG.md has empty release notes for v$Version."
    }
    return $notes.Trim()
}

function Save-WorkspaceCommit {
    param([string]$ProjectDir, [string]$Tag)

    # Never stage files from a parent repository if this project is only a subdirectory.
    $gitRoot = Invoke-CheckedCommand -Command 'git' -Arguments @('rev-parse', '--show-toplevel') -Operation 'Locating Git repository'
    $resolvedRoot = [IO.Path]::GetFullPath($gitRoot).TrimEnd('\', '/')
    $resolvedProject = [IO.Path]::GetFullPath($ProjectDir).TrimEnd('\', '/')
    if (-not $resolvedRoot.Equals($resolvedProject, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Automatic commit requires the project directory to be the Git repository root.'
    }

    $changes = @(Invoke-CheckedCommand -Command 'git' -Arguments @(
        'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'
    ) -Operation 'Checking workspace changes')
    if ($changes.Count -eq 0) {
        Write-Host '[GIT] Workspace is clean; automatic commit skipped.'
        return
    }

    $conflicts = @(Invoke-CheckedCommand -Command 'git' -Arguments @(
        'diff', '--name-only', '--diff-filter=U'
    ) -Operation 'Checking merge conflicts')
    if ($conflicts.Count -gt 0) { throw 'Resolve merge conflicts before building; no automatic commit was made.' }

    # Include additions, modifications, deletions, and already staged files; honor .gitignore.
    Invoke-CheckedCommand -Command 'git' -Arguments @('add', '--all', '--', '.') -Operation 'Staging workspace changes'
    $stagedFiles = @(Invoke-CheckedCommand -Command 'git' -Arguments @(
        'diff', '--cached', '--name-only'
    ) -Operation 'Checking staged changes')
    if ($stagedFiles.Count -eq 0) {
        throw 'Workspace changes could not be staged. Check for uncommitted changes inside submodules.'
    }

    # Gitmoji U+1F516 means release/version tags; keep the script ASCII for Windows PowerShell 5.1.
    $releaseEmoji = [char]::ConvertFromUtf32(0x1F516)
    $message = $releaseEmoji + ' ' + $Tag + ' / ' + (Get-Date -Format 'yyyyMMdd')
    Write-Host "[GIT] Committing workspace changes: $message"
    Invoke-CheckedCommand -Command 'git' -Arguments @('commit', '-m', $message) -Operation 'Automatic workspace commit'
    $remainingChanges = @(Invoke-CheckedCommand -Command 'git' -Arguments @(
        'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'
    ) -Operation 'Checking workspace after commit')
    if ($remainingChanges.Count -gt 0) {
        throw 'Workspace still has uncommitted changes after commit. Check submodules or changes made by Git hooks.'
    }
}

$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildDir = Join-Path $projectDir 'build'
$tempRoot = Join-Path $projectDir 'dist_temp'
$workDir = Join-Path $tempRoot ('build-' + [guid]::NewGuid().ToString('N'))
$distDir = Join-Path $workDir 'package'
$certFile = Join-Path $projectDir 'cert.p12'
$certPass = 'achuan-2.com'
$exitCode = 0
$locationPushed = $false

try {
    Push-Location -LiteralPath $projectDir
    $locationPushed = $true
    Write-Host 'Adobe Illustrator Plugin Packaging and Release'

    [xml]$manifest = Get-Content -LiteralPath (Join-Path $projectDir 'CSXS\manifest.xml') -Raw -Encoding UTF8
    $version = [string]$manifest.ExtensionManifest.ExtensionBundleVersion
    if ($version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Invalid ExtensionBundleVersion: '$version'. Expected a numeric x.y.z version."
    }
    $tag = "v$version"
    $outputZxp = Join-Path $buildDir "illustrator_sci_plugin_$tag.zxp"
    $outputZip = Join-Path $buildDir "illustrator_sci_plugin_$tag.zip"
    $notesFile = Join-Path $buildDir "release-notes-$tag.md"
    Write-Host "Detected Plugin Version: $tag"

    $zxpCommand = $null
    foreach ($candidate in @(
        (Join-Path $projectDir 'ZXPSignCmd.exe'),
        (Join-Path $projectDir '..\ZXPSignCmd.exe')
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $zxpCommand = $candidate
            break
        }
    }
    if (-not $zxpCommand) {
        $signTool = Get-Command ZXPSignCmd.exe -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($signTool) { $zxpCommand = $signTool.Source }
    }
    if (-not $zxpCommand) { throw 'ZXPSignCmd.exe not found in the project, parent directory, or PATH.' }

    $runtimeFolders = @('CSXS', 'client', 'host', 'icons', 'jsx')
    foreach ($folder in $runtimeFolders) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectDir $folder) -PathType Container)) {
            throw "Missing runtime folder: $folder"
        }
    }

    # Resolve origin explicitly so GH_REPO or a gh default repository cannot redirect publication.
    if (-not $NoRelease) {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            throw 'GitHub CLI (gh) not found. Install it and run gh auth login, or use -NoRelease.'
        }
        $notes = Get-ReleaseNotes -Path (Join-Path $projectDir 'CHANGELOG.md') -Version $version
        $origin = Invoke-CheckedCommand -Command 'git' -Arguments @('remote', 'get-url', 'origin') -Operation 'Reading origin remote'
        $repoJson = Invoke-CheckedCommand -Command 'gh' -Arguments @('repo', 'view', $origin, '--json', 'nameWithOwner,url') -Operation 'Resolving GitHub repository'
        $repoInfo = ($repoJson -join "`n") | ConvertFrom-Json
        $githubHost = ([uri]$repoInfo.url).Host
        $repo = "$githubHost/$($repoInfo.nameWithOwner)"
        Invoke-CheckedCommand -Command 'gh' -Arguments @('auth', 'status', '--hostname', $githubHost) -Operation 'GitHub authentication check'
    }

    if (-not $NoCommit) {
        Save-WorkspaceCommit -ProjectDir $projectDir -Tag $tag
    } else {
        Write-Host '[GIT] Automatic commit skipped (-NoCommit).'
    }

    Write-Host '[1/6] Preparing build directories...'
    New-Item -ItemType Directory -Path $buildDir, $distDir -Force | Out-Null
    # Remove only this version's outputs; retain older packages.
    foreach ($artifact in @($outputZxp, $outputZip)) {
        if (Test-Path -LiteralPath $artifact) { Remove-Item -LiteralPath $artifact -Force }
    }
    if (-not $NoRelease) {
        [IO.File]::WriteAllText($notesFile, $notes + "`r`n", [Text.UTF8Encoding]::new($false))
        Write-Host "Release notes: $notesFile"
    }

    Write-Host '[2/6] Copying clean runtime files...'
    foreach ($folder in $runtimeFolders) {
        Copy-Item -LiteralPath (Join-Path $projectDir $folder) -Destination $distDir -Recurse -Force
    }

    Write-Host '[3/6] Checking self-signed certificate...'
    if (-not (Test-Path -LiteralPath $certFile -PathType Leaf)) {
        Invoke-CheckedCommand -Command $zxpCommand -Arguments @(
            '-selfSignedCert', 'CN', 'Changsha', 'achuan-2.com', 'achuan-2', $certPass, $certFile, '-validityDays', '3650'
        ) -Operation 'Certificate creation'
    }

    Write-Host '[4/6] Packaging and signing ZXP...'
    $signArguments = @('-sign', $distDir, $outputZxp, $certFile, $certPass)
    $signed = $false
    foreach ($timestampServer in @('http://timestamp.digicert.com', 'http://timestamp.adobe.com', $null)) {
        $arguments = $signArguments
        if ($timestampServer) { $arguments += @('-tsa', $timestampServer) }
        & $zxpCommand @arguments
        if ($LASTEXITCODE -eq 0) {
            $signed = $true
            break
        }
        Write-Host '[INFO] Signing failed; trying the next timestamp option...'
        if (Test-Path -LiteralPath $outputZxp) { Remove-Item -LiteralPath $outputZxp -Force }
    }
    if (-not $signed) { throw 'ZXP signing failed, including the fallback without a timestamp server.' }
    if (-not (Test-Path -LiteralPath $outputZxp -PathType Leaf)) { throw 'Signing produced no ZXP file.' }

    Write-Host '[5/6] Verifying ZXP signature and creating ZIP copy...'
    Invoke-CheckedCommand -Command $zxpCommand -Arguments @('-verify', $outputZxp) -Operation 'ZXP signature verification'
    # A signed ZXP is a ZIP archive; preserve its signed contents byte-for-byte.
    Copy-Item -LiteralPath $outputZxp -Destination $outputZip -Force
    Write-Host "[ZXP] Output: $outputZxp"
    Write-Host "[ZIP] Output: $outputZip"

    if (-not $NoRelease) {
        Write-Host "[6/6] Publishing GitHub Release $tag to $repo..."
        # A failed lookup must stop the build, rather than masquerading as a missing release.
        $releaseTags = @(Invoke-CheckedCommand -Command 'gh' -Arguments @(
            'api', "repos/$($repoInfo.nameWithOwner)/releases?per_page=100", '--hostname', $githubHost, '--paginate', '--jq', '.[].tag_name'
        ) -Operation 'Listing GitHub releases')
        if ($releaseTags -contains $tag) {
            Invoke-CheckedCommand -Command 'gh' -Arguments @(
                'release', 'upload', $tag, $outputZxp, $outputZip, '--clobber', '--repo', $repo
            ) -Operation 'Release asset upload'
            Invoke-CheckedCommand -Command 'gh' -Arguments @(
                'release', 'edit', $tag, '--title', $tag, '--notes-file', $notesFile, '--draft=false', '--repo', $repo
            ) -Operation 'Release update'
        } else {
            # gh creates a missing tag on the remote default branch; no automatic push is performed.
            Invoke-CheckedCommand -Command 'gh' -Arguments @(
                'release', 'create', $tag, $outputZxp, $outputZip, '--title', $tag, '--notes-file', $notesFile, '--repo', $repo
            ) -Operation 'Release creation'
        }
        Invoke-CheckedCommand -Command 'gh' -Arguments @(
            'release', 'view', $tag, '--repo', $repo, '--json', 'url', '--jq', '.url'
        ) -Operation 'Reading published release URL'
    } else {
        Write-Host '[6/6] GitHub Release skipped (-NoRelease).'
    }
    Write-Host '[SUCCESS] Build completed.'
} catch {
    $exitCode = 1
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
} finally {
    try {
        # Verify the resolved deletion target stays inside the project's temporary directory.
        $resolvedWorkDir = [IO.Path]::GetFullPath($workDir)
        $allowedPrefix = [IO.Path]::GetFullPath($tempRoot).TrimEnd('\') + '\'
        if (-not $resolvedWorkDir.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean a path outside dist_temp: $resolvedWorkDir"
        }
        if (Test-Path -LiteralPath $resolvedWorkDir) {
            Remove-Item -LiteralPath $resolvedWorkDir -Recurse -Force
        }
    } catch {
        $exitCode = 1
        Write-Host "[ERROR] Temporary directory cleanup failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    if ($locationPushed) { Pop-Location }
    if (-not $NoPause) { Read-Host 'Press Enter to exit' | Out-Null }
}

exit $exitCode
