# PowerShell script to generate HTTPS certificates for WebXR
# This uses OpenSSL if available, or provides instructions

$certDir = Join-Path $PSScriptRoot "..\certs"
$keyPath = Join-Path $certDir "localhost-key.pem"
$certPath = Join-Path $certDir "localhost.pem"

# Create certs directory if it doesn't exist
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

# Check if certificates already exist
if ((Test-Path $keyPath) -and (Test-Path $certPath)) {
    Write-Host "✅ HTTPS certificates already exist" -ForegroundColor Green
    Write-Host "   Key: $keyPath"
    Write-Host "   Cert: $certPath"
    exit 0
}

Write-Host "🔐 Setting up HTTPS certificates for local development..." -ForegroundColor Cyan
Write-Host "   This will enable WebXR support (AR/VR)`n"

# Try to find OpenSSL
$opensslPaths = @(
    "openssl",
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files (x86)\Git\usr\bin\openssl.exe",
    "C:\OpenSSL-Win64\bin\openssl.exe",
    "C:\OpenSSL-Win32\bin\openssl.exe",
    "$env:ProgramFiles\Git\usr\bin\openssl.exe",
    "${env:ProgramFiles(x86)}\Git\usr\bin\openssl.exe"
)

$opensslFound = $null
foreach ($path in $opensslPaths) {
    try {
        $result = & $path version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $opensslFound = $path
            break
        }
    } catch {
        # Continue to next path
    }
}

if ($opensslFound) {
    Write-Host "✅ Found OpenSSL at: $opensslFound" -ForegroundColor Green
    Write-Host "`nGenerating certificates...`n"
    
    $opensslCommand = "`"$opensslFound`" req -x509 -newkey rsa:2048 -keyout `"$keyPath`" -out `"$certPath`" -days 365 -nodes -subj `/C=US/ST=State/L=City/O=Organization/CN=localhost`" -addext `"subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:10.0.0.32`""
    
    Invoke-Expression $opensslCommand
    
    if ((Test-Path $keyPath) -and (Test-Path $certPath)) {
        Write-Host "`n✅ HTTPS certificates generated successfully!" -ForegroundColor Green
        Write-Host "   Key: $keyPath"
        Write-Host "   Cert: $certPath"
        Write-Host "`n📝 Note: You may need to accept the security warning in your browser"
        Write-Host "   For Chrome: Click 'Advanced' -> 'Proceed to localhost (unsafe)'"
        exit 0
    } else {
        Write-Host "`n❌ Failed to generate certificates" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n❌ OpenSSL not found" -ForegroundColor Red
    Write-Host "`n📋 Please install one of the following:`n" -ForegroundColor Yellow
    Write-Host "Option 1: mkcert (Recommended - creates trusted certificates)"
    Write-Host "   Windows: choco install mkcert"
    Write-Host "   Or download from: https://github.com/FiloSottile/mkcert/releases"
    Write-Host "`nOption 2: OpenSSL"
    Write-Host "   Windows: Install from https://slproweb.com/products/Win32OpenSSL.html"
    Write-Host "   Or install Git for Windows (includes OpenSSL)"
    Write-Host "`nAfter installing, run: npm run setup-https`n"
    exit 1
}
