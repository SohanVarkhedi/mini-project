# Running PhishVerse on two devices

The demo runs the manager portal on a laptop and the employee portal on a phone, at the same
time. When the employee finishes a level, the manager's dashboard updates within a second or two,
without anyone refreshing. This page explains how to set that up.

## 1. Start the server for your network

On the laptop, from the project folder (with the virtual environment active):

```bash
python server.py --lan
```

It prints two addresses:

```
  PhishVerse is running  (Ctrl+C to stop)
    On this computer:           http://localhost:5000
    On your phone (same Wi-Fi): http://192.168.1.23:5000
```

Open the first one on the laptop and sign in as the manager. Keep this window running for the
whole demo; closing it stops the server.

`--lan` makes the server listen on every network interface, not just the laptop itself. It also
tells the manager's **Connect a device** panel which address to show. Use it only on networks you
trust: this is a development server.

## 2. Let Python through the firewall

The first time you run `--lan`, your computer may ask whether Python can accept connections.

- **Windows:** a "Windows Defender Firewall has blocked some features" window appears. Tick
  **Private networks** and click **Allow access**. Leave **Public networks** unticked.
  - If you missed the prompt, open *Windows Security → Firewall & network protection → Allow an
    app through firewall*, click **Change settings**, find `python.exe` (one entry per Python
    install; pick the one inside your `.venv` if listed) and tick **Private**.
  - Check that your Wi-Fi is set to **Private**: *Settings → Network & internet → Wi-Fi →
    (your network) → Network profile type → Private network*. On a Public profile, Windows
    blocks incoming connections even when Python is allowed.
- **macOS:** a dialog asks "Do you want the application Python to accept incoming network
  connections?" Click **Allow**. If you clicked Deny, open *System Settings → Network → Firewall
  → Options*, find Python and set it to **Allow incoming connections**.
- **Linux:** most desktop setups don't block it. With `ufw`, run `sudo ufw allow 5000/tcp`.

## 3. Open it on the phone

1. Connect the phone to the **same Wi-Fi** as the laptop.
2. On the laptop, click **Connect a device** in the manager's top bar. It shows the address
   and a QR code.
3. Scan the QR code with the phone's camera, or type the address into the phone's browser.
4. Sign in, or choose **Create account** to register a new employee.

The green **Live** label in each portal's top bar shows the connection is working. If it says
**Reconnecting…**, the device lost contact with the server and is trying again; **Offline** means
it can't reach the server at all. Pages keep working when live updates drop: both portals fall back
to checking every 10 seconds.

### The flow to demo

1. Manager: **Assign training** to the new employee. The phone shows **New training assigned**
   and the journey updates.
2. Employee: start Level 1 and play it. The laptop's **Live activity** feed shows "started", then
   "finished · 90%", and the person's score chip updates.
3. Manager: click the bell on the person's row (or **Send a reminder** in their panel) and add a
   short message. It appears on the phone straight away. You can send one reminder per person
   every 10 minutes.

## 4. When the phone can't reach the laptop

Work through these in order:

1. **Same network?** Both devices must be on the same Wi-Fi, not one on Wi-Fi and one on mobile
   data. On some routers the 5 GHz and 2.4 GHz networks are separate; join the same name.
2. **Firewall?** See step 2. A quick check: on the laptop, open the phone address
   (`http://192.168.x.x:5000`) in its own browser. If that works but the phone can't, the
   firewall or the network is blocking it.
3. **Right address?** If the laptop has several adapters (VPN, Docker, a virtual machine), the
   printed address may belong to the wrong one. Disconnect the VPN, or find the Wi-Fi address with
   `ipconfig` (Windows: "Wireless LAN adapter Wi-Fi → IPv4 Address") or
   `ipconfig getifaddr en0` (macOS), and type `http://<that address>:5000` on the phone.
4. **Campus, office or guest Wi-Fi?** These networks often use *client isolation*: every device
   can reach the internet but not each other. Nothing on the laptop can fix that. Use one of these
   instead:

### Option A: phone hotspot (recommended for the demo)

1. Turn on the phone's personal hotspot.
2. Connect the laptop to the hotspot's Wi-Fi.
3. Restart `python server.py --lan` so it picks up the new address, then open **Connect a
   device** again.
4. On the phone itself, open the address in its browser. (A phone can always reach a laptop on
   its own hotspot.) A second phone can join the same hotspot too.

Trade-offs: it uses a little mobile data only if the laptop browses the internet (PhishVerse itself
runs locally; the only outside request is Google Fonts, and the page works without it). Hotspots
on some phones turn off after a few idle minutes; keep the phone awake.

### Option B: a free tunnel (Cloudflare Quick Tunnel)

A tunnel gives the laptop a temporary public `https://…trycloudflare.com` address that any
device on any network can open.

1. Install `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Start PhishVerse normally (`python server.py`; `--lan` isn't needed).
3. In a second terminal: `cloudflared tunnel --url http://localhost:5000`
4. It prints a `https://<random-words>.trycloudflare.com` address. Open it on the phone.

Trade-offs:
- **It's public.** Anyone who learns the address can open the sign-in page while the tunnel
  runs. Change the manager password first (`python server.py --set-manager-password ...`), use
  demo accounts only, and stop the tunnel (Ctrl+C) straight after the demo.
- **It depends on the internet** and on Cloudflare's free service; there's no uptime promise and
  the address changes every time.
- **Latency:** live updates travel through Cloudflare, so expect a little more delay than on Wi-Fi
  (usually still under a second). Quick Tunnels support Server-Sent Events, which live updates use.
- The **Connect a device** panel shows the LAN address, not the tunnel address; share the tunnel
  address by hand.

## 5. Testing with two browsers on one computer

You don't need a phone to try the multi-device flow:

1. Start `python server.py --seed-demo` (or `--lan`).
2. Open `http://localhost:5000` in a normal window and sign in as the manager.
3. Open a **private/incognito window** (or a different browser) so it has its own sign-in, and
   sign in as an employee, for example `aarav@novacorp.local` / `demo1234`.
4. To see the phone layout, open the browser's developer tools and switch on device emulation
   (Chrome: Ctrl+Shift+M / Cmd+Shift+M, then pick a phone such as iPhone 12 Pro).
5. Put the windows side by side and run the flow above.

The same account can be signed in on several devices at once. Signing out on one doesn't sign out
the others.

## How live updates work (for developers)

- Every change worth showing is written once to the `activity` table by
  `phishverse.events.record_event()`: joined, assigned, unassigned, level_started,
  level_finished, nudge_sent.
- `GET /api/events` is a Server-Sent Events stream. Managers receive every event; employees only
  events about themselves. The server sends a heartbeat every 15 seconds and replays anything
  missed after a reconnect (`Last-Event-ID`).
- `web/js/live.js` wraps `EventSource`, reconnects when the stream goes quiet for 40 seconds, and
  falls back to polling `GET /api/activity` every 10 seconds if streaming fails.
- The development server handles each connection on its own thread, so open streams don't block
  other requests. `tests/test_live_server.py` checks this with three streams open.
