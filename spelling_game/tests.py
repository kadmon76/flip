import json
import re
import shutil
import subprocess
from pathlib import Path

from django.test import TestCase


class HealthEndpointTests(TestCase):
    def test_health_returns_ok_json(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertEqual(response.json(), {"ok": True})

    def test_health_does_not_require_login(self):
        # Anonymous client; must not redirect to the login page.
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)


class IndexTests(TestCase):
    def test_index_is_free_to_play_without_login(self):
        # Anonymous client; must render the game, not redirect to login.
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="screen-theme"')


class ShotToolTests(TestCase):
    """tools/shot.mjs must reject bad arguments before launching a browser."""

    TOOL = Path(__file__).resolve().parent.parent / 'tools' / 'shot.mjs'

    def run_shot(self, *args):
        return subprocess.run(
            ['node', str(self.TOOL), *args],
            capture_output=True, text=True, timeout=20,
        )

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def test_no_args_exits_non_zero_with_usage(self):
        r = self.run_shot()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('usage:', r.stderr)

    def test_bad_wait_exits_non_zero(self):
        r = self.run_shot('http://127.0.0.1:8000/', 'out.png', '--wait', 'soon')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('--wait', r.stderr)

    def test_non_http_url_exits_non_zero(self):
        r = self.run_shot('file:///etc/hosts', 'out.png')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('http', r.stderr)

    def test_unknown_option_exits_non_zero(self):
        r = self.run_shot('http://127.0.0.1:8000/', 'out.png', '--bogus')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('--bogus', r.stderr)

    def test_usage_comment_is_five_lines(self):
        head = self.TOOL.read_text().splitlines()[:6]
        self.assertTrue(all(line.startswith('//') for line in head[:5]))
        self.assertFalse(head[5].startswith('//'))

    def test_bad_viewport_exits_non_zero(self):
        r = self.run_shot('http://127.0.0.1:8000/', 'out.png', '--viewport', '360')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('--viewport', r.stderr)


class GameCssPaletteTests(TestCase):
    """DESIGN.md palette: colour literals live only in :root of game.css."""

    CSS = Path(__file__).resolve().parent.parent / 'static' / 'css' / 'game.css'
    PALETTE = ['#FBF6EC', '#FFFFFF', '#7FB7BE', '#F2B84B', '#E8836F', '#4A3C28', '#8C7B66']

    def _root_and_rest(self):
        text = re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)
        start = text.index(':root')
        end = text.index('}', start)
        return text[start:end + 1], text[:start] + text[end + 1:]

    def test_root_defines_the_design_palette(self):
        root, _ = self._root_and_rest()
        for colour in self.PALETTE:
            self.assertIn(colour, root.upper())

    def test_no_colour_literals_outside_root(self):
        _, rest = self._root_and_rest()
        literals = re.findall(r'#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(', rest)
        self.assertEqual(literals, [])


class BoxLayoutTests(TestCase):
    """static/js/layout.js boxLayout(): 48px boxes on one row when they fit;
    8+ letter words shrink toward 40px to stay on one row; otherwise 48px
    boxes wrap into even rows (DESIGN.md "Type", BACKLOG B-104)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'layout.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def layout(self, count, width, gap=6):
        script = (
            f"import {{ boxLayout }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify(boxLayout({count}, {width}, {gap})));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_short_word_one_row_at_phone_width(self):
        # 360px viewport minus 16px gutters = 328px row.
        self.assertEqual(self.layout(4, 328), {'size': 48, 'cols': 4})
        self.assertEqual(self.layout(6, 328), {'size': 48, 'cols': 6})

    def test_seven_letters_never_shrink_below_48_so_they_wrap(self):
        self.assertEqual(self.layout(7, 328), {'size': 48, 'cols': 4})   # 4 + 3

    def test_long_words_wrap_into_even_rows_at_phone_width(self):
        self.assertEqual(self.layout(8, 328), {'size': 48, 'cols': 4})   # 4 + 4
        self.assertEqual(self.layout(9, 328), {'size': 48, 'cols': 5})   # 5 + 4
        self.assertEqual(self.layout(10, 328), {'size': 48, 'cols': 5})  # 5 + 5

    def test_eight_plus_letters_shrink_to_fit_one_row_on_a_wide_column(self):
        # 480px column minus gutters = 448px row.
        self.assertEqual(self.layout(8, 448), {'size': 48, 'cols': 8})
        nine = self.layout(9, 448)
        self.assertEqual(nine['cols'], 9)
        self.assertGreaterEqual(nine['size'], 40)
        self.assertLess(nine['size'], 48)
        self.assertEqual(self.layout(10, 448), {'size': 48, 'cols': 5})  # 40px would not fit

    def test_zero_letters_is_safe(self):
        self.assertEqual(self.layout(0, 328), {'size': 48, 'cols': 1})
