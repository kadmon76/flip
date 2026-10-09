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

    def test_index_has_the_sticker_book_screen_and_its_buttons(self):
        # BACKLOG B-112: Stickers on the theme screen opens #screen-gallery,
        # which has a Back button.
        response = self.client.get('/')
        self.assertContains(response, 'id="stickers-btn"')
        self.assertContains(response, 'id="screen-gallery"')
        self.assertContains(response, 'id="gallery-back-btn"')

    def test_play_screen_keeps_its_ids_has_no_text_and_loads_v5_fonts(self):
        # BACKLOG B-113 / B-114: no result text on the play screen (the
        # result line and #next-btn are gone, the dome is also "next");
        # the other protected ids stay; Andika Bold and Courier Prime Bold
        # from Google Fonts.
        response = self.client.get('/')
        for id_ in ('screen-play', 'letter-boxes', 'letter-tray', 'word-counter',
                    'check-btn', 'reset-btn', 'speak-btn', 'play-image'):
            self.assertContains(response, f'id="{id_}"')
        self.assertNotContains(response, 'id="next-btn"')
        self.assertNotContains(response, 'id="result-line"')
        self.assertContains(response, 'family=Andika:wght@700')
        self.assertContains(response, 'family=Courier+Prime:wght@700')
        self.assertNotContains(response, 'Fredoka')
        self.assertNotContains(response, '>Check<')
        self.assertNotContains(response, '>Next<')

    def test_console_controls_are_the_image_assets(self):
        # BACKLOG B-114, DESIGN "The layer model": the console and its
        # controls are the scene images, left to right lever, speaker, dome.
        html = self.client.get('/').content.decode()
        for asset in ('console', 'lever-up', 'lever-down', 'speaker-off', 'speaker-on',
                      'speaker-cap', 'dome-off', 'dome-ready', 'dome-pressed'):
            self.assertIn(f'/static/images/ui/{asset}.png', html, asset)
        self.assertLess(html.index('id="reset-btn"'), html.index('id="speak-btn"'))
        self.assertLess(html.index('id="speak-btn"'), html.index('id="check-btn"'))
        self.assertNotIn('icon-btn', html)


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
    """DESIGN.md "Palette" (v5): colour literals live only in :root of
    game.css; derived tones there are a palette colour mixed with at most
    15% white or black (the allowed tints), or made translucent."""

    CSS = Path(__file__).resolve().parent.parent / 'static' / 'css' / 'game.css'
    PALETTE = {
        'bench': '#582703', 'bench-deep': '#2a1405', 'cream': '#efe0be', 'ink': '#2a1c10',
        'brass': '#b98c36', 'brass-dark': '#6b4a1c', 'teal': '#27665e', 'teal-glow': '#3fe0d0',
        'amber': '#ffd87a', 'amber-deep': '#e8a23a', 'charcoal': '#2c241c', 'bulb-off': '#84582c',
        'error': '#d9583b',
    }

    def _root_and_rest(self):
        text = re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)
        start = text.index(':root')
        end = text.index('}', start)
        return text[start:end + 1], text[:start] + text[end + 1:]

    def test_root_defines_the_design_palette(self):
        root, _ = self._root_and_rest()
        for name, colour in self.PALETTE.items():
            self.assertRegex(root, rf'--{name}:\s*{colour}\s*;', name)

    def test_no_old_palette_variables_remain(self):
        self.assertNotIn('--color-', self.CSS.read_text())

    def test_no_colour_literals_outside_root(self):
        _, rest = self._root_and_rest()
        literals = re.findall(r'#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\(', rest)
        self.assertEqual(literals, [])
        named = re.findall(r':[^;{}]*\b(white|black|red|green|blue|gray|grey|orange|yellow)\b', rest)
        self.assertEqual(named, [])

    def test_derived_tones_are_palette_tints_within_15_percent_or_translucent(self):
        root, _ = self._root_and_rest()
        mixes = re.findall(
            r'color-mix\(\s*in srgb,\s*var\(--([a-z-]+)\)\s*(\d+)%,\s*(#fff|#000|transparent)\s*\)', root)
        # every color-mix in :root has that shape
        self.assertEqual(len(mixes), root.count('color-mix('))
        self.assertTrue(mixes)
        for name, share, other in mixes:
            self.assertIn(name, self.PALETTE, name)
            if other != 'transparent':
                self.assertGreaterEqual(int(share), 85, name)

    def test_frame_border_image_is_exactly_as_design(self):
        css = self.CSS.read_text()
        self.assertIn('border-width: 29px 26px 38px 28px;', css)
        self.assertIn('border-image: url(../images/ui/frame.png) 180 165 235 175;', css)


