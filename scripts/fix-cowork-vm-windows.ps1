# fix-cowork-vm-windows.ps1
# ============================================================================
# Fix Claude Cowork VM "Access is denied" / "VM service not running" on Windows
# ============================================================================
#
# ROOT CAUSE:
#   Claude Cowork runs a lightweight Hyper-V VM via the Host Compute Service (HCS).
#   The VM's virtual disk files (.vhdx) are stored inside a UWP package folder:
#     C:\Users\<User>\AppData\Local\Packages\Claude_<id>\LocalCache\Roaming\Claude\vm_bundles\
#
#   UWP package folders have restrictive default ACLs that don't include the
#   "NT VIRTUAL MACHINE\Virtual Machines" security principal. The CoworkVMService
#   normally auto-grants these permissions using icacls, but this fails silently
#   due to a bug ("cannot run executable found relative to current directory").
#
#   Even if you grant permissions on the .vhdx files themselves, the VM also needs
#   TRAVERSAL access (Read+Execute) on every parent directory in the path.
#   Without this, Hyper-V returns: HRESULT 0x80070005 "Access is denied" when
#   trying to open the virtual disk attachments.
#
# SYMPTOMS:
#   - "Failed to start Claude's workspace - VM service not running"
#   - "HCS operation failed: HcsWaitForOperationResult failed with HRESULT 0x80070005"
#   - "Account does not have permission to open attachment '...\rootfs.vhdx'"
#   - Claude Desktop hangs (MoAppHang) when starting Cowork
#
# PREREQUISITES:
#   - Windows 10/11 Pro, Enterprise, or Education
#   - Hyper-V, Virtual Machine Platform, and Hypervisor Platform enabled
#   - Run this script as Administrator
#
# USAGE:
#   1. Open PowerShell as Administrator
#   2. Run: .\fix-cowork-vm-windows.ps1
#   3. Open Claude Desktop and try "claude cowork" again
#
# ============================================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

Write-Host "`n=== Claude Cowork VM Fix Script ===" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Verify Hyper-V prerequisites ---
Write-Host "[1/6] Checking Hyper-V prerequisites..." -ForegroundColor Yellow

$features = @("Microsoft-Hyper-V", "VirtualMachinePlatform", "HypervisorPlatform")
$missingFeatures = @()

foreach ($feature in $features) {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $feature -ErrorAction SilentlyContinue)
    if ($null -eq $state -or $state.State -ne "Enabled") {
        $missingFeatures += $feature
    }
}

if ($missingFeatures.Count -gt 0) {
    Write-Host "  WARNING: The following features are not enabled:" -ForegroundColor Red
    $missingFeatures | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    Write-Host "  Enable them with:" -ForegroundColor Yellow
    $missingFeatures | ForEach-Object {
        Write-Host "    Enable-WindowsOptionalFeature -Online -FeatureName $_" -ForegroundColor White
    }
    Write-Host "  A reboot will be required after enabling. Continuing with ACL fixes..." -ForegroundColor Yellow
} else {
    Write-Host "  OK - All Hyper-V features enabled." -ForegroundColor Green
}

# --- Step 2: Ensure current user is in Hyper-V Administrators ---
Write-Host "`n[2/6] Checking Hyper-V Administrators group membership..." -ForegroundColor Yellow

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$isInGroup = $currentUser.Groups | Where-Object {
    $_.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq "S-1-5-32-578"
}

if (-not $isInGroup) {
    $username = $env:USERNAME
    Write-Host "  Adding $username to Hyper-V Administrators..." -ForegroundColor White
    net localgroup "Hyper-V Administrators" $username /add 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK - Added. NOTE: You must sign out and back in (or reboot) for this to take effect." -ForegroundColor Green
        $needsReboot = $true
    } else {
        Write-Host "  WARNING: Failed to add user to group. You may need to do this manually." -ForegroundColor Red
    }
} else {
    Write-Host "  OK - Already a member." -ForegroundColor Green
}

# --- Step 3: Find the Claude UWP package path ---
Write-Host "`n[3/6] Locating Claude VM bundle..." -ForegroundColor Yellow

