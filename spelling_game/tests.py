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


class MotionSpecTests(TestCase):
    """static/js/motion.js motionFor(): DESIGN.md "Motion" numbers for tile
    pick-up, drop into a box and return; instant, no scale and no
    overshoot under prefers-reduced-motion (BACKLOG B-105)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'motion.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def motion(self, kind, reduced):
        script = (
            f"import {{ motionFor }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify(motionFor({json.dumps(kind)}, {json.dumps(reduced)})));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_pickup_scales_to_1_08_in_120ms(self):
        self.assertEqual(self.motion('pickup', False), {'duration': 0.12, 'ease': 'power2.out', 'scale': 1.08})

    def test_snap_into_box_overshoots_in_200ms(self):
        self.assertEqual(self.motion('snap', False), {'duration': 0.2, 'ease': 'back.out(1.4)', 'scale': 1})

    def test_return_is_ease_out_within_300ms(self):
        m = self.motion('return', False)
        self.assertLessEqual(m['duration'], 0.3)
        self.assertNotIn('back', m['ease'])
        self.assertEqual(m['scale'], 1)

    def test_reduced_motion_is_instant_without_scale_or_overshoot(self):
        for kind in ('pickup', 'snap', 'return'):
            self.assertEqual(self.motion(kind, True), {'duration': 0, 'ease': 'none', 'scale': 1}, kind)

    def test_unknown_kind_fails(self):
        script = (
            f"import {{ motionFor }} from '{self.MODULE.as_uri()}';"
            "motionFor('wiggle', false);"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertNotEqual(result.returncode, 0)


class StarsTests(TestCase):
    """static/js/score.js starsFor(): stars for a 5-word round, 5/5 -> 3,
    4/5 -> 2, 2-3/5 -> 1, 0-1/5 -> 0 (BACKLOG B-107)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'score.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        script = f"import {{ starsFor }} from '{self.MODULE.as_uri()}';{body}"
        return subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )

    def stars(self, correct, size=5):
        result = self.run_node(f"console.log(JSON.stringify(starsFor({correct}, {size})));")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_all_five_is_three_stars(self):
        self.assertEqual(self.stars(5), 3)

    def test_four_of_five_is_two_stars(self):
        self.assertEqual(self.stars(4), 2)

    def test_two_or_three_of_five_is_one_star(self):
        self.assertEqual(self.stars(3), 1)
        self.assertEqual(self.stars(2), 1)

    def test_zero_or_one_of_five_is_no_star(self):
        self.assertEqual(self.stars(1), 0)
        self.assertEqual(self.stars(0), 0)

    def test_bad_score_fails(self):
        for body in ("starsFor(6, 5);", "starsFor(-1, 5);", "starsFor(2.5, 5);", "starsFor(1, 0);"):
            self.assertNotEqual(self.run_node(body).returncode, 0, body)