class SlotLayoutTests(TestCase):
    """static/js/layout.js slotLayout(): 46px slots, 6px apart, 8px rail
    padding; six slots fit one row, 7+ letters wrap into two even rows
    (DESIGN.md "Layout", BACKLOG B-113)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'layout.js'
    RAIL = 332   # 360px phone minus the frame's 14px safe area on each side

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def layout(self, count, width=RAIL):
        script = (
            f"import {{ slotLayout }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify(slotLayout({count}, {width})));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_slot_size_gap_and_padding(self):
        self.assertEqual(self.layout(4), {'size': 46, 'gap': 6, 'pad': 8, 'cols': 4, 'rows': 1})

    def test_up_to_six_letters_fit_one_row_at_phone_width(self):
        for n in range(1, 7):
            self.assertEqual((self.layout(n)['cols'], self.layout(n)['rows']), (n, 1), n)

    def test_seven_to_ten_letters_wrap_into_two_even_rows(self):
        self.assertEqual((self.layout(7)['cols'], self.layout(7)['rows']), (4, 2))    # 4 + 3
        self.assertEqual((self.layout(8)['cols'], self.layout(8)['rows']), (4, 2))    # 4 + 4
        self.assertEqual((self.layout(9)['cols'], self.layout(9)['rows']), (5, 2))    # 5 + 4
        self.assertEqual((self.layout(10)['cols'], self.layout(10)['rows']), (5, 2))  # 5 + 5

    def test_seven_letters_wrap_on_a_wide_rail_too(self):
        # 480px column: seven would fit, but the rail holds six to a row.
        self.assertEqual(self.layout(6, 452)['rows'], 1)
        self.assertEqual((self.layout(7, 452)['cols'], self.layout(7, 452)['rows']), (4, 2))

    def test_every_row_fits_the_rail(self):
        for n in range(1, 11):
            l = self.layout(n)
            self.assertLessEqual(l['cols'] * 46 + (l['cols'] - 1) * 6 + 2 * 8, self.RAIL, n)

    def test_narrow_rail_holds_what_fits(self):
        # 280px rail: 264px inside, five 46px slots with 6px gaps.
        self.assertEqual((self.layout(6, 280)['cols'], self.layout(6, 280)['rows']), (3, 2))

    def test_zero_letters_is_safe(self):
        self.assertEqual(self.layout(0), {'size': 46, 'gap': 6, 'pad': 8, 'cols': 1, 'rows': 0})


class BlockLayoutTests(TestCase):
    """static/js/layout.js blockLayout(): 52px letter blocks in loose
    staggered rows of at most four, each tilted at most 4 degrees, inside
    the bench width (DESIGN.md "Layout", BACKLOG B-113)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'layout.js'
    BENCH = 332

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def layout(self, count, width=BENCH):
        script = (
            f"import {{ blockLayout }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify(blockLayout({count}, {width})));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def rows(self, layout):
        ys = []
        for s in layout['spots']:
            if not ys or abs(s['y'] - ys[-1][0]) > layout['size'] / 2:
                ys.append([s['y'], 0])
            ys[-1][1] += 1
        return [n for _, n in ys]

    def test_blocks_are_52px(self):
        self.assertEqual(self.layout(4)['size'], 52)

    def test_rows_hold_at_most_four_and_fill_four_first(self):
        self.assertEqual(self.rows(self.layout(4)), [4])
        self.assertEqual(self.rows(self.layout(6)), [4, 2])       # as in the v5 reference
        self.assertEqual(self.rows(self.layout(7)), [4, 3])
        self.assertEqual(self.rows(self.layout(10)), [4, 4, 2])

    def test_tilt_is_at_most_four_degrees_and_not_all_equal(self):
        spots = self.layout(10)['spots']
        self.assertTrue(all(abs(s['rot']) <= 4 for s in spots))
        self.assertGreater(len({s['rot'] for s in spots}), 1)

    def test_blocks_stay_on_the_bench_and_do_not_overlap(self):
        for n in range(1, 11):
            l = self.layout(n)
            size = l['size']
            for s in l['spots']:
                self.assertGreaterEqual(s['x'], 2, n)
                self.assertLessEqual(s['x'] + size, self.BENCH - 2, n)
                self.assertGreaterEqual(s['y'], 0, n)
                self.assertLessEqual(s['y'] + size, l['height'], n)
            for i, a in enumerate(l['spots']):
                for b in l['spots'][i + 1:]:
                    apart = abs(a['x'] - b['x']) >= size + 4 or abs(a['y'] - b['y']) >= size + 4
                    self.assertTrue(apart, (n, a, b))

    def test_rows_are_staggered_when_there_are_two_or_more(self):
        spots = self.layout(8)['spots']   # 4 + 4: same width, so only the stagger differs
        first = sum(s['x'] for s in spots[:4]) / 4
        second = sum(s['x'] for s in spots[4:]) / 4
        self.assertGreaterEqual(abs(first - second), 8)

    def test_same_input_same_spots(self):
        self.assertEqual(self.layout(6), self.layout(6))

    def test_height_fits_ten_letters_above_the_console(self):
        # 360x740: rail top 347 + two slot rows (114) + 4px gap + bench
        # + 4px gap + the console (324px wide, 972x175) + 22px safe area
        # must fit in 740 (BACKLOG B-114, DESIGN "Layout").
        console = 324 * 175 / 972
        self.assertLessEqual(347 + 114 + 4 + self.layout(10)['height'] + 4 + console + 22, 740)

    def test_third_row_sits_right_of_the_robot(self):
        # Rows from the third on are centred right of 40% of the bench
        # (the robot's head and shoulders end at about 36%).
        for n in (9, 10):
            spots = self.layout(n)['spots'][8:]
            self.assertTrue(all(s['x'] >= 0.4 * self.BENCH for s in spots), (n, spots))
        # rows one and two keep the stagger
        first, second = self.layout(10)['spots'][:4], self.layout(10)['spots'][4:8]
        self.assertGreaterEqual(abs(sum(s['x'] for s in first) - sum(s['x'] for s in second)) / 4, 8)

    def test_narrow_bench_puts_fewer_on_a_row(self):
        self.assertEqual(self.rows(self.layout(6, 250)), [3, 3])

    def test_zero_blocks_is_safe(self):
        self.assertEqual(self.layout(0), {'size': 52, 'spots': [], 'height': 0})


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
            "motionFor('twirl', false);"
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


class GalleryProgressTests(TestCase):
    """static/js/gallery.js themeProgress(): per-theme sticker count for
    the sticker book screen (BACKLOG B-112). Only words in the theme's
    list count; a missing or malformed theme entry is 0 / total."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'gallery.js'
    WORDS = [{'word': 'duck', 'image': '/d.svg'}, {'word': 'cat', 'image': '/c.svg'}, {'word': 'frog', 'image': '/f.svg'}]

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def progress(self, book, theme='animals', words=None):
        words = self.WORDS if words is None else words
        script = (
            f"const {{ themeProgress }} = await import('{self.MODULE.as_uri()}');"
            f"console.log(JSON.stringify(themeProgress({json.dumps(book)}, {json.dumps(theme)}, {json.dumps(words)})));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_counts_mastered_words_in_list_order(self):
        p = self.progress({'animals': ['frog', 'duck']})
        self.assertEqual((p['count'], p['total']), (2, 3))
        self.assertEqual([i['word'] for i in p['items']], ['duck', 'cat', 'frog'])
        self.assertEqual([i['mastered'] for i in p['items']], [True, False, True])
        self.assertEqual(p['items'][0]['image'], '/d.svg')

    def test_empty_book_or_missing_theme_is_zero_of_total(self):
        self.assertEqual(self.progress({})['count'], 0)
        p = self.progress({'transportation': ['bus']})
        self.assertEqual((p['count'], p['total']), (0, 3))
        self.assertFalse(any(i['mastered'] for i in p['items']))

    def test_sticker_for_a_word_not_in_the_theme_does_not_count(self):
        p = self.progress({'animals': ['duck', 'unicorn']})
        self.assertEqual((p['count'], p['total']), (1, 3))

    def test_malformed_theme_entry_is_ignored(self):
        self.assertEqual(self.progress({'animals': 'duck'})['count'], 0)
        self.assertEqual(self.progress({'animals': None})['count'], 0)

    def test_no_words_is_zero_of_zero(self):
        self.assertEqual(self.progress({'animals': ['duck']}, words=[]), {'count': 0, 'total': 0, 'items': []})


class TenLetterFitTests(TestCase):
    """BACKLOG B-114: at 360x740 every word up to 10 letters (two slot
    rows, three block rows) fits with the console (and its check dome)
    and the robot's head and shoulders without overlap. Positions are the
    CSS layout's: rail top at 44.5% of the 780px lab picture, 4px gaps,
    14px / 22px safe area, the console (972x175) at the bottom, inset 4px
    from each side of the safe area (324px wide, DESIGN "Layout"; the
    width is read from game.css), the dome as placed in game.css, the
    robot as in the v5 reference (92px wide, left edge at 7.4% of the
    console, 75px above it; the brass cap is the top 10px). The console's
    lower corners also clear the frame's rounded inner corners."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'layout.js'
    CSS = Path(__file__).resolve().parent.parent / 'static' / 'css' / 'game.css'
    UI = Path(__file__).resolve().parent.parent / 'static' / 'images' / 'ui'
    W, H, SIDE, BOTTOM, GAP = 360, 740, 14, 22, 4
    TILT = 2   # a block tilted up to 4 degrees reaches ~2px past its box

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def console_box(self):
        """(left, top, width, height) of the console at 360x740, from the
        `--console-w: calc(var(--scene-w) - Npx)` rule in game.css."""
        css = re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)
        rule = re.search(r'#screen-play \.console\s*{(.*?)}', css, flags=re.S).group(1)
        less = int(re.search(r'--console-w:\s*calc\(var\(--scene-w\)\s*-\s*(\d+)px\)', rule).group(1))
        self.assertIn('width: var(--console-w);', rule)
        self.assertIn('align-self: center;', rule)
        cw = self.W - less
        ch = cw * 175 / 972
        return (self.W - cw) / 2, self.H - self.BOTTOM - ch, cw, ch

    def test_console_is_inset_four_px_from_the_safe_area(self):
        left, top, cw, ch = self.console_box()
        self.assertEqual(cw, self.W - 2 * self.SIDE - 2 * 4)   # 324 at 360
        self.assertEqual(left, self.SIDE + 4)
        self.assertAlmostEqual(top + ch, self.H - self.BOTTOM)

    def layouts(self, count):
        bench = self.W - 2 * self.SIDE
        script = (
            f"import {{ slotLayout, blockLayout }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify([slotLayout({count}, {bench}), blockLayout({count}, {bench})]));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def keep_out(self):
        left, top, cw, ch = self.console_box()
        dome_w = cw * 0.254
        dome_cx, dome_cy = left + 0.815 * cw, top + 0.41 * ch
        dome_h = dome_w * 169 / 240
        robot_left = left + 0.074 * cw
        robot_top = top - 75
        return {
            'console': (left, top, left + cw, top + ch),
            'dome': (dome_cx - dome_w / 2, dome_cy - dome_h / 2, dome_cx + dome_w / 2, dome_cy + dome_h / 2),
            'robot cap': (robot_left + 18, robot_top, robot_left + 72, robot_top + 10),
            'robot head': (robot_left, robot_top + 10, robot_left + 92, top),
        }, top

    @staticmethod
    def overlap(a, b):
        return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

    def test_words_up_to_ten_letters_clear_the_console_dome_and_robot(self):
        zones, console_top = self.keep_out()
        rail_top = 0.445 * self.W * 2739 / 1264
        for n in range(1, 11):
            slots, blocks = self.layouts(n)
            rail_h = 2 * slots['pad'] + slots['rows'] * slots['size'] + (slots['rows'] - 1) * slots['gap']
            bench_top = rail_top + rail_h + self.GAP
            # the column fits the screen: the console is not pushed down
            self.assertLessEqual(bench_top + blocks['height'] + self.GAP, console_top, n)
            for s in blocks['spots']:
                x, y = self.SIDE + s['x'], bench_top + s['y']
                box = (x - self.TILT, y - self.TILT, x + blocks['size'] + self.TILT, y + blocks['size'] + self.TILT)
                for name, zone in zones.items():
                    self.assertFalse(self.overlap(box, zone), (n, name, box, zone))

    # Decodes an 8-bit RGBA, non-interlaced PNG with node's zlib and
    # returns its alpha channel (the two scene images are that format).
    PNG_ALPHA_JS = """
        import fs from 'node:fs';
        import zlib from 'node:zlib';
        function alphaOf(file) {
            const b = fs.readFileSync(file);
            let p = 8, w = 0, h = 0, kind = '';
            const idat = [];
            while (p < b.length) {
                const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
                const d = b.subarray(p + 8, p + 8 + len);
                if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); kind = d[8] + '/' + d[9] + '/' + d[12]; }
                if (type === 'IDAT') idat.push(d);
                p += 12 + len;
            }
            if (kind !== '8/6/0') throw new Error(file + ': not 8-bit RGBA non-interlaced');
            const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, px = Buffer.alloc(h * stride);
            for (let y = 0; y < h; y++) {
                const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
                for (let x = 0; x < stride; x++) {
                    const a = x >= 4 ? px[row + x - 4] : 0, up = y ? px[row - stride + x] : 0;
                    const c = y && x >= 4 ? px[row - stride + x - 4] : 0;
                    let v = raw[src + x];
                    if (f === 1) v += a;
                    else if (f === 2) v += up;
                    else if (f === 3) v += (a + up) >> 1;
                    else if (f === 4) {
                        const q = a + up - c, qa = Math.abs(q - a), qb = Math.abs(q - up), qc = Math.abs(q - c);
                        v += qa <= qb && qa <= qc ? a : qb <= qc ? up : c;
                    }
                    px[row + x] = v & 255;
                }
            }
            return { w, h, at: (x, y) => px[(Math.min(h - 1, Math.floor(y)) * w + Math.min(w - 1, Math.floor(x))) * 4 + 3] };
        }
    """

    def test_console_corners_clear_the_frames_inner_corners(self):
        # DESIGN "Layout": inset 4px from each side of the safe area, the
        # console's lower corners clear the frame's rounded inner corners.
        # At 360x740 no point of the console's body (alpha >= 50%) lies
        # under any part of the bezel (alpha > 0), frame.png drawn as the
        # CSS border-image (widths 29 26 38 28, slices 180 165 235 175,
        # stretched edges), sampled every 0.25px. (At 332px wide about
        # 33px² of the console is hidden, at 326px about 2px².)
        left, top, cw, ch = self.console_box()
        script = self.PNG_ALPHA_JS + f"""
            const frame = alphaOf({json.dumps(str(self.UI / 'frame.png'))});
            const con = alphaOf({json.dumps(str(self.UI / 'console.png'))});
            const W = {self.W}, H = {self.H};
            const B = [29, 26, 38, 28], S = [180, 165, 235, 175];   // top right bottom left
            const axis = (v, a, b, size, sa, sb, img) =>
                v < a ? v / a * sa
                : v >= size - b ? img - sb + (v - (size - b)) / b * sb
                : sa + (v - a) / (size - a - b) * (img - sa - sb);
            const bezel = (x, y) => (x >= B[3] && x < W - B[1] && y >= B[0] && y < H - B[2]) ? 0
                : frame.at(axis(x, B[3], B[1], W, S[3], S[1], frame.w), axis(y, B[0], B[2], H, S[0], S[2], frame.h));
            const left = {left}, top = {top}, cw = {cw}, ch = {ch}, step = 0.25;
            let hidden = 0;
            for (let y = top + step / 2; y < top + ch; y += step) {{
                for (let x = left + step / 2; x < left + cw; x += step) {{
                    const body = con.at((x - left) / cw * con.w, (y - top) / ch * con.h) >= 128;
                    if (body && bezel(x, y) > 0) hidden += step * step;
                }}
            }}
            console.log(JSON.stringify(hidden));
        """
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), 0)