$packagesBase = "$env:LOCALAPPDATA\Packages"
$claudePackage = Get-ChildItem -Path $packagesBase -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $claudePackage) {
    Write-Host "  ERROR: Claude package folder not found in $packagesBase" -ForegroundColor Red
    Write-Host "  Make sure Claude Desktop is installed." -ForegroundColor Red
    exit 1
}

$bundlePath = Join-Path $claudePackage.FullName "LocalCache\Roaming\Claude\vm_bundles\claudevm.bundle"

if (-not (Test-Path $bundlePath)) {
    Write-Host "  ERROR: VM bundle not found at $bundlePath" -ForegroundColor Red
    Write-Host "  Open Claude Desktop first so it downloads the VM bundle, then re-run this script." -ForegroundColor Red
    exit 1
}

Write-Host "  OK - Found: $bundlePath" -ForegroundColor Green

# --- Step 4: Grant traversal (RX) on all parent directories ---
Write-Host "`n[4/6] Granting VM traversal access on parent directories..." -ForegroundColor Yellow

$principal = "NT VIRTUAL MACHINE\Virtual Machines"

# Build list of parent directories from the package root down to vm_bundles
$parentDirs = @(
    $claudePackage.FullName,
    (Join-Path $claudePackage.FullName "LocalCache"),
    (Join-Path $claudePackage.FullName "LocalCache\Roaming"),
    (Join-Path $claudePackage.FullName "LocalCache\Roaming\Claude"),
    (Join-Path $claudePackage.FullName "LocalCache\Roaming\Claude\vm_bundles")
)

foreach ($dir in $parentDirs) {
    if (Test-Path $dir) {
        $result = icacls $dir /grant "${principal}:(RX)" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  OK - $(Split-Path $dir -Leaf)" -ForegroundColor Green
        } else {
            Write-Host "  FAILED - $dir : $result" -ForegroundColor Red
        }
    }
}

# --- Step 5: Grant full access on the bundle folder and contents ---
Write-Host "`n[5/6] Granting VM full access on bundle folder and files..." -ForegroundColor Yellow

$result = icacls $bundlePath /grant "${principal}:(OI)(CI)(F)" /T 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - Full access granted recursively on claudevm.bundle" -ForegroundColor Green
} else {
    Write-Host "  FAILED - $result" -ForegroundColor Red
}

# --- Step 6: Restart CoworkVMService ---
Write-Host "`n[6/6] Restarting CoworkVMService..." -ForegroundColor Yellow

$svc = Get-Service -Name "CoworkVMService" -ErrorAction SilentlyContinue
if ($null -eq $svc) {
    Write-Host "  WARNING: CoworkVMService not found. Open Claude Desktop first, then retry." -ForegroundColor Red
} else {
    # Kill Claude processes first for a clean restart
    Get-Process -Name "claude*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    Stop-Service CoworkVMService -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-Service CoworkVMService
    Start-Sleep -Seconds 3

    $svc = Get-Service -Name "CoworkVMService"
    if ($svc.Status -eq "Running") {
        Write-Host "  OK - CoworkVMService is running." -ForegroundColor Green
    } else {
        Write-Host "  WARNING - CoworkVMService status: $($svc.Status)" -ForegroundColor Red
    }
}

# --- Summary ---
Write-Host "`n=== Done ===" -ForegroundColor Cyan

if ($needsReboot) {
    Write-Host "`nIMPORTANT: You were added to Hyper-V Administrators." -ForegroundColor Yellow
    Write-Host "You MUST sign out and back in (or reboot) before Cowork will work." -ForegroundColor Yellow
}

Write-Host "`nNext steps:" -ForegroundColor White
Write-Host "  1. Open Claude Desktop" -ForegroundColor White
Write-Host "  2. Run 'claude cowork'" -ForegroundColor White
Write-Host ""
Write-Host "If the issue persists, check the service log at:" -ForegroundColor White
Write-Host "  C:\ProgramData\Claude\Logs\cowork-service.log" -ForegroundColor White
Write-Host ""
