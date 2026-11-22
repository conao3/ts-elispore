import json
import re
import subprocess
import sys
from pathlib import Path

report, melpa, melpazoid, emacs = sys.argv[1:5]
checkouts = {"melpa/melpa": Path(melpa), "riscy/melpazoid": Path(melpazoid)}
lispref = Path(emacs) / "doc/lispref"


def normalize(text):
    text = re.sub(r"\[\[[^\]]*\]\[([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"~([^~]+)~", r"\1", text)
    return " ".join(text.replace("’", "'").split())


def github(url):
    match = re.match(
        r"https://github\.com/([^/]+/[^/]+)/blob/([0-9a-f]{40})/([^?#]+)(?:\?plain=1)?#L(\d+)(?:-L(\d+))?$",
        url,
    )
    if not match:
        raise ValueError(f"unsupported GitHub URL: {url}")
    repo, commit, path, first, last = match.groups()
    checkout = checkouts[repo]
    head = subprocess.run(
        ["git", "-C", str(checkout), "rev-parse", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()
    if head != commit:
        raise ValueError(f"{checkout} is at {head}, not {commit}")
    lines = (checkout / path).read_text().split("\n")
    return "\n".join(lines[int(first) - 1 : int(last or first)])


def texinfo(text):
    text = re.sub(r"@samp\{([^{}]*)\}", r"‘\1’", text)
    for _ in range(3):
        text = re.sub(r"@(?:code|var|emph|dfn|file|kbd|key|strong|command)\{([^{}]*)\}", r"\1", text)
    text = text.replace("@dots{}", "…").replace("@@", "@").replace("@{", "{").replace("@}", "}")
    return "\n".join(line for line in text.split("\n") if not re.match(r"@[a-z]+( |$)", line))


def manual(url):
    match = re.match(r"https://www\.gnu\.org/software/emacs/manual/html_node/elisp/([^/]+)\.html$", url)
    if not match:
        raise ValueError(f"unsupported manual URL: {url}")
    node = match.group(1).replace("_002d", "\0").replace("-", " ").replace("\0", "-")
    for path in sorted(lispref.glob("*.texi")):
        text = path.read_text()
        start = text.find(f"@node {node}\n")
        if start >= 0:
            end = text.find("\n@node ", start + 1)
            return texinfo(text[start : end if end >= 0 else None])
    raise ValueError(f"no @node {node} in {lispref}")


failures = 0
count = 0
for rule in json.load(open(report))["rules"]:
    for source in rule["sources"]:
        count += 1
        url = source["url"]
        text = github(url) if url.startswith("https://github.com/") else manual(url)
        if normalize(source["quote"]) not in normalize(text):
            failures += 1
            print(f"{rule['id']}: quote not found at {url}\n  {source['quote']}")
print(f"{count} sources, {failures} not found")
sys.exit(1 if failures else 0)
