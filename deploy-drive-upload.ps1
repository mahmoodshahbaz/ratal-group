# Deploy drive-upload Edge Function via Supabase Management API (no Docker needed)
# Usage: .\deploy-drive-upload.ps1 -Token "your_supabase_access_token"

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$ProjectRef = "gjwqogvbfygmymtiqfnt"
$FunctionSlug = "drive-upload"
$SourceFile = "$PSScriptRoot\supabase\functions\drive-upload\index.ts"

Write-Host "Reading source file..." -ForegroundColor Cyan
$SourceCode = Get-Content -Path $SourceFile -Raw -Encoding UTF8

$Body = @{
    body        = $SourceCode
    name        = $FunctionSlug
    verify_jwt  = $false
} | ConvertTo-Json -Depth 5

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

$Url = "https://api.supabase.com/v1/projects/$ProjectRef/functions/$FunctionSlug"

Write-Host "Deploying to $Url ..." -ForegroundColor Cyan

try {
    $Response = Invoke-RestMethod -Uri $Url -Method PATCH -Headers $Headers -Body $Body -ErrorAction Stop
    Write-Host "✅ Deploy successful!" -ForegroundColor Green
    Write-Host ($Response | ConvertTo-Json)
} catch {
    Write-Host "❌ Deploy failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
}
