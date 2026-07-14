# Network Troubleshooting

## Wi-Fi disconnection

1. Forget the network and re-join.
2. Check that you're connecting to **megacorp-corp**, not the guest
   network.
3. If still disconnecting, restart the wireless service:
   `sudo systemctl restart NetworkManager` (Linux) or toggle Wi-Fi
   off/on (macOS, Windows).

## Cannot reach internal services

Internal services (JIRA, Confluence, the document repo) require VPN.
Verify your VPN client is connected and that your IP is in the
`10.10.0.0/16` range.

If VPN is up and you still can't reach internal hosts, check DNS:
`dig db-internal.megacorpone.local` should return an address. If it
returns NXDOMAIN, your VPN is probably split-tunneled wrong — open a
JIRA ticket against IT-NET.

## DNS resolution problems

Run `dig` or `nslookup` against the company DNS server `10.10.1.53`
before troubleshooting further.