class CelebrateMotionSpecTests(TestCase):
    """static/js/motion.js motionFor() for the reward beats (BACKLOG B-110,
    DESIGN.md "Motion"): a correct check pulses the boxes once and bursts up
    to 40 confetti pieces over 600ms in total; earned stars pop in with
    back.out(1.4), 200ms each. Reduced motion: fades only, no confetti, no
    overshoot."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'motion.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def motion(self, kind, reduced):
        script = (
            f"import {{ motionFor }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify(motionFor({json.dumps(kind)}, {json.dumps(reduced)})));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_pulse_is_one_ease_out_beat_within_the_600ms_budget(self):
        m = self.motion('pulse', False)
        self.assertGreater(m['scale'], 1)
        self.assertLessEqual(m['duration'], 0.6)
        self.assertNotIn('back', m['ease'])

    def test_confetti_is_up_to_40_pieces_over_600ms(self):
        m = self.motion('confetti', False)
        self.assertEqual(m['count'], 40)
        self.assertEqual(m['duration'], 0.6)

    def test_star_pop_overshoots_200ms_per_star_one_after_another(self):
        m = self.motion('starPop', False)
        self.assertEqual(m['duration'], 0.2)
        self.assertEqual(m['ease'], 'back.out(1.4)')
        self.assertEqual(m['stagger'], 0.2)

    def test_reduced_motion_is_fades_only_without_confetti_or_overshoot(self):
        pulse = self.motion('pulse', True)
        self.assertEqual((pulse['duration'], pulse['scale'], pulse['ease']), (0, 1, 'none'))
        self.assertGreater(pulse['fade'], 0)

        self.assertEqual(self.motion('confetti', True)['count'], 0)

        star = self.motion('starPop', True)
        self.assertEqual((star['duration'], star['scale'], star['ease']), (0, 1, 'none'))
        self.assertGreater(star['fade'], 0)
        self.assertGreater(star['stagger'], 0)


class StickerBookTests(TestCase):
    """static/js/stickers.js: load/add/has/all over localStorage key
    flip.stickers.v1, shape { "<theme>": ["duck", ...] }; corrupt or missing
    data is an empty book (BACKLOG B-111). Run through node with a fake
    localStorage."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'stickers.js'

    # In-memory localStorage; `seed` is the initial value of the key or null.
    FAKE_STORAGE = """
        const store = new Map();
        if (SEED !== null) store.set('flip.stickers.v1', SEED);
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
        };
        const raw = () => store.get('flip.stickers.v1') ?? null;
    """

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body, seed=None):
        script = (
            f"const SEED = {json.dumps(seed)};"
            f"{self.FAKE_STORAGE}"
            f"const s = await import('{self.MODULE.as_uri()}');"
            f"const out = (v) => console.log(JSON.stringify(v));"
            f"{body}"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_missing_key_is_an_empty_book(self):
        self.assertEqual(self.run_node("out([s.load(), s.all(), s.has('animals', 'duck')]);"), [{}, [], False])

    def test_add_writes_the_key_in_the_documented_shape(self):
        book, stored = self.run_node("s.add('animals', 'duck'); out([s.load(), JSON.parse(raw())]);")
        self.assertEqual(book, {'animals': ['duck']})
        self.assertEqual(stored, {'animals': ['duck']})

    def test_has_after_add_and_not_for_other_theme_or_word(self):
        self.assertEqual(
            self.run_node("s.add('animals', 'duck'); out([s.has('animals', 'duck'), s.has('animals', 'cat'), s.has('transportation', 'duck')]);"),
            [True, False, False],
        )

    def test_add_returns_true_only_the_first_time_and_does_not_duplicate(self):
        first, second, book, everything = self.run_node(
            "const a = s.add('animals', 'duck'); const b = s.add('animals', 'duck');"
            "s.add('animals', 'horse'); s.add('transportation', 'bus');"
            "out([a, b, s.load(), s.all()]);"
        )
        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(book, {'animals': ['duck', 'horse'], 'transportation': ['bus']})
        self.assertEqual(everything, [
            {'theme': 'animals', 'word': 'duck'},
            {'theme': 'animals', 'word': 'horse'},
            {'theme': 'transportation', 'word': 'bus'},
        ])

    def test_seeded_book_is_read_and_extended(self):
        self.assertEqual(
            self.run_node("out([s.has('animals', 'cat'), s.add('animals', 'cat'), s.add('animals', 'dog'), s.load()]);",
                          seed='{"animals": ["cat"]}'),
            [True, False, True, {'animals': ['cat', 'dog']}],
        )

    def test_corrupt_json_is_an_empty_book_and_add_recovers(self):
        for seed in ('{not json', '"a string"', '[1, 2]', 'null', '42'):
            self.assertEqual(
                self.run_node("out([s.load(), s.all(), s.add('animals', 'duck'), s.load()]);", seed=seed),
                [{}, [], True, {'animals': ['duck']}], seed,
            )

    def test_bad_entries_inside_a_book_are_dropped(self):
        self.assertEqual(
            self.run_node("out(s.load());", seed='{"animals": ["duck", "duck", 3, null, ""], "transportation": "bus", "x": null}'),
            {'animals': ['duck']},
        )

    def test_no_localstorage_is_an_empty_book(self):
        self.assertEqual(
            self.run_node("delete globalThis.localStorage; out([s.load(), s.add('animals', 'duck'), s.has('animals', 'duck')]);"),
            [{}, True, False],
        )
