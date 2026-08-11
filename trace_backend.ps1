$content = Get-Content -Path "C:\Users\Aguilera\.gemini\antigravity\scratch\yrsf\js\config\supabase.js" -Raw
$url = [regex]::Match($content, "SUPABASE_URL\s*=\s*'([^']+)'").Groups[1].Value
$key = [regex]::Match($content, "SUPABASE_ANON_KEY\s*=\s*'([^']+)'").Groups[1].Value

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}

# 1. Fetch a boat
$boatsUrl = "$url/rest/v1/boats?select=id&limit=1"
$boat = (Invoke-RestMethod -Uri $boatsUrl -Headers $headers)[0]
$boatId = $boat.id
Write-Output "Using Boat ID: $boatId"

# 2. Fetch prices (TRACE 5 - RAW BOAT FROM DATABASE)
$pricesUrl = "$url/rest/v1/boat_prices?boat_id=eq.$boatId&select=*"
$rawPrices = Invoke-RestMethod -Uri $pricesUrl -Headers $headers
Write-Output "TRACE 5 - RAW BOAT FROM DATABASE:"
$rawPrices | ConvertTo-Json -Depth 2

# 3. Modify payload (TRACE 3 - FINAL SAVE PAYLOAD)
if ($rawPrices.Length -eq 0) {
    Write-Output "No prices found. Adding a test price."
    $rawPrices = @(
        @{
            boat_id = $boatId
            duration_hours = 4
            duration_label = "4 Hours"
            price = 98765
            is_popular = $false
            sort_order = 0
        }
    )
} else {
    $rawPrices[0].price = 98765
}

Write-Output "TRACE 3 - FINAL SAVE PAYLOAD:"
$rawPrices | ConvertTo-Json -Depth 2

# 4. Save to Database (Simulate updateBoatPrices)
Write-Output "Deleting old prices..."
Invoke-RestMethod -Uri $pricesUrl -Headers $headers -Method Delete -ErrorAction Stop | Out-Null

Write-Output "Inserting new prices..."
$insertResponse = Invoke-RestMethod -Uri "$url/rest/v1/boat_prices" -Headers $headers -Method Post -Body ($rawPrices | ConvertTo-Json -Depth 2) -ErrorAction Stop

# 5. Read Back (TRACE 4 - DATABASE AFTER SAVE)
$readBackPrices = Invoke-RestMethod -Uri $pricesUrl -Headers $headers
Write-Output "TRACE 4 - DATABASE AFTER SAVE:"
$readBackPrices | ConvertTo-Json -Depth 2
