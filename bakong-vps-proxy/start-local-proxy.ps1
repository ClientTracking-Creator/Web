$ErrorActionPreference = "Stop"

if (-not $env:BAKONG_TOKEN) {
  $env:BAKONG_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiYmU3ODdjMjFiMzE0NDUyNyJ9LCJpYXQiOjE3Nzc5MDI3MjYsImV4cCI6MTc4NTY3ODcyNn0.Q9JAfNOtBrcktn41QNb_Ve4mhf4eaYsdtCZRR6nBGVg"
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "8788" }
Write-Host "Starting Bakong proxy at http://localhost:$env:PORT/api/bakong/check"
node "$PSScriptRoot\server.js"
