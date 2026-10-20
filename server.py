"""
PhishVerse local server
-----------------------
Serves the game/portal from ./web and stores accounts, assignments and
progress in a local SQLite file (phishverse.db). The app lives in phishverse/;
this file is the command line.

  python server.py                  # http://localhost:5000
  python server.py --seed-demo      # also add 4 sample employees with results
  python server.py --lan            # let phones and laptops on your Wi-Fi join
  python server.py --host 0.0.0.0   # same binding as --lan, without the LAN URL
"""
import argparse

from phishverse import create_app, db
from phishverse.connect import lan_ip
from phishverse.seed import seed_demo, set_manager_password


def main():
    ap = argparse.ArgumentParser(description="PhishVerse local server")
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to allow other computers on your network")
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--lan", action="store_true", help="bind 0.0.0.0 and print the URL for phones and laptops on your Wi-Fi")
    ap.add_argument("--seed-demo", action="store_true", help="add sample employees and results")
    ap.add_argument("--set-manager-password", metavar="PASSWORD", help="change the manager's password and exit")
    args = ap.parse_args()

    app = create_app()  # creates/migrates the database
    if args.set_manager_password:
        if len(args.set_manager_password) < 8:
            raise SystemExit("Password must be at least 8 characters.")
        conn = db.connect(app.config["DB_PATH"])
        set_manager_password(conn, args.set_manager_password)
        conn.close()
        print("Manager password updated.")
        return
    if args.seed_demo:
        conn = db.connect(app.config["DB_PATH"])
        seed_demo(conn, app.extensions["pv_content"])
        conn.close()

    host = "0.0.0.0" if args.lan else args.host
    ip = lan_ip() if host == "0.0.0.0" else None
    if ip:
        app.config["LAN_URL"] = f"http://{ip}:{args.port}"  # shown in the manager's Connect a device panel
    if args.lan:
        print("  PhishVerse is running  (Ctrl+C to stop)")
        print(f"    On this computer:           http://localhost:{args.port}")
        if ip:
            print(f"    On your phone (same Wi-Fi): http://{ip}:{args.port}")
            print("  If the phone can't connect, allow Python through your firewall (private networks).\n")
        else:
            print("    LAN address not found. Check you're on Wi-Fi, then find it with ipconfig (Windows)")
            print("    or ipconfig getifaddr en0 (macOS).\n")
    else:
        shown = "localhost" if host in ("127.0.0.1", "0.0.0.0") else host
        print(f"  PhishVerse is running at http://{shown}:{args.port}  (Ctrl+C to stop)\n")
    app.run(host=host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
