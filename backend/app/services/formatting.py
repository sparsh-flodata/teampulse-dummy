"""One small markdown subset for every message TeamPulse writes.

Canonical subset (what templates and model output may use):
    paragraphs (blank line), **bold**, _italic_, `code`, "- " bullets,
    "1. " numbered items, and [text](https://...) links.

to_google_chat renders the subset in Google Chat's own syntax:
    **bold** -> *bold*, "- " -> "• ", [text](url) -> <url|text>.
    Example: "**Atlas**: 40%\n\n- item\n[docs](https://x.y)"
        -> "*Atlas*: 40%\n\n• item\n<https://x.y|docs>"
to_plain removes the markers, for notifications: "docs (https://x.y)".

Nothing outside the subset survives sanitize: HTML tags are removed, headings become bold
lines, tables become semicolon-separated lines, and links other than https are replaced by
their text. Output is capped at MAX_CHARS.
"""
import re

MAX_CHARS = 4000
LINK_ANY = re.compile(r'\[([^\]\n]{1,200})\]\(([^)\s]+)\)')
IMAGE = re.compile(r'!\[([^\]\n]*)\]\([^)\s]*\)')
HTML_TAG = re.compile(r'</?[a-zA-Z][^>\n]*>')
HEADING = re.compile(r'^\s{0,3}#{1,6}\s+(.*)$')
TABLE_RULE = re.compile(r'^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$')
BOLD = re.compile(r'\*\*([^\n]+?)\*\*')
CODE = re.compile(r'`([^`\n]+)`')
ITALIC = re.compile(r'(?<!\w)_([^_\n]+?)_(?!\w)')


def sanitize(md: str) -> str:
    text = IMAGE.sub(r'\1', (md or '').replace('\r', ''))
    text = HTML_TAG.sub('', text)
    out = []
    for line in text.split('\n'):
        stripped = line.strip()
        if '|' in stripped and TABLE_RULE.match(stripped):
            continue  # a table's header rule carries no content
        if stripped.startswith('|') and stripped.endswith('|'):
            cells = [c.strip() for c in stripped.strip('|').split('|')]
            line = '; '.join(c for c in cells if c)
        heading = HEADING.match(line)
        if heading:
            line = f'**{heading.group(1).strip()}**'
        line = re.sub(r'^(\s*)[*•] ', r'\1- ', line)
        out.append(line)
    text = LINK_ANY.sub(
        lambda m: m.group(0) if m.group(2).startswith('https://') else m.group(1),
        '\n'.join(out),
    )
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()[:MAX_CHARS]


def to_google_chat(md: str) -> str:
    text = sanitize(md)
    text = LINK_ANY.sub(lambda m: f'<{m.group(2)}|{m.group(1)}>', text)
    text = BOLD.sub(lambda m: f'*{m.group(1)}*', text)
    text = re.sub(r'^(\s*)- ', r'\1• ', text, flags=re.M)
    return text[:MAX_CHARS]


def to_plain(md: str) -> str:
    text = sanitize(md)
    text = LINK_ANY.sub(lambda m: f'{m.group(1)} ({m.group(2)})', text)
    text = BOLD.sub(r'\1', text)
    text = CODE.sub(r'\1', text)
    text = ITALIC.sub(r'\1', text)
    return text
