"""Generate web/js/content-data.js (window.PV_CONTENT) and web/js/training-data.js from content/*.json.

Demo mode opens web/index.html as a file and can't fetch JSON, so the game reads these scripts
instead. content-data.js has no training answers; training-data.js (answers included) is only
loaded in demo mode. Run after editing content/:  python scripts/build_content.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from phishverse.content import CONTENT_JS, TRAINING_JS, render_content_js, render_training_js  # noqa: E402


def main():
    for path, render in ((CONTENT_JS, render_content_js), (TRAINING_JS, render_training_js)):
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(render())
        print(f"Wrote {os.path.relpath(path)}")


if __name__ == "__main__":
    main()
