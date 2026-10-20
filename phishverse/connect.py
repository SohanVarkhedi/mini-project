"""Connect a device: the LAN address other devices use, as text and as a QR code (manager only)."""
import io
import socket

import segno
from flask import Blueprint, Response, current_app, jsonify, request

from .auth import err, require_user

bp = Blueprint("connect", __name__, url_prefix="/api")


def lan_ip():
    """The IP other devices on this network can reach us at, or None.

    Connecting a UDP socket sends no packets; it only asks the OS which local
    address it would route from. 192.0.2.1 is a reserved documentation address.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 80))
        ip = s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()
    return None if ip.startswith("127.") or ip == "0.0.0.0" else ip


@bp.get("/connect")
def connect_info():
    _u, e = require_user("manager")
    if e:
        return e
    url = current_app.config.get("LAN_URL")
    return jsonify({"lan": bool(url), "url": url, "this_url": request.host_url.rstrip("/")})


@bp.get("/connect/qr.svg")
def connect_qr():
    _u, e = require_user("manager")
    if e:
        return e
    url = current_app.config.get("LAN_URL")
    if not url:
        return err("The server isn't running with --lan, so there's no address for other devices.", 409)
    out = io.BytesIO()
    # Dark on white whatever the theme: phone cameras need the contrast.
    segno.make(url, error="m").save(out, kind="svg", scale=8, border=2, dark="#13203A", light="#FFFFFF",
                                    xmldecl=False, svgns=True, title=f"QR code for {url}")
    return Response(out.getvalue(), mimetype="image/svg+xml", headers={"Cache-Control": "no-store"})
