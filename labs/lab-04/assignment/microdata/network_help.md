# Wi-Fi Troubleshooting

If your Wi-Fi keeps dropping:

1. Forget the network and re-join it.
2. Check that you joined `megacorp-corp`, not the guest network.
3. If it still drops, restart the wireless service:
     `sudo systemctl restart NetworkManager` (Linux)
   or toggle Wi-Fi off and on (macOS, Windows).
