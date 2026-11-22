import json
import re
import sys

calls = json.load(open(sys.argv[1]))


def slug(message):
    return "mz-" + "-".join([w.lower() for w in re.split(r"[^A-Za-z0-9]", message) if w][:6])


ids = {
    c["message"]: "sharp-quote" if c["message"].startswith("It's safer to sharp-quote") else slug(c["message"])
    for c in calls
}
native = {
    "FYI only: To get `(lm-authors)`": "mz-author-header",
    "FYI only: To get `(lm-maintainers)`": "mz-maintainer-header",
    "- `;;; Commentary` in main file should not be a stub": "mz-commentary-stub",
    "- `;;; Commentary` should not just redirect to a README": "mz-commentary-readme",
    "- `;;; Commentary` should not just redirect to a URL": "mz-commentary-url",
    "- `;;; Commentary` is much wider": "mz-commentary-wide",
    "- You can separate TODOs": "mz-commentary-todo",
    "- `;;; Commentary` decoration": "mz-commentary-decoration",
    "- Warning: No `add-to-list": "mz-theme-load-path",
    "Theme `": "mz-theme-name",
}
theirs = set()
for line in open(sys.argv[2]):
    package, file, text = line.rstrip("\n").split("\t", 2)
    match = re.match(r"^- [^:]+:\d+:\d+: (.*)$", text)
    message = match.group(1) if match else text
    if message.startswith("```") or message.startswith("━"):
        continue
    found = ids.get(message) or next((v for k, v in native.items() if message.startswith(k)), None)
    if found is None:
        sys.exit(f"unknown melpazoid message: {message}")
    theirs.add((package, file, found))
ours = {tuple(line.rstrip("\n").split("\t")) for line in open(sys.argv[3])}
print(f"melpazoid {len(theirs)}, elispore-check {len(ours)}, both {len(theirs & ours)}")
for item in sorted(theirs - ours):
    print("missing", *item)
for item in sorted(ours - theirs):
    print("extra", *item)
sys.exit(1 if theirs != ours else 0)
