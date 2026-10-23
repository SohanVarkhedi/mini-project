"""Check content/*.json: levels, skills, world refs and training simulations.

  python scripts/validate_content.py      # exit code 1 and a list of problems if anything is wrong
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from phishverse.content import validate_all  # noqa: E402


def main():
    problems = validate_all()
    if problems:
        print(f"{len(problems)} problem(s) in content/:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("Content is valid.")


if __name__ == "__main__":
    main()
