# Story viewer server (Windows PowerShell 5.1 + HttpListener).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI.
#
# Usage:  powershell -ExecutionPolicy Bypass -File viewer\server.ps1 [-Port 8765] [-StoriesDir <path>] [-NoBrowser]
# Serves the static UI in .\public and a small read-only JSON API over <workspace>\stories\.

param(
    [int]$Port = 8765,
    [string]$StoriesDir = '',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# A shell started before git was installed may lack it on PATH.
$env:Path = $env:Path + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

$PublicDir = Join-Path $PSScriptRoot 'public'
if (-not $StoriesDir) { $StoriesDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'stories' }
$StoriesRoot = [System.IO.Path]::GetFullPath($StoriesDir).TrimEnd('\')
$Utf8 = New-Object System.Text.UTF8Encoding($false)

# ---------- response helpers ----------

function Send-Response($ctx, [int]$status, [string]$contentType, [byte[]]$bytes) {
    $res = $ctx.Response
    $res.StatusCode = $status
    $res.ContentType = $contentType
    $res.Headers['Cache-Control'] = 'no-store'
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Text($ctx, [int]$status, [string]$text, [string]$contentType = 'text/plain; charset=utf-8') {
    Send-Response $ctx $status $contentType ($Utf8.GetBytes($text))
}

function Send-Json($ctx, $obj, [int]$status = 200) {
    $json = ConvertTo-Json -InputObject $obj -Depth 8 -Compress
    Send-Text $ctx $status $json 'application/json; charset=utf-8'
}

# HttpListener's QueryString decodes with the system ANSI code page (CP932 on Japanese Windows),
# which garbles UTF-8 percent-encoding. Decode the raw query string as UTF-8 ourselves.
function Get-Query($req, [string]$name) {
    $q = $req.Url.Query
    if ([string]::IsNullOrEmpty($q)) { return $null }
    foreach ($pair in $q.TrimStart('?').Split('&')) {
        $kv = $pair.Split('=', 2)
        if ($kv.Length -eq 2 -and [System.Uri]::UnescapeDataString($kv[0].Replace('+', ' ')) -eq $name) {
            return [System.Uri]::UnescapeDataString($kv[1].Replace('+', ' '))
        }
    }
    return $null
}

# ---------- story helpers ----------

function Get-StoryDirs {
    if (-not (Test-Path -LiteralPath $StoriesRoot)) { return @() }
    return @(Get-ChildItem -LiteralPath $StoriesRoot -Directory | Where-Object { $_.Name -notlike '.*' } | Sort-Object Name)
}

function Get-StoryMdFiles([string]$dir) {
    $base = [System.IO.Path]::GetFullPath($dir).TrimEnd('\')
    $found = @(Get-ChildItem -LiteralPath $dir -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' })
    $list = @()
    foreach ($f in $found) {
        $list += [pscustomobject]@{
            path  = $f.FullName.Substring($base.Length + 1).Replace('\', '/')
            mtime = $f.LastWriteTimeUtc.ToString('o')
            size  = $f.Length
        }
    }
    return ,$list
}

# Returns the full path of a .md file inside a story directory, or $null if the request is not valid.
function Resolve-StoryFile([string]$story, [string]$rel) {
    try {
        if ([string]::IsNullOrWhiteSpace($story) -or [string]::IsNullOrWhiteSpace($rel)) { return $null }
        if ($story -match '[\\/]' -or $story -eq '.' -or $story -eq '..') { return $null }
        if ($rel -notmatch '\.md$') { return $null }
        if ($rel -match '(^|[\\/])\.\.?([\\/]|$)') { return $null }
        if ($rel -match '(^|[\\/])\.git([\\/]|$)') { return $null }
        $storyDir = [System.IO.Path]::GetFullPath((Join-Path $StoriesRoot $story))
        if (-not $storyDir.StartsWith($StoriesRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
        $full = [System.IO.Path]::GetFullPath((Join-Path $storyDir $rel))
        if (-not $full.StartsWith($storyDir + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return $null }
        return $full
    } catch {
        return $null
    }
}

function Get-StoryDirByName([string]$story) {
    try {
        if ([string]::IsNullOrWhiteSpace($story) -or $story -match '[\\/]' -or $story -eq '.' -or $story -eq '..') { return $null }
        $dir = [System.IO.Path]::GetFullPath((Join-Path $StoriesRoot $story))
        if (-not $dir.StartsWith($StoriesRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
        if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return $null }
        return $dir
    } catch {
        return $null
    }
}

function Get-GitLog([string]$dir) {
    $result = @()
    if (-not (Test-Path -LiteralPath (Join-Path $dir '.git'))) { return ,$result }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return ,$result }
    $lines = @()
    try {
        $lines = @(& git -C $dir log -n 100 '--pretty=format:%h%x1f%aI%x1f%s' 2>$null)
    } catch {
        return ,$result
    }
    foreach ($line in $lines) {
        $p = ([string]$line).Split([char]0x1f)
        if ($p.Length -ge 3) { $result += @{ hash = $p[0]; date = $p[1]; subject = $p[2] } }
    }
    return ,$result
}

function Get-Signature {
    $sb = New-Object System.Text.StringBuilder
    foreach ($d in Get-StoryDirs) {
        [void]$sb.Append($d.Name).Append(';')
        foreach ($f in (Get-StoryMdFiles $d.FullName)) {
            [void]$sb.Append($f.path).Append('|').Append($f.mtime).Append('|').Append($f.size).Append(';')
        }
    }
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $hash = $md5.ComputeHash($Utf8.GetBytes($sb.ToString()))
    return ([BitConverter]::ToString($hash)).Replace('-', '').ToLower()
}

# ---------- routing ----------

$StaticFiles = @{
    '/'           = @('index.html', 'text/html; charset=utf-8')
    '/index.html' = @('index.html', 'text/html; charset=utf-8')
    '/app.js'     = @('app.js', 'text/javascript; charset=utf-8')
    '/style.css'  = @('style.css', 'text/css; charset=utf-8')
}

function Handle-Request($ctx) {
    $req = $ctx.Request

    # Only answer requests addressed to localhost (guards against DNS rebinding).
    $hostHeader = [string]$req.Headers['Host']
    if ($hostHeader -notmatch '^(localhost|127\.0\.0\.1)(:\d+)?$') {
        Send-Text $ctx 403 'forbidden'
        return
    }
    if ($req.HttpMethod -ne 'GET') {
        Send-Text $ctx 405 'method not allowed'
        return
    }

    $path = $req.Url.AbsolutePath

    if ($StaticFiles.ContainsKey($path)) {
        $entry = $StaticFiles[$path]
        $file = Join-Path $PublicDir $entry[0]
        if (-not (Test-Path -LiteralPath $file)) { Send-Text $ctx 404 'not found'; return }
        Send-Response $ctx 200 $entry[1] ([System.IO.File]::ReadAllBytes($file))
        return
    }

    if ($path -eq '/api/stories') {
        $list = @()
        foreach ($d in Get-StoryDirs) {
            $list += @{ name = $d.Name; files = (Get-StoryMdFiles $d.FullName) }
        }
        Send-Json $ctx @{ root = $StoriesRoot; stories = $list }
        return
    }

    if ($path -eq '/api/version') {
        Send-Json $ctx @{ sig = (Get-Signature) }
        return
    }

    if ($path -eq '/api/file') {
        $full = Resolve-StoryFile (Get-Query $req 'story') (Get-Query $req 'path')
        if (-not $full) { Send-Text $ctx 404 'not found'; return }
        Send-Text $ctx 200 ([System.IO.File]::ReadAllText($full, $Utf8)) 'text/markdown; charset=utf-8'
        return
    }

    if ($path -eq '/api/git') {
        $dir = Get-StoryDirByName (Get-Query $req 'story')
        if (-not $dir) { Send-Text $ctx 404 'not found'; return }
        Send-Json $ctx @{ commits = (Get-GitLog $dir) }
        return
    }

    Send-Text $ctx 404 'not found'
}

# ---------- main ----------

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
} catch {
    Write-Host "Could not start the server on port $Port. Is another viewer already running? Try -Port <other number>."
    Write-Host $_.Exception.Message
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host "Story viewer is running at $url"
Write-Host "Watching: $StoriesRoot"
Write-Host "Press Ctrl+C to stop."
if (-not $NoBrowser) { Start-Process $url }

try {
    while ($listener.IsListening) {
        $task = $listener.GetContextAsync()
        # Wake up regularly so Ctrl+C is honoured.
        while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
        $ctx = $task.Result
        try {
            Handle-Request $ctx
        } catch {
            try { Send-Text $ctx 500 'internal error' } catch { }
        } finally {
            try { $ctx.Response.Close() } catch { }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