class ConsoleMotionSpecTests(TestCase):
    """static/js/motion.js motionFor() for the console and the feedback
    (BACKLOG B-114, DESIGN "Controls and states", "Feedback"): wrong blocks
    wiggle ±6px in 300ms; the rail shakes ±4px in 200ms; the lost bulb
    flickers three times; the TV static lasts 150ms and the warm-white
    flash 200ms; revealed blocks fly in 120ms apart; reset blocks hop back
    in 300ms, 30ms apart. Reduced motion: opacity fades only."""

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

    def test_wrong_wiggle_and_rail_shake(self):
        w = self.motion('wiggle', False)
        self.assertEqual((w['distance'], w['duration']), (6, 0.3))
        r = self.motion('shake', False)
        self.assertEqual((r['distance'], r['duration']), (4, 0.2))
        for m in (w, r):
            self.assertNotIn('back', m['ease'])

    def test_bulb_flicker_tv_static_and_flash(self):
        self.assertEqual(self.motion('flicker', False)['flashes'], 3)
        self.assertLessEqual(self.motion('flicker', False)['duration'], 0.3)
        self.assertEqual(self.motion('tvStatic', False)['duration'], 0.15)
        self.assertEqual(self.motion('flash', False)['duration'], 0.2)

    def test_reveal_fly_in_and_reset_hop(self):
        f = self.motion('flyIn', False)
        self.assertEqual(f['stagger'], 0.12)
        self.assertLessEqual(f['duration'], 0.3)
        self.assertEqual(f['ease'], 'back.out(1.4)')   # lands like a snap into a slot
        h = self.motion('hop', False)
        self.assertEqual((h['duration'], h['stagger']), (0.3, 0.03))
        self.assertGreater(h['height'], 0)
        self.assertNotIn('back', h['ease'])

    def test_reduced_motion_is_fades_only(self):
        for kind in ('wiggle', 'shake', 'flicker', 'tvStatic', 'flash', 'flyIn', 'hop'):
            m = self.motion(kind, True)
            self.assertEqual((m['duration'], m['scale'], m['ease']), (0, 1, 'none'), kind)
            for key in ('distance', 'flashes', 'height'):
                self.assertEqual(m.get(key, 0), 0, (kind, key))
        for kind in ('wiggle', 'flicker', 'tvStatic', 'flash', 'flyIn', 'hop'):
            self.assertGreater(self.motion(kind, True)['fade'], 0, kind)
        self.assertEqual(self.motion('flyIn', True)['stagger'], 0.12)


