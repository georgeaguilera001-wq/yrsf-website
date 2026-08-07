$content = Get-Content -Raw -Path "admin/dashboard.html" -Encoding UTF8
$old = "document.getElementById('mobile-menu-modal').classList.add('hidden'); document.getElementById('mobile-menu-modal').classList.remove('flex');"
$new = "document.getElementById('mobile-menu-modal').style.display='none';"
$result = $content.Replace($old, $new)
$result | Set-Content -Path "admin/dashboard.html" -Encoding UTF8
$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
Write-Host "Replaced $count occurrences"
