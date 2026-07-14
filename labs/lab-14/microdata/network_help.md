# Wi-Fi and VPN Troubleshooting

## Wi-Fi keeps dropping

1. Forget the network and re-join.
2. Confirm you joined `megacorpai-corp`, NOT the guest network.
3. If it still drops, restart NetworkManager (`sudo systemctl restart NetworkManager` on Linux; toggle Wi-Fi on macOS/Windows).

## VPN access

Download the GlobalProtect client from the IT portal. Connect to `vpn.megacorpai.local` with your Active Directory credentials. Internal services (JIRA, Confluence, the document repo) require VPN; verify your IP is in `10.10.0.0/16`.

## DNS resolution problems

Run `dig` or `nslookup` against the company DNS server `10.10.1.53` before troubleshooting further.
