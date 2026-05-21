$port = 9
$u = New-Object System.Net.Sockets.UdpClient($port)
$e = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
Write-Host "--- LISTENING ON UDP PORT 9 ---"
Write-Host "--- PRESS THE WOL BUTTON ON YOUR PHONE NOW ---"
Write-Host "--- WAITING FOR 60 SECONDS ---"

$u.Client.ReceiveTimeout = 60000
try {
    $data = $u.Receive([ref]$e)
    Write-Host "SUCCESS: Received Magic Packet from $($e.Address)"
} catch {
    Write-Host "FAILURE: No packet received within 60 seconds."
} finally {
    $u.Close()
}