class ControlsTests(TestCase):
    """static/js/controls.js: the console's states from state (BACKLOG
    B-114, DESIGN "Controls and states"). The dome is off until every slot
    is filled, ready then, pressed while held, and ready again after a
    correct answer or a reveal, when it means "next"; after a wrong check
    it stays off until a block moves. The lever works while blocks can
    move; the speaker is capped without word audio."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'controls.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        script = (
            f"const c = await import('{self.MODULE.as_uri()}');"
            "const cur = (status, placed, audio = '/a.mp3') => ({ word: 'cat', audio, status,"
            " placed: placed.split('').map((ch, i) => (ch === '-' ? null : { letter: ch, tileId: 't' + i })) });"
            "const out = (v) => console.log(JSON.stringify(v));"
            f"{body}"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_press_times(self):
        self.assertEqual(self.run_node("out(c.PRESS_MS);"), {'dome': 120, 'lever': 250})

    def test_dome_off_until_every_slot_is_filled_then_ready_to_check(self):
        self.assertEqual(
            self.run_node("out(['---', 'c--', 'ca-', 'cat', 'tac'].map((p) => [c.domeAction(cur('playing', p)), c.domeState(cur('playing', p), null)]));"),
            [[None, 'off'], [None, 'off'], [None, 'off'], ['check', 'ready'], ['check', 'ready']],
        )

    def test_dome_pressed_while_held(self):
        self.assertEqual(self.run_node("out([c.domeState(cur('playing', 'cat'), 'dome'), c.domeState(cur('playing', 'cat'), 'lever')]);"),
                         ['pressed', 'ready'])

    def test_after_wrong_the_dome_is_off_until_a_block_moves(self):
        self.assertEqual(self.run_node("out([c.domeAction(cur('wrong', 'tac')), c.domeState(cur('wrong', 'tac'), null)]);"),
                         [None, 'off'])

    def test_after_correct_or_reveal_the_dome_is_next(self):
        self.assertEqual(
            self.run_node("out(['correct', 'revealed'].map((s) => [c.domeAction(cur(s, 'cat')), c.domeState(cur(s, 'cat'), null)]));"),
            [['next', 'ready'], ['next', 'ready']],
        )

    def test_no_word_no_action(self):
        self.assertEqual(self.run_node("out([c.domeAction({ word: null, placed: [], status: 'playing' }), c.canReset({ word: null, status: 'playing' })]);"),
                         [None, False])

    def test_lever(self):
        self.assertEqual(
            self.run_node("out([c.leverState(null), c.leverState('lever'), c.leverState('dome'),"
                          " ...['playing', 'wrong', 'correct', 'revealed'].map((s) => c.canReset(cur(s, 'ca-')))]);"),
            ['up', 'down', 'up', True, True, False, False],
        )

    def test_speaker(self):
        self.assertEqual(
            self.run_node("out([c.speakerState(cur('playing', '---'), false), c.speakerState(cur('playing', '---'), true),"
                          " c.speakerState(cur('playing', '---', null), false), c.speakerState(cur('playing', '---', ''), true)]);"),
            ['off', 'on', 'cap', 'cap'],
        )


class ResetTransitionTests(TestCase):
    """static/js/drag.js returnAll() and afterMove(): the reset lever puts
    every placed block back on the bench; any block move after a wrong
    check reopens the word (BACKLOG B-114)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'drag.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        script = (
            f"const d = await import('{self.MODULE.as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            f"{body}"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_return_all_empties_the_slots_and_frees_every_block(self):
        current = {
            'word': 'cat', 'status': 'wrong',
            'tray': [{'id': 'a', 'letter': 't', 'used': True}, {'id': 'b', 'letter': 'a', 'used': True},
                     {'id': 'c', 'letter': 'c', 'used': False}],
            'placed': [{'letter': 't', 'tileId': 'a'}, {'letter': 'a', 'tileId': 'b'}, None],
        }
        after, before = self.run_node(f"const cur = {json.dumps(current)}; const before = JSON.stringify(cur);"
                                      "out([d.returnAll(cur), JSON.parse(before)]);")
        self.assertEqual(after['placed'], [None, None, None])
        self.assertEqual([t['used'] for t in after['tray']], [False, False, False])
        self.assertEqual([t['id'] for t in after['tray']], ['a', 'b', 'c'])   # start spots keep their order
        self.assertEqual(after['status'], 'playing')
        self.assertEqual(before, current)   # pure: the old state is untouched

    def test_after_move_reopens_only_a_wrong_check(self):
        self.assertEqual(self.run_node("out(['playing', 'wrong', 'correct', 'revealed'].map(d.afterMove));"),
                         ['playing', 'playing', 'correct', 'revealed'])


