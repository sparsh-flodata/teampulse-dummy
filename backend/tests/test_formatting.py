from backend.app.services.formatting import sanitize, to_google_chat, to_plain


def test_bold_bullets_and_links_become_google_chat_syntax():
    md = '**Atlas**: 40%\n\n- item one\n1. **Pilot** [docs](https://example.com/a)'
    out = to_google_chat(md)
    assert '*Atlas*: 40%' in out
    assert '• item one' in out
    assert '1. *Pilot* <https://example.com/a|docs>' in out


def test_html_and_non_https_links_are_removed():
    assert '<script' not in sanitize('hi <script>alert(1)</script>')
    assert 'javascript:' not in sanitize('[x](javascript:alert(1))')
    assert sanitize('[x](http://a.b)') == 'x'


def test_headings_become_bold_and_output_is_capped():
    assert sanitize('# Title') == '**Title**'
    assert len(to_google_chat('a' * 9000)) <= 4000


def test_plain_text_removes_markers():
    assert to_plain('**Bold** and `code` [docs](https://e.x)') == 'Bold and code docs (https://e.x)'
