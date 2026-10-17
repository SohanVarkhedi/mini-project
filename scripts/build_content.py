"""Generate web/js/content-data.js (window.PV_CONTENT) from content/*.json.

Demo mode opens web/index.html as a file and can't fetch JSON, so the game reads this
script instead. Run after editing content/:  python scripts/build_content.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from phishverse.content import CONTENT_JS, render_content_js  # noqa: E402


def main():
    with open(CONTENT_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_content_js())
    print(f"Wrote {os.path.relpath(CONTENT_JS)}")


if __name__ == "__main__":
    main()