class ConsoleCssTests(TestCase):
    """game.css: the ready dome's glow pulses opacity 0.45 <-> 1, 1.2s
    ease-in-out, infinite, and glows steadily under reduced motion; the
    interim icon buttons are gone (BACKLOG B-114)."""

    CSS = Path(__file__).resolve().parent.parent / 'static' / 'css' / 'game.css'

    def css(self):
        return re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)

    def test_ready_pulse(self):
        css = self.css()
        self.assertIn('animation: dome-ready 1.2s ease-in-out infinite alternate;', css)
        frames = re.search(r'@keyframes dome-ready\s*{(.*?)}\s*}', css, flags=re.S).group(1)
        self.assertRegex(frames, r'from\s*{\s*opacity:\s*0\.45;')
        self.assertRegex(frames, r'to\s*{\s*opacity:\s*1;')

    def test_reduced_motion_glows_steadily(self):
        blocks = re.findall(r'@media \(prefers-reduced-motion: reduce\)\s*{(.*?)}\s*}', self.css(), flags=re.S)
        self.assertTrue(any('.is-ready .dome-ready' in b and 'animation: none' in b for b in blocks))

    def test_interim_buttons_are_gone(self):
        self.assertNotIn('icon-btn', self.css())


class CharacterTests(TestCase):
    """static/js/character.js: the robot's moment table and how a moment
    is picked from state (BACKLOG B-115, CHARACTER.md "Moment map" and
    "Presence"). One table maps each moment to pose, movement and sound;
    pose and movement change together, never more than once per 300ms;
    10s without input -> thinking, then sink, once per word; reduced
    motion swaps poses only."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'character.js'
    UI = Path(__file__).resolve().parent.parent / 'static' / 'images' / 'ui'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        # st(...) builds a play-screen state on the word "cat" (round 1,
        # three lives, nothing placed) with overrides; snap(...) is its
        # snapshot; moments(a, b) the moments from state a to state b.
        script = (
            f"const c = await import('{self.MODULE.as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            "const put = (s) => s.split('').map((ch, i) => (ch === '-' ? null : { letter: ch, tileId: 't' + i }));"
            "const st = (o = {}) => ({ screen: 'play', roundsStarted: 1, idleBeat: null, lastInput: 0, lives: 3,"
            " round: { index: 0, size: 5, results: [] }, current: { word: 'cat', status: 'playing', placed: put('---') }, ...o });"
            "const cur = (status, placed) => ({ word: 'cat', status, placed: put(placed) });"
            "const moments = (a, b) => c.momentsFor(c.snapshot(a), c.snapshot(b));"
            "const theme = { screen: 'theme', roundsStarted: 0, idleBeat: null, lives: 3,"
            " round: { index: 0, size: 5, results: [] }, current: { word: null, placed: [] } };"
            f"{body}"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_the_table_is_the_moment_map(self):
        steps = lambda *s: [{'pose': p, 'move': m} for p, m in s]
        self.assertEqual(self.run_node("out(c.MOMENTS);"), {
            'roundStart': {'steps': steps(('idle', 'pop')), 'sound': None},
            'picture': {'steps': steps(('thinking', 'none')), 'sound': None},
            'blockPlaced': {'steps': steps(('idle', 'none')), 'sound': 'swipe'},
            'filledEarly': {'steps': steps(('excited', 'none')), 'sound': None},
            'filled': {'steps': steps(('idle', 'none')), 'sound': None},
            'kidIdle': {'steps': steps(('thinking', 'none'), ('thinking', 'sink')), 'sound': None},
            'wake': {'steps': steps(('idle', 'pop')), 'sound': None},
            'wrong': {'steps': steps(('confused', 'none')), 'sound': 'error'},
            'wrongPeek': {'steps': steps(('confused', 'peek')), 'sound': 'error'},
            'thirdMiss': {'steps': steps(('oops', 'none'), ('happy', 'none')), 'sound': 'error'},
            'correct': {'steps': steps(('excited', 'pop')), 'sound': 'correct'},
            'streak': {'steps': steps(('excited', 'doublePop')), 'sound': 'correct'},
            'roundEndGood': {'steps': steps(('happy', 'none')), 'sound': 'tada'},
            'roundEnd': {'steps': steps(('idle', 'none')), 'sound': 'tada'},
        })

    def test_every_pose_is_an_image_and_every_move_exists(self):
        poses, moves, used = self.run_node(
            "out([c.POSES, Object.keys(c.MOVES), Object.values(c.MOMENTS).flatMap((m) => m.steps)]);")
        for p in poses:
            self.assertTrue((self.UI / f'robot-{p}.png').exists(), p)
        for step in used:
            self.assertIn(step['pose'], poses)
            self.assertIn(step['move'], moves)

    def test_round_start_pops_him_up_then_the_picture_makes_him_think(self):
        self.assertEqual(self.run_node(
            "out([moments(theme, st()), moments({ ...st(), screen: 'round-end' }, st({ roundsStarted: 2 })),"
            " moments(st(), st({ roundsStarted: 2 })), c.stepsFor(['roundStart', 'picture'])]);"), [
            ['roundStart', 'picture'], ['roundStart', 'picture'], ['roundStart', 'picture'],
            [{'pose': 'idle', 'move': 'pop'}, {'pose': 'thinking', 'move': 'none'}],
        ])

    def test_next_word_is_a_new_picture(self):
        self.assertEqual(self.run_node(
            "out(moments(st({ current: cur('correct', 'cat') }),"
            " st({ round: { index: 1, size: 5, results: [{ word: 'cat', correct: true }] }, current: { ...cur('playing', '---'), word: 'dog' } })));"),
            ['picture'])

    def test_blocks_moving_and_the_slots_filling(self):
        # any block move -> idle; all slots filled -> excited (pointing at
        # the dome) in the first two rounds, idle from the third
        self.assertEqual(self.run_node(
            "out([moments(st(), st({ current: cur('playing', 'c--') })),"
            " moments(st({ current: cur('playing', 'ca-') }), st({ current: cur('playing', 'c--') })),"
            " moments(st({ current: cur('wrong', 'tac') }), st({ current: cur('playing', 'ta-') })),"
            " moments(st({ current: cur('playing', 'ca-') }), st({ current: cur('playing', 'cat') })),"
            " moments(st({ roundsStarted: 2, current: cur('playing', 'ca-') }), st({ roundsStarted: 2, current: cur('playing', 'cat') })),"
            " moments(st({ roundsStarted: 3, current: cur('playing', 'ca-') }), st({ roundsStarted: 3, current: cur('playing', 'cat') }))]);"),
            [['blockPlaced'], ['blockPlaced'], ['blockPlaced'], ['filledEarly'], ['filledEarly'], ['filled']])

    def test_wrong_check_confused_and_a_peek_on_the_last_bulb(self):
        self.assertEqual(self.run_node(
            "out([moments(st({ current: cur('playing', 'tac') }), st({ lives: 2, current: cur('wrong', 'tac') })),"
            " moments(st({ lives: 2, current: cur('playing', 'act') }), st({ lives: 1, current: cur('wrong', 'act') }))]);"),
            [['wrong'], ['wrongPeek']])

    def test_third_miss_oops_then_happy(self):
        self.assertEqual(self.run_node(
            "out(moments(st({ lives: 1, current: cur('playing', 'tca') }), st({ lives: 0, current: cur('revealed', 'cat') })));"),
            ['thirdMiss'])

    def test_correct_and_three_in_a_row(self):
        self.assertEqual(self.run_node(
            "out([moments(st({ current: cur('playing', 'cat') }), st({ current: cur('correct', 'cat'), round: { index: 0, size: 5, results: [{ correct: true }] } })),"
            " moments(st({ round: { index: 2, size: 5, results: [{ correct: false }, { correct: true }] }, current: cur('playing', 'cat') }),"
            "         st({ round: { index: 2, size: 5, results: [{ correct: false }, { correct: true }, { correct: true }] }, current: cur('correct', 'cat') })),"
            " moments(st({ round: { index: 2, size: 5, results: [{ correct: true }, { correct: true }] }, current: cur('playing', 'cat') }),"
            "         st({ round: { index: 2, size: 5, results: [{ correct: true }, { correct: true }, { correct: true }] }, current: cur('correct', 'cat') })),"
            " moments(st({ round: { index: 4, size: 5, results: [{ correct: false }, { correct: true }, { correct: true }, { correct: true }] }, current: cur('playing', 'cat') }),"
            "         st({ round: { index: 4, size: 5, results: [{ correct: false }, { correct: true }, { correct: true }, { correct: true }, { correct: true }] }, current: cur('correct', 'cat') }))]);"),
            [['correct'], ['correct'], ['streak'], ['streak']])

    def test_idle_sinks_him_once_and_input_pops_him_back(self):
        self.assertEqual(self.run_node(
            "out([moments(st(), st({ idleBeat: 'sunk' })), moments(st({ idleBeat: 'sunk' }), st({ idleBeat: 'over' })),"
            " c.stepsFor(['kidIdle']).map((s) => s.pose + '/' + s.move), c.stepsFor(['wake'])]);"),
            [['kidIdle'], ['wake'], ['thinking/none', 'thinking/sink'], [{'pose': 'idle', 'move': 'pop'}]])

    def test_round_end_happy_or_idle_never_sad(self):
        self.assertEqual(self.run_node(
            "const end = (n) => ({ ...st(), screen: 'round-end', round: { index: 4, size: 5,"
            " results: [0, 1, 2, 3, 4].map((i) => ({ correct: i < n })) } });"
            "out([5, 4, 3, 1, 0].map((n) => moments(st(), end(n))).concat([moments(end(5), end(5))]));"),
            [['roundEndGood'], ['roundEndGood'], ['roundEnd'], ['roundEnd'], ['roundEnd'], []])

    def test_a_re_render_in_the_same_state_is_no_moment(self):
        self.assertEqual(self.run_node(
            "out([moments(st(), st()), moments(st({ current: cur('wrong', 'tac'), lives: 2 }), st({ current: cur('wrong', 'tac'), lives: 2 })),"
            " moments(theme, theme), moments(st({ idleBeat: 'over' }), st({ idleBeat: 'over' })),"
            " moments(st({ pressed: null }), st({ pressed: 'dome', speaking: true }))]);"),
            [[], [], [], [], []])

    def test_changes_are_at_least_300ms_apart(self):
        self.assertEqual(self.run_node(
            "out([c.CHANGE_MS, c.stepDelays(1, Infinity), c.stepDelays(2, 1000), c.stepDelays(2, 100), c.stepDelays(1, 0)]);"),
            [300, [0], [0, 300], [200, 500], [300]])

    def test_moves(self):
        moves = self.run_node("out(c.MOVES);")
        total = lambda m: sum(s['duration'] for s in m)
        # pop: rises ~20px in 180ms, ease-out, then settles back
        self.assertEqual(moves['pop'][0], {'y': -20, 'duration': 0.18, 'ease': 'power2.out'})
        self.assertEqual(moves['pop'][-1]['y'], 0)
        self.assertLessEqual(total(moves['pop']), 0.3)
        self.assertEqual(moves['doublePop'], moves['pop'] * 2)
        # sink: 400ms, down until only the top of his head shows (14 of 75px)
        self.assertEqual([(s['y'], s['duration']) for s in moves['sink']], [(61, 0.4)])
        # peek: only the eyes above the edge for 600ms, then normal
        self.assertEqual([s['y'] for s in moves['peek']], [18, 18, 0])
        self.assertEqual(moves['peek'][1]['duration'], 0.6)
        # a vertical slide only; everything but the sink ends at rest
        for name, segs in moves.items():
            self.assertEqual(set(k for s in segs for k in s), {'y', 'duration', 'ease'}, name)
            self.assertNotIn('back', ' '.join(s['ease'] for s in segs), name)
            if name != 'sink':
                self.assertEqual(segs[-1]['y'], 0, name)

    def test_reduced_motion_swaps_poses_only(self):
        self.assertEqual(self.run_node("out(Object.keys(c.MOVES).map((k) => c.moveFor(k, true)));"),
                         [[{'y': 0, 'duration': 0, 'ease': 'none'}]] * 5)
        self.assertEqual(self.run_node("out(c.moveFor('pop', false));"), self.run_node("out(c.MOVES.pop);"))

    def test_idle_wait_is_10s_from_the_last_input_once_per_word(self):
        self.assertEqual(self.run_node(
            "out([c.IDLE_MS, c.idleWait(st({ lastInput: 1000 }), 1000), c.idleWait(st({ lastInput: 1000 }), 8000),"
            " c.idleWait(st({ lastInput: 1000 }), 11000), c.idleWait(st({ lastInput: 1000 }), 50000),"
            " c.idleWait(st({ idleBeat: 'sunk' }), 50000), c.idleWait(st({ idleBeat: 'over' }), 50000),"
            " c.idleWait({ ...st(), screen: 'round-end' }, 50000), c.idleWait(theme, 50000)]);"),
            [10000, 10000, 3000, 0, 0, None, None, None, None])


class RobotLayoutTests(TestCase):
    """The robot behind the console (BACKLOG B-115, DESIGN "Layout",
    CHARACTER "Presence"): inside .console, drawn below the console, the
    rail and the bench blocks; head and shoulders (75px) above the
    console's left third; words of up to six letters leave room for his
    20px pop-up, longer ones put blocks over him (z-order)."""

    ROOT = Path(__file__).resolve().parent.parent
    CSS = ROOT / 'static' / 'css' / 'game.css'
    UI = ROOT / 'static' / 'images' / 'ui'
    LAYOUT = ROOT / 'static' / 'js' / 'layout.js'

    def css(self):
        return re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)

    def rule(self, selector):
        return re.search(re.escape(selector) + r'\s*{(.*?)}', self.css(), flags=re.S).group(1)

    def test_robot_is_inside_the_console_with_every_pose(self):
        html = self.client.get('/').content.decode()
        console = html.index('<div class="console">')
        robot = html.index('<div class="robot')
        self.assertLess(console, robot)
        self.assertLess(robot, html.index('class="console-body"'))
        for pose in ('idle', 'thinking', 'confused', 'excited', 'happy', 'oops'):
            self.assertIn(f'/static/images/ui/robot-{pose}.png', html[robot:html.index('class="console-body"')], pose)

    def test_robot_is_drawn_below_the_console_rail_and_blocks(self):
        # z-index -1 inside #screen-play's stacking context: above the lab
        # picture, below every block, the rail and the console. The console
        # must not be a stacking context of its own, or he would be lifted
        # above the bench with it.
        self.assertIn('isolation: isolate;', self.rule('#screen-play'))
        robot = self.rule('#screen-play .robot')
        self.assertIn('z-index: -1;', robot)
        self.assertIn('pointer-events: none;', robot)
        self.assertIn('overflow: hidden;', robot)
        console = self.rule('#screen-play .console')
        for prop in ('z-index', 'transform', 'filter', 'opacity', 'isolation', 'will-change', 'contain'):
            self.assertNotIn(prop, console, prop)
        for sel in ('.letter-boxes', '.letter-tray', '.block-spot', '.draggable-letter'):
            self.assertNotRegex(self.rule(sel), r'z-index:\s*-', sel)

    def geometry(self):
        """Per pose (sprite width, visor centre x) from game.css, and the
        numbers the CSS places him with (checked to be there)."""
        css = self.css()
        for decl in ('--s: calc(var(--rpx) * 120 / 330);', 'top: calc((130 - 75) * var(--rpx));',
                     'height: calc(120 * var(--rpx));', 'left: calc(72.6 * var(--rpx) - var(--vx) * var(--s));',
                     '--rpx: calc(var(--console-w) / 324);', 'bottom: 5%;'):
            self.assertIn(decl, css)
        poses = dict((p, (int(w), int(v))) for p, w, v in re.findall(
            r'\.robot-body \.robot-(\w+)\s*{\s*--sw:\s*(\d+);\s*--vx:\s*(\d+);\s*}', css))
        self.assertEqual(set(poses), {'idle', 'thinking', 'confused', 'excited', 'happy', 'oops'})
        return poses

    def test_head_and_shoulders_show_and_short_words_leave_room_for_the_pop(self):
        # At 360x740: the console is 324px wide at x 18 (TenLetterFitTests),
        # top 659.7. Each pose is 120px tall, its top 75px above the
        # console, its visor centre 72.6px right of the console's left
        # edge. Checked on the sprites' pixels (alpha >= 50%), above the
        # console only (below it he is hidden):
        # - he shows down to the console edge (no gap: head and shoulders)
        #   and stays inside his clip window (x 18-178) and the console's
        #   left half;
        # - at rest he is clear of every block of every word (1-10
        #   letters) and of the rail;
        # - at the top of a pop (20px up) he is clear of every block of a
        #   1-6 letter word and of the rail of any word; 7-10 letter words
        #   do reach him, which is why he is drawn under the blocks.
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        poses = self.geometry()
        fit = TenLetterFitTests()
        left, top, cw, ch = fit.console_box()
        bench = fit.W - 2 * fit.SIDE
        rail_top = 0.445 * fit.W * 2739 / 1264
        script = TenLetterFitTests.PNG_ALPHA_JS + f"""
            import {{ slotLayout, blockLayout }} from '{self.LAYOUT.as_uri()}';
            const poses = {json.dumps(poses)}, UI = {json.dumps(str(self.UI))};
            const L = {left}, TOP = {top}, BENCH = {bench}, RAIL = {rail_top}, SIDE = {fit.SIDE}, GAP = {fit.GAP}, TILT = {fit.TILT};
            const s = 120 / 330, out = {{}};
            const words = [];
            for (let n = 1; n <= 10; n++) {{
                const sl = slotLayout(n, BENCH), bl = blockLayout(n, BENCH);
                const railBottom = RAIL + 2 * sl.pad + sl.rows * sl.size + (sl.rows - 1) * sl.gap;
                const benchTop = railBottom + GAP;
                words.push({{ n, railBottom, blocks: bl.spots.map((p) => [SIDE + p.x - TILT, benchTop + p.y - TILT,
                    SIDE + p.x + bl.size + TILT, benchTop + p.y + bl.size + TILT]) }});
            }}
            for (const [pose, [sw, vx]] of Object.entries(poses)) {{
                const img = alphaOf(UI + '/robot-' + pose + '.png');
                const x0 = L + 72.6 - vx * s;
                const r = {{ minX: Infinity, maxX: -Infinity, lowest: -Infinity, rest: {{}}, pop: {{}}, rail: 0 }};
                for (let sy = 0; sy < img.h; sy++) {{
                    for (let sx = 0; sx < img.w; sx++) {{
                        if (img.at(sx, sy) < 128) continue;
                        const x = x0 + (sx + 0.5) * s, yRest = TOP - 75 + (sy + 0.5) * s;
                        if (yRest >= TOP) continue;
                        r.minX = Math.min(r.minX, x); r.maxX = Math.max(r.maxX, x); r.lowest = Math.max(r.lowest, yRest);
                        for (const [at, y] of [['rest', yRest], ['pop', yRest - 20]]) {{
                            for (const w of words) {{
                                if (y < w.railBottom) r.rail++;
                                if (w.blocks.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) r[at][w.n] = (r[at][w.n] || 0) + 1;
                            }}
                        }}
                    }}
                }}
                out[pose] = r;
            }}
            console.log(JSON.stringify(out));
        """
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        for pose, r in json.loads(result.stdout).items():
            self.assertGreater(r['lowest'], top - 1, pose)                  # shows down to the console edge
            self.assertGreaterEqual(r['minX'], left, pose)                   # inside the clip window
            self.assertLessEqual(r['maxX'], left + 160, pose)
            self.assertLessEqual(r['maxX'], left + cw / 2, pose)              # the console's left half
            self.assertEqual(r['rail'], 0, pose)                              # never reaches the rail
            self.assertEqual(r['rest'], {}, pose)                             # at rest, clear of all blocks
            for n in range(1, 7):
                self.assertNotIn(str(n), r['pop'], (pose, n))                # room for the pop-up
        # the reason for the z-order: the second row of a 7-10 letter word
        # is in the way of the pop-up
        self.assertEqual(sorted(json.loads(result.stdout)['idle']['pop'], key=int), ['7', '8', '9', '10'])
