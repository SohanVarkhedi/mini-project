"""Check content/*.json against the rules in phishverse/content.py validate().

  python scripts/validate_content.py      # exit code 1 and a list of problems if anything is wrong
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from phishverse.content import CONTENT_DIR, read_json, validate  # noqa: E402


def main():
    problems = validate(read_json(os.path.join(CONTENT_DIR, "levels.json")),
                        read_json(os.path.join(CONTENT_DIR, "skills.json")),
                        read_json(os.path.join(CONTENT_DIR, "world_refs.json")))
    if problems:
        print(f"{len(problems)} problem(s) in content/:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("Content is valid.")


if __name__ == "__main__":
    main()
