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

    def test_interim_screens_have_no_english_and_icon_buttons(self):
        # BACKLOG B-116, DESIGN "Words on screen": no text in the markup of
        # the theme, round-end and sticker book screens (main.js and
        # gallery.js add only the words and numbers); the header shows only
        # the logo; every button there is an icon with its word only in
        # aria-label. The protected ids stay.
        html = self.client.get('/').content.decode()

        def visible_text(chunk):
            chunk = re.sub(r'<!--.*?-->', '', chunk, flags=re.S)
            return re.sub(r'<[^>]+>', ' ', chunk)

        header = html[html.index('<header'):html.index('</header>')]
        self.assertEqual(''.join(visible_text(header).split()), 'flip')
        screens = (html[html.index('<div id="screen-theme"'):html.index('<div id="screen-play"')]
                   + html[html.index('<div id="screen-round-end"'):html.index('<div class="frame"')])
        self.assertNotRegex(visible_text(screens), r'[A-Za-z]')
        for id_ in ('stickers-btn', 'play-again-btn', 'themes-btn', 'gallery-back-btn'):
            m = re.search(rf'<button id="{id_}"[^>]*aria-label="[^"]+"[^>]*>(.*?)</button>', html, flags=re.S)
            self.assertIsNotNone(m, id_)
            self.assertIn('<svg', m.group(1), id_)
        for id_ in ('round-stars', 'round-score', 'round-new', 'round-words',
                    'gallery-empty', 'gallery-themes', 'theme-buttons'):
            self.assertIn(f'id="{id_}"', html, id_)


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

    def test_remove_takes_out_only_that_word_and_drops_an_empty_theme(self):
        # BACKLOG B-201: a round left with the back button takes back the
        # stickers it added; the rest of the book stays
        self.assertEqual(
            self.run_node(
                "const a = s.remove('animals', 'duck'); const b = s.remove('animals', 'duck');"
                "const c = s.remove('animals', 'horse'); const d = s.remove('transportation', 'bus');"
                "const e = s.remove('', 'cat'); const f = s.remove('animals');"
                "out([a, b, c, d, e, f, s.load(), JSON.parse(raw())]);",
                seed='{"animals": ["cat", "duck"], "transportation": ["bus"]}'),
            [True, False, False, True, False, False, {'animals': ['cat']}, {'animals': ['cat']}],
        )
        # nothing is written when the word was not in the book
        self.assertEqual(self.run_node("out([s.remove('animals', 'duck'), raw()]);"), [False, None])


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


class FlapsTests(TestCase):
    """static/js/flaps.js renderFlaps(): a number like "4 / 5" as one
    split-flap per character, spaces dropped, the slash on a narrower
    flap, the full text on aria-label (round-end score and sticker book
    counts, BACKLOG B-116). Run in node against a minimal fake DOM."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'flaps.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def flaps(self, text):
        script = (
            "globalThis.document = { createElement: () => ({ className: '', textContent: '' }) };"
            "const el = { attrs: {}, children: [],"
            " set innerHTML(v) { this.children = []; },"
            " setAttribute(k, v) { this.attrs[k] = v; },"
            " appendChild(c) { this.children.push(c); } };"
            f"const {{ renderFlaps }} = await import('{self.MODULE.as_uri()}');"
            # twice: a re-render replaces the flaps instead of adding more
            f"renderFlaps(el, {json.dumps(text)}); renderFlaps(el, {json.dumps(text)});"
            "console.log(JSON.stringify({ label: el.attrs['aria-label'],"
            " flaps: el.children.map((c) => [c.className, c.textContent]) }));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_one_flap_per_character_with_a_narrow_slash(self):
        r = self.flaps('4 / 5')
        self.assertEqual(r['label'], '4 / 5')
        self.assertEqual(r['flaps'], [['flap', '4'], ['flap flap-slash', '/'], ['flap', '5']])

    def test_two_digit_total(self):
        r = self.flaps('3 / 14')
        self.assertEqual([t for _, t in r['flaps']], ['3', '/', '1', '4'])


class InterimScreensCssTests(TestCase):
    """game.css for the interim screens (DESIGN "Other screens
    (interim)", BACKLOG B-116): the lab blurred 6px and darkened 40% as
    backdrop, the same frame on every screen, cream panels with a brass
    border, icon buttons at least 48px; the round-end and sticker book
    renders add no English."""

    STATIC = Path(__file__).resolve().parent.parent / 'static'

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.STATIC / 'css' / 'game.css').read_text(), flags=re.S)

    def rules(self, selector):
        # bodies of every rule whose selector list has `selector` on a line
        # of its own (alone or as the last of a list)
        pattern = rf'(?:^|\n){re.escape(selector)}\s*{{([^}}]*)}}'
        return ''.join(re.findall(pattern, self.css()))

    def test_backdrop_is_the_lab_blurred_and_darkened(self):
        backdrop = self.rules('body::before')
        self.assertIn('url(../images/ui/bg-lab.jpg)', backdrop)
        self.assertIn('filter: blur(6px) brightness(60%);', backdrop)
        self.assertIn('position: fixed;', backdrop)
        self.assertIn('display: none;', self.rules('body[data-screen="play"]::before'))

    def test_frame_shows_on_every_screen(self):
        self.assertIn('border-image: url(../images/ui/frame.png) 180 165 235 175;', self.rules('.frame'))
        self.assertNotIn('display: none', self.rules('.frame'))
        self.assertNotRegex(self.css(), r'\]\s*\.frame\s*{')

    def test_panels_are_cream_with_a_brass_border(self):
        panel = self.rules('.panel-btn')
        self.assertIn('border: 3px solid var(--brass);', panel)
        self.assertRegex(panel, r'background: linear-gradient\([^;]*var\(--cream-hi\)[^;]*var\(--cream\)')
        self.assertIn('.panel,\n.panel-btn {', self.css())

    def test_icon_buttons_are_at_least_48px(self):
        btn = self.rules('.panel-btn')
        width = int(re.search(r'\bwidth: (\d+)px;', btn).group(1))
        height = int(re.search(r'\bheight: (\d+)px;', btn).group(1))
        self.assertGreaterEqual(min(width, height), 48)

    def test_renders_write_no_english_labels(self):
        for name in ('main.js', 'gallery.js'):
            src = (self.STATIC / 'js' / name).read_text()
            self.assertNotIn('New stickers', src, name)
            self.assertNotIn('capitalise(theme.name)', src, name)


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

    def test_speaker_action_per_level(self):
        # BACKLOG B-203: easy plays the word at any time; normal and hard
        # hold it back ('locked') until the word is answered (correct or
        # revealed), then play it; no audio file: nothing (capped). A
        # round level that is not a level (null between rounds) reads as
        # easy (level.js levelRules).
        self.assertEqual(
            self.run_node(
                "const st = ['playing', 'wrong', 'correct', 'revealed'];"
                "out(['easy', 'normal', 'hard', null, 'bogus'].map((lv) => st.map((s) => c.speakerAction(cur(s, 'ca-'), lv))));"),
            [
                ['word'] * 4,
                ['locked', 'locked', 'word', 'word'],
                ['locked', 'locked', 'word', 'word'],
                ['word'] * 4,
                ['word'] * 4,
            ],
        )
        self.assertEqual(
            self.run_node(
                "out([...['easy', 'normal', 'hard'].flatMap((lv) => [c.speakerAction(cur('playing', '---', null), lv),"
                " c.speakerAction(cur('correct', 'cat', ''), lv)]),"
                " c.speakerAction({ word: null, audio: '/a.mp3', status: 'playing', placed: [] }, 'normal'), c.speakerAction(null, 'easy')]);"),
            [None] * 8,
        )

    def test_a_held_back_speaker_looks_the_same(self):
        # no lock icon: speakerState does not depend on the level
        self.assertEqual(
            self.run_node("out([c.speakerState(cur('playing', '---'), false), c.speakerState(cur('wrong', 'tac'), false),"
                          " c.speakerAction(cur('playing', '---'), 'hard')]);"),
            ['off', 'off', 'locked'],
        )
        src = self.MODULE.read_text()
        body = src[src.index('export function speakerState'):src.index('export function speakerAction')]
        self.assertNotIn('level', re.sub(r'//[^\n]*', '', body))


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
            'blockReturned': {'steps': steps(('idle', 'none')), 'sound': None},
            'filledEarly': {'steps': steps(('excited', 'none')), 'sound': 'swipe'},
            'filled': {'steps': steps(('idle', 'none')), 'sound': 'swipe'},
            'kidIdle': {'steps': steps(('thinking', 'none'), ('thinking', 'sink')), 'sound': None},
            'wake': {'steps': steps(('idle', 'pop')), 'sound': None},
            'wrong': {'steps': steps(('confused', 'none')), 'sound': 'error'},
            'wrongPeek': {'steps': steps(('confused', 'peek')), 'sound': 'error'},
            'thirdMiss': {'steps': steps(('oops', 'none'), ('happy', 'none')), 'sound': 'error'},
            'correct': {'steps': steps(('excited', 'pop')), 'sound': 'correct'},
            'streak': {'steps': steps(('excited', 'doublePop')), 'sound': 'correct'},
            'roundEndGood': {'steps': steps(('happy', 'none')), 'sound': 'tada'},
            'roundEnd': {'steps': steps(('idle', 'none')), 'sound': 'tada'},
            'speakerLocked': {'steps': steps(('confused', 'shake')), 'sound': 'locked'},
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
        # a block into a slot -> blockPlaced, back to the bench ->
        # blockReturned (idle both); all slots filled -> excited (pointing
        # at the dome) in the first two rounds, idle from the third
        self.assertEqual(self.run_node(
            "out([moments(st(), st({ current: cur('playing', 'c--') })),"
            " moments(st({ current: cur('playing', 'ca-') }), st({ current: cur('playing', 'c--') })),"
            " moments(st({ current: cur('wrong', 'tac') }), st({ current: cur('playing', 'ta-') })),"
            " moments(st({ current: cur('playing', 'ca-') }), st({ current: cur('playing', 'cat') })),"
            " moments(st({ roundsStarted: 2, current: cur('playing', 'ca-') }), st({ roundsStarted: 2, current: cur('playing', 'cat') })),"
            " moments(st({ roundsStarted: 3, current: cur('playing', 'ca-') }), st({ roundsStarted: 3, current: cur('playing', 'cat') }))]);"),
            [['blockPlaced'], ['blockReturned'], ['blockReturned'], ['filledEarly'], ['filledEarly'], ['filled']])
        self.assertEqual(self.run_node("out([c.stepsFor(['blockPlaced']), c.stepsFor(['blockReturned'])]);"),
                         [[{'pose': 'idle', 'move': 'none'}]] * 2)

    def test_a_block_into_a_slot_is_placed_one_leaving_only_is_returned(self):
        # BACKLOG B-108: the swipe moment is a block going into a slot (a
        # slot now holds a block it did not hold before), also when it
        # swaps out the one there or comes from another slot; a block
        # back to the bench (tap, drag) or every block sent back by the
        # reset lever is blockReturned. Tile ids are given per slot.
        self.assertEqual(self.run_node(
            "const at = (ids) => ids.map((id) => (id ? { letter: 'x', tileId: id } : null));"
            "const s = (ids, o = {}) => st({ current: { word: 'cat', status: 'playing', placed: at(ids) }, ...o });"
            "out([moments(s([null, null, null]), s([null, 't2', null])),"     # bench -> slot 2
            " moments(s(['t1', null, null]), s([null, null, 't1'])),"          # slot 1 -> slot 3
            " moments(s(['t1', 't2', null]), s(['t3', 't2', null])),"          # t3 swaps t1 out
            " moments(s(['t1', 't2', null]), s(['t1', null, null])),"          # t2 back to the bench
            " moments(s(['t1', 't2', null], { pressed: null }), s([null, null, null], { pressed: 'lever' })),"   # the lever
            " moments(s(['t1', 't2', 't3']), s(['t1', null, 't3'])),"          # out of a full rail
            " moments(s(['t1', 't2', null]), s(['t1', 't2', 't3'])),"          # the last slot
            " c.blockEntered('t1,-,-', 't1,t2,-'), c.blockEntered('t1,t2,-', 't1,-,-'), c.blockEntered('t1,t2,t3', '-,-,-'),"
            " c.blockEntered('t1,t2,-', 't2,t1,-'), c.blockEntered('', '')]);"),
            [['blockPlaced'], ['blockPlaced'], ['blockPlaced'], ['blockReturned'], ['blockReturned'],
             ['blockReturned'], ['filledEarly'], True, False, False, True, False])

    def test_which_moments_sound_which_clip(self):
        # BACKLOG B-108: the robot's clips are MOMENTS[moment].sound, read
        # through soundsFor (audio.js plays them): swipe when a block goes
        # into a slot, the last one too; error on a wrong check and on the
        # reveal; correct on a correct check (and a streak); tada when the
        # round-end screen is shown; nothing else.
        sounds = self.run_node("out(Object.fromEntries(Object.keys(c.MOMENTS).map((m) => [m, c.soundsFor([m])])));")
        self.assertEqual(sounds, {
            'roundStart': [], 'picture': [], 'blockPlaced': ['swipe'], 'blockReturned': [],
            'filledEarly': ['swipe'], 'filled': ['swipe'], 'kidIdle': [], 'wake': [],
            'wrong': ['error'], 'wrongPeek': ['error'], 'thirdMiss': ['error'],
            'correct': ['correct'], 'streak': ['correct'], 'roundEndGood': ['tada'], 'roundEnd': ['tada'],
            'speakerLocked': ['locked'],
        })
        self.assertEqual(self.run_node("out([c.soundsFor(['roundStart', 'picture']), c.soundsFor([])]);"), [[], []])
        self.assertEqual(self.run_node(
            "const used = new Set(Object.values(c.MOMENTS).map((m) => m.sound).filter(Boolean)); out([...used].sort());"),
            ['correct', 'error', 'locked', 'swipe', 'tada'])

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

    def test_each_tap_on_a_held_back_speaker_is_a_confused_no(self):
        # BACKLOG B-203: main.js counts each tap on the speaker while it
        # holds the word back (state.lockedTaps); every change of the count
        # on the word is the moment speakerLocked (confused, a small
        # head-shake, the 'locked' clip), the second tap too; a re-render
        # is none. A sunk robot first wakes (the tap's pointerdown), then
        # shakes his head (its click).
        self.assertEqual(self.run_node(
            "out([moments(st({ lockedTaps: 0 }), st({ lockedTaps: 1 })), moments(st({ lockedTaps: 1 }), st({ lockedTaps: 2 })),"
            " moments(st({ lockedTaps: 2 }), st({ lockedTaps: 2 })), moments(st(), st({ lockedTaps: 0 })),"
            " moments(st({ lockedTaps: 3, current: cur('wrong', 'tac'), lives: 2 }), st({ lockedTaps: 4, current: cur('wrong', 'tac'), lives: 2 })),"
            " moments(st({ lockedTaps: 4, current: cur('playing', 'ca-') }), st({ lockedTaps: 5, current: cur('playing', 'ca-') })),"
            " moments(st({ idleBeat: 'sunk', lockedTaps: 1 }), st({ idleBeat: 'over', lockedTaps: 1 })),"
            " moments(st({ idleBeat: 'over', lockedTaps: 1 }), st({ idleBeat: 'over', lockedTaps: 2 })),"
            " c.stepsFor(['speakerLocked']), c.soundsFor(['speakerLocked']),"
            " c.snapshot(st({ lockedTaps: 7 })).lockedTaps, c.snapshot(st()).lockedTaps, c.NONE.lockedTaps]);"),
            [['speakerLocked'], ['speakerLocked'], [], [], ['speakerLocked'], ['speakerLocked'],
             ['wake'], ['speakerLocked'], [{'pose': 'confused', 'move': 'shake'}], ['locked'], 7, 0, 0])

    def test_a_new_word_or_round_wins_over_the_tap_count(self):
        # the count runs over the session; a new picture or round start is
        # what the robot plays when the word changed, and off the play
        # screen nothing
        self.assertEqual(self.run_node(
            "out([moments(st({ lockedTaps: 2, current: cur('correct', 'cat') }),"
            " st({ lockedTaps: 2, round: { index: 1, size: 5, results: [{ correct: true }] }, current: { ...cur('playing', '---'), word: 'dog' } })),"
            " moments({ ...theme, lockedTaps: 2 }, st({ roundsStarted: 2, lockedTaps: 2 })),"
            " moments({ ...theme, lockedTaps: 2 }, { ...theme, lockedTaps: 3 })]);"),
            [['picture'], ['roundStart', 'picture'], []])

    def test_the_head_shake_is_small_and_short(self):
        # his head and shoulders swing 4.5° each side of upright about the
        # neck (the 9° of design/reference/robot-puppet.html's shake,
        # centred), 90ms a swing, sine in-out, 540ms in all; he stays at
        # rest height and ends upright. Reduced motion: no turn at all.
        shake = self.run_node("out(c.MOVES.shake);")
        self.assertEqual([s['rotation'] for s in shake], [4.5, -4.5, 4.5, -4.5, 4.5, 0])
        self.assertEqual({s['y'] for s in shake}, {0})
        self.assertEqual({s['duration'] for s in shake}, {0.09})
        self.assertEqual({s['ease'] for s in shake}, {'sine.inOut'})
        self.assertAlmostEqual(sum(s['duration'] for s in shake), 0.54)
        self.assertEqual(self.run_node("out(c.moveFor('shake', true));"), [{'y': 0, 'duration': 0, 'ease': 'none'}])
        # no other move turns him
        moves = self.run_node("out(c.MOVES);")
        for name, segs in moves.items():
            if name != 'shake':
                self.assertFalse(any('rotation' in s for s in segs), name)

    def test_back_to_themes_is_no_moment_and_a_new_round_starts_fresh(self):
        # BACKLOG B-201: the play screen's back button (main.js onPlayBack
        # -> onThemes) leaves for the theme screen with the round cleared;
        # from any point of a word that is no moment (no pose, no sound),
        # and the next round he pops up as at any round start
        self.assertEqual(self.run_node(
            "const back = (s) => ({ ...s, screen: 'theme', theme: null, words: [], round: { index: 0, size: 5, results: [] },"
            " current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },"
            " pressed: null, speaking: false, idleBeat: null });"
            "const five = { index: 4, size: 5, results: [0, 1, 2, 3, 4].map(() => ({ correct: true })) };"
            "const from = [st(), st({ current: cur('playing', 'ca-') }), st({ current: cur('playing', 'tac') }),"
            " st({ current: cur('wrong', 'tac'), lives: 1 }), st({ current: cur('revealed', 'cat'), lives: 0 }),"
            " st({ current: cur('correct', 'cat'), round: five }), st({ idleBeat: 'sunk' }), st({ pressed: 'dome', current: cur('playing', 'cat') })];"
            "out([from.map((s) => moments(s, back(s))), from.map((s) => c.soundsFor(moments(s, back(s)))),"
            " moments(back(st()), st({ roundsStarted: 2 }))]);"), [
            [[]] * 8, [[]] * 8, ['roundStart', 'picture'],
        ])

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
        # a vertical slide only, except the speakerLocked head-shake (BACKLOG
        # B-203), which also turns him about the neck; everything but the
        # sink ends at rest
        for name, segs in moves.items():
            keys = {'y', 'duration', 'ease', 'rotation'} if name == 'shake' else {'y', 'duration', 'ease'}
            self.assertEqual(set(k for s in segs for k in s), keys, name)
            self.assertNotIn('back', ' '.join(s['ease'] for s in segs), name)
            if name != 'sink':
                self.assertEqual(segs[-1]['y'], 0, name)

    def test_reduced_motion_swaps_poses_only(self):
        self.assertEqual(self.run_node("out(Object.keys(c.MOVES).map((k) => c.moveFor(k, true)));"),
                         [[{'y': 0, 'duration': 0, 'ease': 'none'}]] * 6)
        self.assertEqual(self.run_node("out(c.moveFor('pop', false));"), self.run_node("out(c.MOVES.pop);"))

    def test_idle_wait_is_10s_from_the_last_input_once_per_word(self):
        self.assertEqual(self.run_node(
            "out([c.IDLE_MS, c.idleWait(st({ lastInput: 1000 }), 1000), c.idleWait(st({ lastInput: 1000 }), 8000),"
            " c.idleWait(st({ lastInput: 1000 }), 11000), c.idleWait(st({ lastInput: 1000 }), 50000),"
            " c.idleWait(st({ idleBeat: 'sunk' }), 50000), c.idleWait(st({ idleBeat: 'over' }), 50000),"
            " c.idleWait({ ...st(), screen: 'round-end' }, 50000), c.idleWait(theme, 50000)]);"),
            [10000, 10000, 3000, 0, 0, None, None, None, None])



class AudioTests(TestCase):
    """static/js/audio.js, the only place sounds play (BACKLOG B-108,
    DESIGN "Sound"): pools of the existing clips, URL-encoded; a random
    clip per play; one voice clip at a time, never over the target word;
    the robot's clips come from character.js's moment table; clips play
    through Web Audio, a gesture unlocks playback and nothing plays on
    load; `state.muted` in
    localStorage `flip.muted` means no sound at all."""

    ROOT = Path(__file__).resolve().parent.parent
    MODULE = ROOT / 'static' / 'js' / 'audio.js'
    STATE = ROOT / 'static' / 'js' / 'state.js'
    SOUNDS = ROOT / 'static' / 'sounds'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        # Fakes: Audio (the word clip; records play / pause on `log`),
        # fetch (records URLs in `fetched`; URLs in `missing` answer 404),
        # AudioContext (starts 'suspended'; decodeAudioData resolves; its
        # buffer sources log play / stop and are listed in `sources`), and
        # a document keeping its listeners in `listeners`. `a` is audio.js,
        # `S` state.js. `played()` are the files started so far (the silent
        # unlock sample left out), `kinds()` their pools, `sounding()` the pooled
        # files playing now, `clear()` empties the log, `settle()` lets the
        # downloads and decodes finish, `ready()` is init + one gesture +
        # settle. `st(...)` builds a play-screen state on "cat" (round 1,
        # three lives) with overrides; `put(ids)` its placed slots.
        script = (
            "const log = []; const listeners = {}; const made = []; const fetched = []; const missing = new Set();"
            "const ctxs = []; const sources = [];"
            "globalThis.Audio = class { constructor(src) { this.src = src; this.paused = true; this.on = {}; made.push(this); }"
            " addEventListener(t, fn) { this.on[t] = fn; }"
            " play() { this.paused = false; log.push({ op: 'play', src: this.src }); return Promise.resolve(); }"
            " pause() { this.paused = true; log.push({ op: 'pause', src: this.src }); } };"
            "globalThis.fetch = (url) => { fetched.push(url);"
            " return Promise.resolve({ ok: !missing.has(url), arrayBuffer: () => Promise.resolve({ url }) }); };"
            "globalThis.AudioContext = class { constructor() { this.state = 'suspended'; this.destination = {}; this.resumes = 0; ctxs.push(this); }"
            " resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }"
            " createBuffer() { return { url: 'silence' }; }"
            " decodeAudioData(data) { return Promise.resolve({ url: data.url }); }"
            " createBufferSource() { const s = { buffer: null, on: false, connect() {},"
            "   start() { s.on = true; log.push({ op: 'play', src: s.buffer.url }); },"
            "   stop() { if (!s.on) return; s.on = false; log.push({ op: 'stop', src: s.buffer.url }); } };"
            "   sources.push(s); return s; } };"
            "globalThis.document = { addEventListener(t, fn, c) { listeners[t] = fn; }, removeEventListener(t, fn, c) { delete listeners[t]; } };"
            f"const a = await import('{self.MODULE.as_uri()}');"
            f"const S = await import('{self.STATE.as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            "const tick = () => new Promise((r) => setTimeout(r, 0));"
            "const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };"
            "const ready = async () => { a.init(); listeners.pointerup(); await settle(); };"
            "const short = (src) => decodeURIComponent(src.replace('/static/sounds/', ''));"
            "const played = () => log.filter((e) => e.op === 'play' && e.src !== 'silence').map((e) => short(e.src));"
            "const kinds = () => played().map((f) => f.split('/')[0].replace('celebration', 'tada'));"
            "const sounding = () => sources.filter((s) => s.on && s.buffer.url !== 'silence').map((s) => short(s.buffer.url).split('/')[0]).sort();"
            "const clear = () => { log.length = 0; };"
            "const put = (ids) => ids.map((id) => (id ? { letter: 'x', tileId: id } : null));"
            "const st = (o = {}) => ({ screen: 'play', roundsStarted: 1, idleBeat: null, lastInput: 0, lives: 3, speaking: false,"
            " muted: false, pressed: null, round: { index: 0, size: 5, results: [] },"
            " current: { word: 'cat', status: 'playing', placed: put([null, null, null]) }, ...o });"
            f"{body}"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_pools_are_exactly_the_existing_clips(self):
        # correct/*, error/*, celebration/tada.mp3, swipe/*: every file on
        # disk and nothing else (a renamed clip fails here, not on a phone)
        files = self.run_node("out(a.FILES);")
        self.assertEqual(set(files), {'correct', 'error', 'tada', 'swipe', 'locked'})
        for kind, dir_ in (('correct', 'correct'), ('error', 'error'), ('swipe', 'swipe')):
            self.assertEqual(files[kind]['dir'], dir_)
            on_disk = sorted(f.name for f in (self.SOUNDS / dir_).iterdir() if f.is_file())
            self.assertEqual(sorted(files[kind]['names']), on_disk, kind)
        self.assertEqual(files['tada'], {'dir': 'celebration', 'names': ['tada.mp3']})
        self.assertTrue((self.SOUNDS / 'celebration' / 'tada.mp3').exists())
        # BACKLOG B-203: the held-back speaker's "hmm no", the existing clip
        self.assertEqual(files['locked'], {'dir': 'error', 'names': ['hmm no.mp3']})
        self.assertTrue((self.SOUNDS / 'error' / 'hmm no.mp3').exists())

    def test_urls_are_encoded(self):
        urls = self.run_node(
            "out([a.clipUrl('error', 'hmm no.mp3'), a.clipUrl('tada', 'tada.mp3'), a.poolUrls('swipe'),"
            " a.poolUrls('correct').filter((u) => / /.test(u)).length, a.clipUrl('correct', 'a b.mp3', '/x/')]);")
        self.assertEqual(urls, [
            '/static/sounds/error/hmm%20no.mp3', '/static/sounds/celebration/tada.mp3',
            [f'/static/sounds/swipe/swipe{i}.mp3' for i in range(1, 5)], 0, '/x/correct/a%20b.mp3'])
        self.assertIn('unknown kind', self.run_node(
            "try { a.clipUrl('music', 'x.mp3'); out('no error'); } catch (e) { out(e.message); }"))

    def test_pick_is_random_within_the_pool(self):
        self.assertEqual(self.run_node(
            "out([a.pickIndex(10, () => 0), a.pickIndex(10, () => 0.55), a.pickIndex(10, () => 0.9999),"
            " a.pickIndex(10, () => 1), a.pickIndex(1, () => 0.7), a.pickIndex(0)]);"),
            [0, 5, 9, 9, 0, -1])

    def test_channels(self):
        self.assertEqual(self.run_node("out(a.CHANNEL);"),
                         {'correct': 'voice', 'error': 'voice', 'tada': 'voice', 'swipe': 'fx', 'locked': 'voice'})

    def test_mute_flag_is_remembered_in_flip_muted(self):
        self.assertEqual(self.run_node(
            "const store = (init = {}) => { const d = { ...init }; return { d, getItem: (k) => (k in d ? d[k] : null),"
            " setItem: (k, v) => { d[k] = String(v); } }; };"
            "const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };"
            "const s1 = store(); a.saveMuted(true, s1); const on = s1.d['flip.muted']; const r1 = a.loadMuted(s1);"
            "a.saveMuted(false, s1);"
            "out([a.MUTED_KEY, a.loadMuted(store()), on, r1, s1.d['flip.muted'], a.loadMuted(s1),"
            " a.loadMuted(store({ 'flip.muted': 'yes' })), a.loadMuted(store({ 'flip.muted': '1' })),"
            " a.loadMuted(broken), (() => { a.saveMuted(true, broken); return 'no throw'; })(), a.loadMuted(undefined)]);"),
            ['flip.muted', False, 'true', True, 'false', False, False, False, False, 'no throw', False])

    def test_nothing_plays_on_load_and_a_gesture_unlocks(self):
        # init() downloads every clip once and plays nothing, with no
        # AudioContext yet; the first pointerup / touchend / click /
        # keydown makes one context, resumes it and plays one silent
        # sample (iOS opens the output on that), then the clips decode.
        # The listeners stay: a later gesture finding the context
        # suspended (the phone switched apps) resumes it again; one
        # finding it running does nothing.
        self.assertEqual(self.run_node(
            "a.init(); const before = [fetched.length, new Set(fetched).size, ctxs.length, log.length, Object.keys(listeners).sort()];"
            "a.play('swipe'); const early = log.length;"
            "listeners.touchend(); const c = ctxs[0]; const first = [ctxs.length, c.state, c.resumes, log.map((e) => e.src)];"
            "await settle(); clear(); a.play('swipe'); const after = kinds();"
            "listeners.click(); const quiet = [ctxs.length, c.resumes];"
            "c.state = 'interrupted'; listeners.pointerup();"
            "out([before, early, first, after, quiet, [c.state, c.resumes], Object.keys(listeners).length]);"),
            [[25, 25, 0, 0, ['click', 'keydown', 'pointerup', 'touchend']], 0,
             [1, 'running', 1, ['silence']], ['swipe'], [1, 1], ['running', 2], 4])

    def test_no_web_audio_means_silent_not_broken(self):
        self.assertEqual(self.run_node(
            "delete globalThis.AudioContext; a.init(); listeners.pointerup(); await settle();"
            "['correct', 'error', 'tada', 'swipe', 'locked'].forEach(a.play); out([ctxs.length, played()]);"),
            [0, []])

    def test_a_clip_that_fails_to_download_is_left_out(self):
        self.assertEqual(self.run_node(
            "['swipe1', 'swipe2', 'swipe3'].forEach((n) => missing.add(`/static/sounds/swipe/${n}.mp3`));"
            "await ready(); for (let i = 0; i < 6; i++) a.play('swipe');"
            "out([...new Set(played())]);"),
            ['swipe/swipe4.mp3'])

    def test_play_picks_from_the_pool_and_voice_clips_take_turns(self):
        self.assertEqual(self.run_node(
            "await ready(); S.setState({ muted: false, speaking: false });"
            "a.play('error'); const first = played();"
            "a.play('swipe'); const both = sounding();"            # the swipe does not cut the voice
            "a.play('correct'); const after = sounding();"         # a voice clip cuts the voice clip
            "out([first.length, first[0].split('/')[0], kinds(), both, after]);"),
            [1, 'error', ['error', 'swipe', 'correct'], ['error', 'swipe'], ['correct', 'swipe']])

    def test_no_voice_clip_over_the_target_word_and_the_word_cuts_the_voice(self):
        self.assertEqual(self.run_node(
            "await ready(); S.setState({ muted: false, speaking: false });"
            "a.play('error'); S.setState({ speaking: true }); let ended = 0;"
            "a.speakWord('/static/sounds/themes/animals/cat.mp3', () => ended++);"
            "const word = made[made.length - 1]; const voiceCut = sounding();"
            "clear(); a.play('correct'); a.play('tada'); a.play('swipe');"
            "out([voiceCut, kinds(), word.paused, ended]);"),
            [[], ['swipe'], False, 0])

    def test_muted_means_no_sound_at_all(self):
        self.assertEqual(self.run_node(
            "await ready(); S.setState({ muted: true, speaking: false }); const n = made.length;"
            "['correct', 'error', 'tada', 'swipe', 'locked'].forEach(a.play);"
            "let ended = 0; a.speakWord('/static/sounds/themes/animals/cat.mp3', () => ended++);"
            "out([played(), made.length - n, ended]);"),
            [[], 0, 1])

    def test_sounds_follow_the_moment_table(self):
        # renderSound (a state subscriber) plays MOMENTS[moment].sound for
        # each state change: swipe for a block into a slot (the last one
        # too), nothing for a block back to the bench or the lever, error
        # on a wrong check and the reveal, correct on a correct check,
        # tada once when the round-end screen shows; and nothing at all
        # while muted.
        steps = self.run_node(
            "await ready(); S.subscribe(a.renderSound);"
            "const go = (o) => { clear(); S.setState(st(o)); return kinds(); };"
            "const cur = (ids, status = 'playing') => ({ current: { word: 'cat', status, placed: put(ids) } });"
            "const res = (n) => ({ round: { index: 4, size: 5, results: [0, 1, 2, 3, 4].map((i) => ({ correct: i < n })) } });"
            "out([go({ screen: 'theme', current: { word: null, placed: [] } }), go({}),"
            " go(cur(['t1', null, null])), go(cur([null, null, null])), go(cur(['t2', 't1', null])),"
            " go({ ...cur([null, null, null]), pressed: 'lever' }), go({ ...cur(['t2', 't1', null]), pressed: null }),"
            " go(cur(['t2', 't1', 't3'])), go({ ...cur(['t2', 't1', 't3'], 'wrong'), lives: 2 }),"
            " go({ ...cur(['t2', null, 't3']), lives: 2 }), go({ ...cur(['t2', 't1', 't3']), lives: 2 }),"
            " go({ ...cur(['t1', 't2', 't3'], 'revealed'), lives: 0 }),"
            " go({ ...cur([null, null, null]), lives: 3, round: { index: 1, size: 5, results: [{ correct: false }] } }),"
            " go({ ...cur(['t3', 't1', 't2'], 'correct'), lives: 3, round: { index: 1, size: 5, results: [{ correct: false }, { correct: true }] } }),"
            " go({ ...cur(['t1', 't2', 't3'], 'correct'), screen: 'round-end', ...res(4) }),"
            " go({ ...cur(['t1', 't2', 't3'], 'correct'), screen: 'round-end', ...res(4) })]);")
        self.assertEqual(steps, [
            [], [],                         # theme screen, then a round starts: silent
            ['swipe'], [], ['swipe'],       # into a slot / back to the bench / two in again (one new)
            [], ['swipe'],                  # the lever / a block in again
            ['swipe'],                      # the block that fills the last slot
            ['error'],                      # wrong check
            [], ['swipe'],                  # a block out, then in again (fills the rail)
            ['error'],                      # the third miss reveals
            [],                             # the next word
            ['correct'],                    # correct check
            ['tada'], [],                   # round-end shown, once
        ])

    def test_mute_stops_everything_and_keeps_it_silent(self):
        self.assertEqual(self.run_node(
            "await ready(); S.subscribe(a.renderSound); S.setState(st());"
            "S.setState(st({ current: { word: 'cat', status: 'playing', placed: put(['t1', null, null]) } }));"
            "a.speakWord('/static/sounds/themes/animals/cat.mp3', () => {}); const word = made[made.length - 1];"
            "const swipeOn = sounding().includes('swipe');"
            "S.setState({ muted: true, speaking: false }); const allStopped = sounding().length === 0 && word.paused;"
            "clear(); S.setState(st({ muted: true, current: { word: 'cat', status: 'playing', placed: put(['t1', 't2', null]) } }));"
            "S.setState(st({ muted: true, screen: 'round-end' }));"
            "out([swipeOn, word.paused, allStopped, played()]);"),
            [True, True, True, []])

    def test_hmm_no_is_downloaded_and_decoded_once_for_both_pools(self):
        # BACKLOG B-203: the 'locked' pool is the error pool's "hmm no";
        # the file is fetched once and decoded once (decodeAudioData takes
        # over its bytes), and both pools play it
        self.assertEqual(self.run_node(
            "const decodes = []; const dec = AudioContext.prototype.decodeAudioData;"
            "AudioContext.prototype.decodeAudioData = function (d) { decodes.push(d.url); return dec.call(this, d); };"
            "await ready(); S.setState({ muted: false, speaking: false });"
            "const url = '/static/sounds/error/hmm%20no.mp3';"
            "a.play('locked'); a.play('locked'); const locked = played(); clear();"
            "Math.random = () => 0.45; a.play('error');"     # index 4 of the ten error clips
            "out([fetched.filter((u) => u === url).length, decodes.filter((u) => u === url).length, decodes.length,"
            " new Set(decodes).size, locked, played(), sounding()]);"),
            [1, 1, 25, 25, ['error/hmm no.mp3', 'error/hmm no.mp3'], ['error/hmm no.mp3'], ['error']])

    def test_a_tap_on_the_held_back_speaker_says_hmm_no(self):
        # renderSound plays MOMENTS.speakerLocked.sound ('locked') on each
        # change of state.lockedTaps: "hmm no" every tap, a new one cutting
        # the last (one voice clip at a time); nothing on a re-render, and
        # nothing while muted (the count still changes: the robot shakes
        # his head silently)
        self.assertEqual(self.run_node(
            "await ready(); S.subscribe(a.renderSound);"
            "const go = (o) => { clear(); S.setState(st(o)); return played(); };"
            "out([go({ lockedTaps: 0 }), go({ lockedTaps: 1 }), go({ lockedTaps: 2 }), sounding(),"
            " go({ lockedTaps: 2 }), go({ lockedTaps: 3, muted: true }), go({ lockedTaps: 3, muted: false }),"
            # after a wrong check (its error clip), a tap still says hmm no
            " (go({ lockedTaps: 3, current: { word: 'cat', status: 'wrong', placed: put(['t3', 't2', 't1']) }, lives: 2 }), kinds()),"
            " go({ lockedTaps: 4, current: { word: 'cat', status: 'wrong', placed: put(['t3', 't2', 't1']) }, lives: 2 })]);"),
            [[], ['error/hmm no.mp3'], ['error/hmm no.mp3'], ['error'], [], [], [], ['error'], ['error/hmm no.mp3']])

    def test_back_to_themes_stops_the_word_and_plays_nothing(self):
        # BACKLOG B-201: the play screen's back button (main.js onPlayBack
        # -> onThemes) stops the word clip and clears the round in one
        # setState; renderSound plays nothing for it (no tada after the
        # fifth word either), and the stopped clip never calls its onEnd
        self.assertEqual(self.run_node(
            "await ready(); S.subscribe(a.renderSound);"
            "const back = (o) => ({ ...o, screen: 'theme', theme: null, words: [], round: { index: 0, size: 5, results: [] },"
            " current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },"
            " pressed: null, speaking: false, idleBeat: null });"
            "const five = { index: 4, size: 5, results: [0, 1, 2, 3, 4].map(() => ({ correct: true })) };"
            "const from = [st({ current: { word: 'cat', status: 'wrong', placed: put(['t3', 't2', 't1']) }, lives: 2 }),"
            " st({ current: { word: 'cat', status: 'correct', placed: put(['t1', 't2', 't3']) }, round: five }),"
            " st({ current: { word: 'cat', status: 'revealed', placed: put(['t1', 't2', 't3']) }, lives: 0 }),"
            " st({ current: { word: 'cat', status: 'playing', placed: put(['t1', null, null]) }, idleBeat: 'sunk' })];"
            "const res = [];"
            "for (const s of from) {"
            " S.setState(s); let ended = 0; S.setState({ speaking: true });"
            " a.speakWord('/static/sounds/themes/animals/cat.mp3', () => { ended++; });"
            " const word = made[made.length - 1]; clear();"
            " a.stopWord(); S.setState(back(S.state)); word.on.ended();"
            " res.push([word.paused, ended, played()]);"
            "}"
            "out(res);"),
            [[True, 0, []]] * 4)

    def test_nothing_else_constructs_audio(self):
        # BACKLOG B-108: audio.js is the only place sounds play; no other
        # module in static/js makes an Audio element, an AudioContext or an
        # <audio>, and the page has no <audio> tag.
        pattern = re.compile(r"\bnew\s+Audio\b|\bAudio\s*\(|AudioContext|createElement\(\s*['\"]audio|<audio")
        js_dir = self.ROOT / 'static' / 'js'
        offenders = [f.name for f in sorted(js_dir.rglob('*.js'))
                     if f.name != 'audio.js' and pattern.search(f.read_text())]
        self.assertEqual(offenders, [])
        self.assertRegex(self.MODULE.read_text(), r'new Audio\(')
        html = (self.ROOT / 'templates' / 'spelling_game' / 'index.html').read_text()
        self.assertNotIn('<audio', html)


class MuteToggleTests(TestCase):
    """The header's mute toggle (BACKLOG B-108, B-108b, DESIGN "Layout"
    header, "Words on screen", v5): top-right after the logo, one button
    holding the small cream speaker glyph (wave / cross) and the brass
    switch (images, knob right / left), tap area at least 84x48, no text;
    wired to state.muted."""

    ROOT = Path(__file__).resolve().parent.parent

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)

    def rule(self, selector):
        return re.search(r'\n' + re.escape(selector) + r'\s*{([^}]*)}', self.css()).group(1)

    def test_toggle_is_an_icon_button_in_the_header_after_the_logo(self):
        html = self.client.get('/').content.decode()
        header = html[html.index('<header'):html.index('</header>')]
        m = re.search(r'<button id="mute-btn"([^>]*)>(.*?)</button>', header, flags=re.S)
        self.assertIsNotNone(m)
        attrs, inner = m.groups()
        self.assertIn('aria-label="Mute"', attrs)
        self.assertIn('aria-pressed="false"', attrs)
        self.assertIn('<svg class="icon-sound"', inner)
        self.assertIn('<svg class="icon-muted"', inner)
        self.assertEqual(re.sub(r'<[^>]+>', '', inner).strip(), '')
        self.assertLess(header.index('class="app-title"'), header.index('id="mute-btn"'))

    def test_glyph_then_switch_images_in_one_button(self):
        # B-108b: the glyph (code) followed by the switch, both images in
        # the markup so both load up front (no flash on the first toggle)
        html = self.client.get('/').content.decode()
        inner = re.search(r'<button id="mute-btn"[^>]*>(.*?)</button>', html, flags=re.S).group(1)
        on = inner.index('<img class="switch-on" src="/static/images/ui/mute-switch-on.png" alt="" />')
        off = inner.index('<img class="switch-off" src="/static/images/ui/mute-switch-off.png" alt="" />')
        switch = inner.index('<span class="switch" aria-hidden="true">')
        self.assertLess(inner.index('class="icon-sound"'), switch)
        self.assertLess(inner.index('class="icon-muted"'), switch)
        self.assertLess(switch, on)
        self.assertLess(on, off)
        self.assertEqual(html.count('mute-switch-'), 2)

    def test_tap_area_is_at_least_84x48_and_shows_one_glyph(self):
        css = self.css()
        rule = self.rule('.mute-btn')
        width = int(re.search(r'\n\s*width: (\d+)px;', rule).group(1))
        height = int(re.search(r'\n\s*height: (\d+)px;', rule).group(1))
        self.assertGreaterEqual(width, 84)
        self.assertGreaterEqual(height, 48)
        # glyph + gap + switch fit inside the padded box
        pad = re.search(r'\n\s*padding: 0 (\d+)px 8px;', rule)
        gap = re.search(r'\n\s*gap: (\d+)px;', rule)
        self.assertIsNotNone(pad)
        self.assertIsNotNone(gap)
        self.assertLessEqual(14 * 19.8 / 15.6 + int(gap.group(1)) + 60, width - 2 * int(pad.group(1)))
        self.assertRegex(css, r'\.mute-btn \.icon-muted,\s*\.mute-btn\.is-muted \.icon-sound\s*{\s*display: none;')
        self.assertRegex(css, r'\.mute-btn\.is-muted \.icon-muted\s*{\s*display: block;')

    def test_glyph_is_about_14px(self):
        # both icons share one viewBox, the bounding box of their strokes,
        # so the drawn glyph is 14px tall and the speaker never moves
        html = self.client.get('/').content.decode()
        for cls in ('icon-sound', 'icon-muted'):
            self.assertIn(f'<svg class="{cls}" viewBox="2.4 4.2 19.8 15.6"', html)
        svg = self.rule('.mute-btn svg')
        self.assertIn('height: 14px;', svg)
        self.assertIn('width: calc(14px * 19.8 / 15.6);', svg)
        self.assertIn('overflow: visible;', svg)

    def test_switch_images_are_stacked_and_swapped_by_class(self):
        # B-108b: the 180x59 images at 60px wide (3:1, about 60x20 at 360),
        # stacked in one box with one contact shadow; is-muted (main.js)
        # shows knob left, otherwise knob right, as the lever and dome swap
        ui = self.ROOT / 'static' / 'images' / 'ui'
        for name in ('mute-switch-on.png', 'mute-switch-off.png'):
            head = (ui / name).read_bytes()[:26]
            self.assertEqual((int.from_bytes(head[16:20], 'big'), int.from_bytes(head[20:24], 'big')), (180, 59), name)
        box = self.rule('.mute-btn .switch')
        self.assertIn('position: relative;', box)
        self.assertIn('width: 60px;', box)
        self.assertIn('height: calc(60px * 59 / 180);', box)
        self.assertIn('filter: drop-shadow(1px 2px 2px var(--shadow-contact));', box)
        img = self.rule('.mute-btn .switch img')
        for decl in ('position: absolute;', 'inset: 0;', 'width: 100%;', 'height: 100%;', 'opacity: 0;'):
            self.assertIn(decl, img)
        css = self.css()
        self.assertRegex(css, r'\n\.mute-btn \.switch \.switch-on,\s*\.mute-btn\.is-muted \.switch \.switch-off\s*{\s*opacity: 1;\s*}')
        self.assertRegex(css, r'\n\.mute-btn\.is-muted \.switch \.switch-on\s*{\s*opacity: 0;\s*}')
        # the swap is by opacity only: no display or src change
        self.assertNotRegex(css, r'\.switch-(on|off)[^{]*{[^}]*display:')
        self.assertNotIn('mute-switch', (self.ROOT / 'static' / 'js' / 'main.js').read_text())

    def test_header_is_click_through_except_the_toggle(self):
        # the header box spans the column down to y 77 at 360x740, over
        # the top of the sticker book's back button (y 70) and scrolled
        # content: only the toggle takes taps
        css = self.css()
        header = re.search(r'\n\.app-header\s*{([^}]*)}', css).group(1)
        self.assertIn('pointer-events: none;', header)
        toggle = re.search(r'\n\.mute-btn\s*{([^}]*)}', css).group(1)
        self.assertIn('pointer-events: auto;', toggle)

    def test_state_and_wiring(self):
        js = self.ROOT / 'static' / 'js'
        self.assertRegex((js / 'state.js').read_text(), r'\n    muted: false,')
        main = (js / 'main.js').read_text()
        self.assertIn("$('mute-btn').addEventListener('click', onMute);", main)
        self.assertIn('subscribe(renderSound);', main)
        self.assertIn('setState({ muted: loadMuted() });', main)
        # only audio.js reads or writes the flip.muted key (comments aside);
        # main.js goes through loadMuted / saveMuted
        def code(f):
            return re.sub(r'/\*.*?\*/|//[^\n]*', '', f.read_text(), flags=re.S)
        for f in sorted(js.glob('*.js')):
            if f.name != 'audio.js':
                self.assertNotIn('flip.muted', code(f), f.name)
        self.assertNotIn('localStorage', code(js / 'main.js'))
        self.assertIn('saveMuted(muted);', main)

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


class PlayBackTests(TestCase):
    """The play screen's back button (BACKLOG B-201): the sticker book's
    line arrow, no text, at least 48x48, in the header left of the mute
    toggle and shown on the play screen only; tapping it goes to the theme
    screen at once, drops the round (stickers it added come out of the
    book, results cleared) and stops the word clip. The transition itself
    is covered by CharacterTests / AudioTests / StickerBookTests
    (`back_to_themes`, `remove`)."""

    ROOT = Path(__file__).resolve().parent.parent

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)

    def rule(self, selector):
        return re.search(r'\n' + re.escape(selector) + r'\s*{([^}]*)}', self.css()).group(1)

    def main_js(self):
        return (self.ROOT / 'static' / 'js' / 'main.js').read_text()

    def function(self, name):
        js = self.main_js()
        start = js.index(f'\nfunction {name}(')
        return js[start:js.index('\n}\n', start)]

    def test_the_sticker_books_arrow_in_the_header_left_of_the_mute_toggle(self):
        html = self.client.get('/').content.decode()
        header = html[html.index('<header'):html.index('</header>')]
        m = re.search(r'<button id="play-back-btn"([^>]*)>(.*?)</button>', header, flags=re.S)
        self.assertIsNotNone(m)
        attrs, inner = m.groups()
        self.assertIn('type="button"', attrs)
        self.assertIn('aria-label="Back"', attrs)
        self.assertEqual(re.sub(r'<[^>]+>', '', inner).strip(), '')     # no text
        book = re.search(r'<button id="gallery-back-btn"[^>]*>(.*?)</button>', html, flags=re.S).group(1)
        self.assertEqual(inner.strip(), book.strip())                     # the same SVG
        self.assertLess(header.index('class="app-title"'), header.index('id="play-back-btn"'))
        self.assertLess(header.index('id="play-back-btn"'), header.index('id="mute-btn"'))

    def test_shown_on_the_play_screen_only_at_least_48px_and_tappable(self):
        rule = self.rule('.play-back-btn')
        self.assertIn('display: none;', rule)
        self.assertGreaterEqual(int(re.search(r'\n\s*width: (\d+)px;', rule).group(1)), 48)
        self.assertGreaterEqual(int(re.search(r'\n\s*height: (\d+)px;', rule).group(1)), 48)
        self.assertIn('pointer-events: auto;', rule)                    # the header is click-through
        # pushed right by an auto left margin, so the logo and the mute
        # toggle keep their places; a gap before the toggle's tap area
        margin = re.search(r'\n\s*margin: -7px (\d+)px 0 auto;', rule)
        self.assertIsNotNone(margin)
        self.assertGreaterEqual(int(margin.group(1)), 8)
        self.assertIn('color: var(--cream);', rule)
        self.assertNotIn('background:', rule.replace('background: none;', ''))   # no face on the v5 scene
        self.assertIn('display: flex;', self.rule('body[data-screen="play"] .play-back-btn'))
        # nothing else shows it
        css = self.css()
        shown = re.findall(r'\n([^{}\n]*\.play-back-btn[^{}\n]*?)\s*{[^}]*display: (?!none)', css)
        self.assertEqual(shown, ['body[data-screen="play"] .play-back-btn'])

    def test_tap_drops_the_round_and_goes_to_the_theme_screen(self):
        main = self.main_js()
        self.assertIn("$('play-back-btn').addEventListener('click', onPlayBack);", main)
        self.assertIn("import { add as addSticker, remove as removeSticker } from './stickers.js';", main)
        back = self.function('onPlayBack')
        self.assertIn("if (state.screen !== 'play') return;", back)
        self.assertIn('if (r && r.correct && r.newSticker) removeSticker(state.theme, r.word);', back)
        self.assertTrue(back.rstrip().endswith('onThemes();'))
        self.assertNotIn('confirm(', main)
        themes = self.function('onThemes')
        self.assertLess(themes.index('stopWord();'), themes.index('setState({'))
        for decl in ("screen: 'theme',", 'words: [],', 'results: [] },', 'current: { word: null,', 'speaking: false,',
                     'pressed: null,', 'idleBeat: null,'):
            self.assertIn(decl, themes, decl)


class LevelTests(TestCase):
    """The level picker and the level in state (BACKLOG B-202):
    static/js/level.js levelRules(level) (pure, run through node), the
    level remembered in localStorage `flip.level` through loadLevel /
    saveLevel only (a missing or bad value, or broken storage, is
    'easy'), the theme screen's row of three panel buttons with 1, 2 and
    3 bulbs above the stickers button, and the round's level fixed when a
    theme is tapped."""

    ROOT = Path(__file__).resolve().parent.parent
    MODULE = ROOT / 'static' / 'js' / 'level.js'
    EASY = {'hearBefore': True, 'firstLetterGiven': True, 'shortWordsFirst': True,
            'leverDropsWrongFirst': True, 'distractors': 0}
    NORMAL = {'hearBefore': False, 'firstLetterGiven': False, 'shortWordsFirst': False,
              'leverDropsWrongFirst': False, 'distractors': 0}
    HARD = dict(NORMAL, distractors=2)

    # In-memory storage; SEED is the initial value of flip.level or null.
    FAKE_STORAGE = """
        const store = new Map();
        if (SEED !== null) store.set('flip.level', SEED);
        const fake = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
        };
        const raw = () => store.get('flip.level') ?? null;
        const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    """

    def run_node(self, body, seed=None):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
            f"const SEED = {json.dumps(seed)};"
            f"{self.FAKE_STORAGE}"
            f"const L = await import('{self.MODULE.as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def code(self, name):
        text = (self.ROOT / 'static' / 'js' / name).read_text()
        return re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)

    def rule(self, selector):
        return re.search(r'\n' + re.escape(selector) + r'\s*{([^}]*)}', self.css()).group(1)

    def main_function(self, name):
        js = (self.ROOT / 'static' / 'js' / 'main.js').read_text()
        start = re.search(rf'\n(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    # --- levelRules (pure) ---

    def test_level_rules_per_level(self):
        self.assertEqual(
            self.run_node("out([L.LEVELS, L.DEFAULT_LEVEL, L.levelRules('easy'), L.levelRules('normal'), L.levelRules('hard')]);"),
            [['easy', 'normal', 'hard'], 'easy', self.EASY, self.NORMAL, self.HARD],
        )

    def test_anything_that_is_not_a_level_gets_easys_rules(self):
        self.assertEqual(
            self.run_node("out([undefined, null, '', 'Hard', 'insane', 3, {}].map((v) => L.levelRules(v)));"),
            [self.EASY] * 7,
        )

    def test_rules_are_a_new_object_each_time(self):
        # a caller changing what it got cannot change the table
        self.assertEqual(
            self.run_node("const r = L.levelRules('hard'); r.distractors = 9; r.hearBefore = true;"
                          "out([L.levelRules('hard'), L.levelRules('hard') === L.levelRules('hard')]);"),
            [self.HARD, False],
        )

    def test_level_js_has_no_dom(self):
        code = self.code('level.js')
        for word in ('document', 'window', 'import '):
            self.assertNotIn(word, code, word)

    # --- flip.level: loadLevel / saveLevel ---

    def test_missing_or_bad_stored_value_is_easy(self):
        for seed in (None, '', 'insane', 'Easy', ' hard', '"hard"', 'null'):
            self.assertEqual(self.run_node("out(L.loadLevel(fake));", seed=seed), 'easy', seed)

    def test_stored_level_is_read(self):
        for level in ('easy', 'normal', 'hard'):
            self.assertEqual(self.run_node("out(L.loadLevel(fake));", seed=level), level)

    def test_save_writes_the_key_and_load_reads_it_back(self):
        self.assertEqual(
            self.run_node("L.saveLevel('hard', fake); const a = [raw(), L.loadLevel(fake)];"
                          "L.saveLevel('normal', fake); out([...a, raw(), L.loadLevel(fake)]);"),
            ['hard', 'hard', 'normal', 'normal'],
        )

    def test_save_ignores_a_bad_level(self):
        self.assertEqual(
            self.run_node("L.saveLevel('insane', fake); L.saveLevel(undefined, fake); out(raw());", seed='normal'),
            'normal',
        )

    def test_broken_or_missing_storage_is_easy_and_never_throws(self):
        self.assertEqual(
            self.run_node(
                "const a = L.loadLevel(broken); L.saveLevel('hard', broken);"
                # the default storage: none at all, then one whose access throws
                "delete globalThis.localStorage; const b = L.loadLevel(); L.saveLevel('hard');"
                "Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });"
                "const c = L.loadLevel(); L.saveLevel('hard');"
                "out([a, b, c]);"),
            ['easy', 'easy', 'easy'],
        )

    def test_default_storage_is_local_storage(self):
        self.assertEqual(
            self.run_node("globalThis.localStorage = fake; L.saveLevel('hard'); out([raw(), L.loadLevel()]);"),
            ['hard', 'hard'],
        )

    def test_only_level_js_names_the_key(self):
        js = self.ROOT / 'static' / 'js'
        for f in sorted(js.glob('*.js')):
            if f.name != 'level.js':
                self.assertNotIn('flip.level', self.code(f.name), f.name)
        self.assertIn("LEVEL_KEY = 'flip.level'", self.code('level.js'))
        self.assertNotIn('localStorage', self.code('main.js'))

    # --- theme screen: the picker ---

    def test_three_bulb_buttons_above_the_stickers_button_with_no_text(self):
        html = self.client.get('/').content.decode()
        theme = html[html.index('<div id="screen-theme"'):html.index('<div id="screen-play"')]
        self.assertLess(theme.index('id="theme-buttons"'), theme.index('id="level-picker"'))
        self.assertLess(theme.index('id="level-picker"'), theme.index('id="stickers-btn"'))
        picker = theme[theme.index('id="level-picker"'):theme.index('<div class="actions">')]
        buttons = re.findall(r'<button id="level-(\w+)"([^>]*)>(.*?)</button>', picker, flags=re.S)
        self.assertEqual([b[0] for b in buttons], ['easy', 'normal', 'hard'])
        for (level, attrs, inner), bulbs in zip(buttons, (1, 2, 3)):
            self.assertIn('class="panel-btn level-btn"', attrs)
            self.assertIn('type="button"', attrs)
            self.assertIn(f'aria-label="{level}"', attrs)
            self.assertRegex(attrs, r'aria-pressed="(true|false)"')
            self.assertEqual(inner.count('<span class="bulb"></span>'), bulbs, level)
            self.assertEqual(re.sub(r'<[^>]+>', '', inner).strip(), '', level)    # no text
        # the markup's default matches state.level's default
        self.assertIn('aria-pressed="true"', buttons[0][1])

    def test_picked_button_is_pressed_in_with_lit_bulbs_the_others_dark(self):
        self.assertIn('opacity: 0;', self.rule('.level-btn .bulb::before'))
        self.assertIn('opacity: 1;', self.rule('.level-btn[aria-pressed="true"] .bulb::before'))
        pressed = self.rule('.level-btn[aria-pressed="true"]')
        self.assertIn('transform: translate(1px, 2px);', pressed)
        self.assertIn('inset 2px 3px 5px var(--shadow-contact)', pressed)
        # the bulbs are the lives bulbs (.bulb), not a new drawing
        self.assertIn('.hearts span,\n.bulb {', self.css())

    def test_theme_screen_fits_at_360x740_and_on_a_short_phone(self):
        # logo line 70 + two cards + their 16px gap + 12px + level row 56
        # + 12px + stickers button 56 + bottom safe area 22
        n = int(re.search(r'width: min\(240px, 100%, \(100vh - (\d+)px\) / 2\);', self.rule('.theme-btn')).group(1))
        self.assertEqual(self.rule('.level-btn .bulb').count('14px'), 2)
        for height in (740, 667, 640):
            card = min(240, 324, (height - n) / 2)
            self.assertLessEqual(70 + 2 * card + 16 + 12 + 56 + 12 + 56 + 22, height, height)
        self.assertGreaterEqual(min(240, 324, (740 - n) / 2), 230)

    # --- state and wiring ---

    def test_level_in_state_default_easy_and_the_rounds_level(self):
        state = (self.ROOT / 'static' / 'js' / 'state.js').read_text()
        self.assertRegex(state, r"\n    level: 'easy',")
        self.assertIn('round: { index: 0, size: 5, level: null, results: [] },', state)

    def test_wiring(self):
        main = (self.ROOT / 'static' / 'js' / 'main.js').read_text()
        self.assertIn("import { LEVELS, loadLevel, saveLevel } from './level.js';", main)
        self.assertIn('setState({ level: loadLevel() });', main)
        self.assertIn('subscribe(renderLevel);', main)
        self.assertIn("for (const level of LEVELS) $(`level-${level}`).addEventListener('click', () => onLevel(level));", main)
        render = self.main_function('renderLevel')
        self.assertIn("$(`level-${level}`).setAttribute('aria-pressed', String(level === state.level));", render)
        pick = self.main_function('onLevel')
        self.assertIn("if (state.screen !== 'theme') return;", pick)
        self.assertLess(pick.index('saveLevel(level);'), pick.index('setState({ level });'))

    def test_the_level_is_fixed_for_the_round_once_a_theme_is_tapped(self):
        start = self.main_function('startRound')
        # read when the theme is tapped, before the data file is fetched
        self.assertLess(start.index('const level = state.level;'), start.index('await fetch('))
        self.assertIn('round: { index: 0, size: ROUND_SIZE, level, results: [] },', start)
        # nothing else writes a round level; leaving a round clears it
        main = self.code('main.js')
        self.assertEqual(len(re.findall(r'\blevel(: [^,}]+)?, results', main)), 2)
        self.assertIn('round: { index: 0, size: ROUND_SIZE, level: null, results: [] },', self.main_function('onThemes'))
        for name in ('onCheck', 'onNext'):
            self.assertIn('...round', self.main_function(name), name)


class SpeakerPerLevelTests(TestCase):
    """The speaker per level (BACKLOG B-203): easy plays the word at any
    time; normal and hard, before the word is answered, hold it back and
    the robot says "hmm no" with a small confused head-shake; once the
    word is answered it plays on every level; the speaker looks the same;
    mute silences all of it. The pure parts are run through node in
    ControlsTests, CharacterTests and AudioTests; this checks the wiring."""

    ROOT = Path(__file__).resolve().parent.parent

    def code(self, name):
        text = (self.ROOT / 'static' / 'js' / name).read_text()
        return re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)

    def main_function(self, name):
        js = self.code('main.js')
        start = re.search(rf'\n(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    def css_rule(self, selector):
        css = re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)
        return re.search(r'\n' + re.escape(selector) + r'\s*{([^}]*)}', css).group(1)

    def test_locked_taps_in_state(self):
        self.assertRegex((self.ROOT / 'static' / 'js' / 'state.js').read_text(), r'\n    lockedTaps: 0,')

    def test_the_tap_follows_the_rounds_level(self):
        speak = self.main_function('onSpeak')
        # the round's copy of the level (B-202), not the picker's
        self.assertIn('speakerAction(current, state.round.level)', speak)
        self.assertNotRegex(speak, r'state\.level\b')
        # a held-back tap counts one more, even while muted (the robot
        # still shakes his head; audio.js plays nothing), and plays no word
        locked = speak.index("if (action === 'locked') {")
        self.assertLess(locked, speak.index('state.muted'))
        self.assertIn('setState({ lockedTaps: state.lockedTaps + 1 });\n        return;', speak[locked:])
        self.assertLess(speak.index("if (action !== 'word' || state.muted) return;"), speak.index('speakWord('))
        self.assertIn("import { renderControls, domeAction, canReset, speakerAction, PRESS_MS } from './controls.js';",
                      (self.ROOT / 'static' / 'js' / 'main.js').read_text())

    def test_only_the_speaker_tap_writes_the_count(self):
        # state is written only through setState patches; the one that
        # changes lockedTaps is the held-back tap in main.js onSpeak
        js = self.ROOT / 'static' / 'js'
        patches = {f.name: re.findall(r'setState\(\{[^}]*\blockedTaps\b', self.code(f.name)) for f in sorted(js.glob('*.js'))}
        self.assertEqual({k: len(v) for k, v in patches.items() if v}, {'main.js': 1})
        self.assertIn('setState({ lockedTaps: state.lockedTaps + 1 });', self.main_function('onSpeak'))

    def test_the_held_back_speaker_is_not_disabled_and_has_no_lock(self):
        # renderControls disables only the capped speaker, so a held-back
        # tap still reaches main.js; no new speaker image or class
        controls = self.code('controls.js')
        self.assertIn("speaker.disabled = s === 'cap';", controls)
        self.assertIn("speaker: ['off', 'on', 'cap'],", controls)
        html = self.client.get('/').content.decode()
        speaker = html[html.index('id="speak-btn"'):html.index('</button>', html.index('id="speak-btn"'))]
        self.assertEqual(re.findall(r'class="(speaker-[a-z]+)"', speaker), ['speaker-off', 'speaker-on', 'speaker-cap'])
        self.assertNotIn('lock', speaker)

    def test_the_head_shake_turns_him_about_his_neck(self):
        # the visor centre's column (72.6px) at the console's edge (75px
        # below the sprite's top at rest): his head swings, his shoulders
        # stay at the edge
        self.assertIn('transform-origin: calc(72.6 * var(--rpx)) calc(75 * var(--rpx));', self.css_rule('.robot-body'))
        self.assertIn('left: calc(72.6 * var(--rpx) - var(--vx) * var(--s));', self.css_rule('.robot-body img'))
        self.assertIn('top: calc((130 - 75) * var(--rpx));', self.css_rule('.robot-body'))
        # every segment sets the turn, so no other move leaves him tilted
        self.assertIn('rotation: s.rotation || 0', self.code('character.js'))


class EasyStartTests(TestCase):
    """Easy: first letter given, short words first (BACKLOG B-204).
    static/js/round.js pickWords (on easy the easy-tagged words first, then
    the shortest others; normal and hard as before) and makeWord (on easy
    the first letter starts in the first slot, locked, its block off the
    bench), and drag.js's lock rules (a locked slot takes nothing and
    gives nothing back, the lever leaves it, its block cannot be dragged),
    run through node; the wiring in main.js and card.js and the locked
    look in game.css are checked in the source."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

    # A seeded Math.random stand-in, so a pick can be repeated.
    PRELUDE = """
        const seeded = (s) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
        const out = (v) => console.log(JSON.stringify(v));
        let seq = 0;
        const newId = () => `t${++seq}`;
    """

    def run_node(self, body):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
            f"const R = await import('{(self.JS / 'round.js').as_uri()}');"
            f"const D = await import('{(self.JS / 'drag.js').as_uri()}');"
            f"const C = await import('{(self.JS / 'controls.js').as_uri()}');"
            f"{self.PRELUDE}"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def content(self, theme):
        return json.loads((self.ROOT / 'static' / 'data' / f'{theme}.json').read_text())

    def code(self, name):
        return re.sub(r'/\*.*?\*/|//[^\n]*', '', (self.JS / name).read_text(), flags=re.S)

    def function(self, name, file='main.js'):
        js = self.code(file)
        start = re.search(rf'\n(export )?(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    def picks(self, data, level, seeds=40):
        return self.run_node(
            f"const data = {json.dumps(data)};"
            f"out(Array.from({{ length: {seeds} }}, (_, i) => R.pickWords(data, 5, {json.dumps(level)}, seeded(i + 1))));")

    # --- pickWords ---

    def test_easy_takes_only_easy_tagged_words_when_there_are_enough(self):
        # animals has six easy-tagged words: every easy round is five of
        # them, at random, so over many rounds all six come up
        data = self.content('animals')
        easy = {w for w, v in data.items() if v.get('difficulty') == 'easy'}
        self.assertEqual(len(easy), 6)
        rounds = self.picks(data, 'easy')
        for words in rounds:
            self.assertEqual(len(set(words)), 5)
            self.assertLessEqual(set(words), easy)
        self.assertEqual(set().union(*map(set, rounds)), easy)

    def test_easy_fills_up_with_the_shortest_other_words(self):
        # transportation has exactly five easy-tagged words (one of them,
        # scooter, 7 letters long): they are the round
        data = self.content('transportation')
        for words in self.picks(data, 'easy'):
            self.assertEqual(set(words), {'boat', 'bus', 'car', 'scooter', 'taxi'})
        # two easy words, then the three shortest of the rest; the last
        # place goes at random to one of the words of the cut length
        data = {
            'elephant': {'difficulty': 'easy'}, 'ox': {'difficulty': 'easy'},
            'hippopotamus': {'difficulty': 'hard'}, 'bee': {'difficulty': 'medium'}, 'ant': {},
            'crab': {'difficulty': 'hard'}, 'seal': {'difficulty': 'medium'}, 'kangaroo': {},
            'giraffe': {'difficulty': 'medium'},
        }
        rounds = self.picks(data, 'easy')
        for words in rounds:
            self.assertEqual(len(words), 5)
            self.assertLessEqual({'elephant', 'ox', 'bee', 'ant'}, set(words))
            self.assertEqual(len(set(words) & {'crab', 'seal'}), 1)
        self.assertEqual({w for words in rounds for w in words} & {'crab', 'seal'}, {'crab', 'seal'})

    def test_easy_without_tags_gets_the_shortest_words(self):
        data = {w: {'image': f'/{w}.svg'} for w in ('helicopter', 'bus', 'car', 'motorbike', 'taxi', 'boat', 'plane', 'submarine')}
        for words in self.picks(data, 'easy'):
            self.assertEqual(set(words), {'bus', 'car', 'taxi', 'boat', 'plane'})

    def test_easy_plays_its_words_in_random_order(self):
        data = self.content('transportation')
        orders = {tuple(words) for words in self.picks(data, 'easy')}
        self.assertGreater(len(orders), 5)

    def test_normal_and_hard_pick_as_before(self):
        # five words at random from the whole theme: the shuffle of the
        # theme's words, cut at five, as main.js did before B-204
        data = self.content('animals')
        for level in ('normal', 'hard'):
            same = self.run_node(
                f"const data = {json.dumps(data)};"
                "out(Array.from({ length: 20 }, (_, i) => JSON.stringify(R.pickWords(data, 5, "
                f"{json.dumps(level)}, seeded(i + 1))) === JSON.stringify(R.shuffle(Object.keys(data), seeded(i + 1)).slice(0, 5))));")
            self.assertEqual(same, [True] * 20, level)
            seen = {w for words in self.picks(data, level) for w in words}
            self.assertTrue(seen - {w for w, v in data.items() if v.get('difficulty') == 'easy'}, level)

    def test_pick_leaves_the_data_alone_and_a_null_level_is_easy(self):
        data = self.content('animals')
        before, after, null_pick, easy_pick = self.run_node(
            f"const data = {json.dumps(data)}; const before = JSON.stringify(data);"
            "const n = R.pickWords(data, 5, null, seeded(7)); const e = R.pickWords(data, 5, 'easy', seeded(7));"
            "out([before, JSON.stringify(data), n, e]);")
        self.assertEqual(before, after)
        self.assertEqual(null_pick, easy_pick)

    # --- makeWord ---

    def test_easy_gives_the_first_letter_locked_in_the_first_slot(self):
        for word in ('duck', 'scooter', 'dad', 'submarine'):
            cur = self.run_node(
                f"out(R.makeWord({{ word: '{word}', image: '/i.svg', audio: '/a.mp3' }}, 'easy', newId, seeded(3)));")
            self.assertEqual((cur['word'], cur['image'], cur['audio'], cur['status']), (word, '/i.svg', '/a.mp3', 'playing'))
            self.assertEqual(sorted(t['letter'] for t in cur['tray']), sorted(word), word)
            self.assertEqual(len({t['id'] for t in cur['tray']}), len(word))
            given = [t for t in cur['tray'] if t.get('given')]
            self.assertEqual(len(given), 1, word)
            self.assertEqual(given[0]['letter'], word[0])
            self.assertTrue(given[0]['used'])
            self.assertEqual(cur['placed'][0], {'letter': word[0], 'tileId': given[0]['id'], 'locked': True})
            self.assertEqual(cur['placed'][1:], [None] * (len(word) - 1))
            # every other block is on the bench
            self.assertEqual([t['used'] for t in cur['tray'] if not t.get('given')], [False] * (len(word) - 1))

    def test_normal_and_hard_start_with_every_slot_empty(self):
        for level in ('normal', 'hard'):
            cur = self.run_node(f"out(R.makeWord({{ word: 'tiger', image: '/i.svg' }}, '{level}', newId));")
            self.assertEqual(cur['placed'], [None] * 5)
            self.assertEqual(sorted(t['letter'] for t in cur['tray']), sorted('tiger'))
            for t in cur['tray']:
                self.assertEqual(set(t), {'id', 'letter', 'used'})
                self.assertFalse(t['used'])

    def test_the_given_letter_still_needs_a_check(self):
        # the dome is off at the start of an easy word and lights (check)
        # only when every slot is full; a word whose only missing letter
        # is the given one starts full, and still waits for the check
        self.assertEqual(
            self.run_node(
                "const easy = R.makeWord({ word: 'cat' }, 'easy', newId);"
                "const one = R.makeWord({ word: 'a' }, 'easy', newId);"
                "out([C.domeAction(easy), C.domeState(easy, null), one.placed, C.domeAction(one), C.domeState(one, null), one.status]);"),
            [None, 'off', [{'letter': 'a', 'tileId': 't4', 'locked': True}], 'check', 'ready', 'playing'],
        )

    # --- drag.js: the lock rules ---

    START = {
        'word': 'cat', 'status': 'playing',
        'tray': [{'id': 'a', 'letter': 't', 'used': False}, {'id': 'b', 'letter': 'a', 'used': False},
                 {'id': 'c', 'letter': 'c', 'used': True, 'given': True}],
        'placed': [{'letter': 'c', 'tileId': 'c', 'locked': True}, None, None],
    }

    def lock_rules(self, body):
        return self.run_node(f"const cur = {json.dumps(self.START)}; const before = JSON.stringify(cur); {body}")

    def test_a_locked_slot_takes_nothing_and_its_block_never_moves(self):
        res = self.lock_rules(
            "out([D.placeIn(cur, 'a', 0), D.placeIn(cur, 'c', 1), D.placeIn(cur, 'c', 0), D.takeOut(cur, 'c'),"
            " D.isLocked(cur.placed[0]), D.isLocked(cur.placed[1]), D.isLocked({ letter: 'x', tileId: 'x' }), JSON.stringify(cur) === before]);")
        self.assertEqual(res, [None, None, None, None, True, False, False, True])

    def test_other_slots_work_as_before(self):
        placed, moved, swapped, out_, wrong_out = self.lock_rules(
            "const p = D.placeIn(cur, 'a', 1); const m = D.placeIn(p, 'a', 2); const s = D.placeIn(m, 'b', 2);"
            "const o = D.takeOut(s, 'b');"
            "const w = D.takeOut({ ...p, status: 'wrong' }, 'a');"
            "out([p, m, s, o, w]);")
        self.assertEqual(placed['placed'], [self.START['placed'][0], {'letter': 't', 'tileId': 'a'}, None])
        self.assertEqual([t['used'] for t in placed['tray']], [True, False, True])
        self.assertEqual(moved['placed'][1:], [None, {'letter': 't', 'tileId': 'a'}])
        # a swap sends the block that was there back to the bench
        self.assertEqual(swapped['placed'][1:], [None, {'letter': 'a', 'tileId': 'b'}])
        self.assertEqual([t['used'] for t in swapped['tray']], [False, True, True])
        self.assertEqual(out_['placed'], [self.START['placed'][0], None, None])
        self.assertEqual([t['used'] for t in out_['tray']], [False, False, True])
        self.assertEqual(wrong_out['status'], 'playing')     # a move reopens a wrong check
        for cur in (placed, moved, swapped, out_):
            self.assertTrue(cur['placed'][0]['locked'])

    def test_the_lever_leaves_a_locked_letter(self):
        after = self.lock_rules(
            "const full = D.placeIn(D.placeIn(cur, 'a', 1), 'b', 2);"
            "out(D.returnAll({ ...full, status: 'wrong' }));")
        self.assertEqual(after['placed'], [{'letter': 'c', 'tileId': 'c', 'locked': True}, None, None])
        self.assertEqual(after['tray'], self.START['tray'])
        self.assertEqual(after['status'], 'playing')

    def test_a_locked_block_cannot_be_dragged(self):
        # drag.js with stand-ins for GSAP and Draggable: card.js passes the
        # locked tile ids, and their Draggables stay disabled while the
        # others follow the word's status
        res = self.run_node(
            "globalThis.gsap = { set() {} };"
            "const made = [];"
            "globalThis.Draggable = { create(el) { const d = { on: true, enabled(v) { if (v === undefined) return this.on; this.on = v; return this; } };"
            " made.push([el.dataset.tileId, d]); return [d]; } };"
            "const el = (id) => ({ dataset: { tileId: id }, addEventListener() {} });"
            "['a', 'b', 'c'].forEach((id) => D.makeDraggable(el(id)));"
            "const state = () => made.map(([id, d]) => id + (d.enabled() ? '+' : '-')).join(' ');"
            "D.setDragEnabled(true, new Set(['c'])); const s1 = state();"
            "D.setDragEnabled(false, new Set(['c'])); const s2 = state();"
            "D.setDragEnabled(true, new Set(['c'])); const s3 = state();"
            "D.setDragEnabled(true); const s4 = state();"
            "out([s1, s2, s3, s4]);")
        self.assertEqual(res, ['a+ b+ c-', 'a- b- c-', 'a+ b+ c-', 'a+ b+ c+'])

    # --- wiring ---

    def test_round_js_has_no_dom_and_reads_the_level_rules(self):
        code = self.code('round.js')
        for word in ('document', 'window', 'state'):
            self.assertNotIn(word, code, word)
        self.assertIn("import { levelRules } from './level.js';", code)
        self.assertIn('levelRules(level).shortWordsFirst', code)
        self.assertIn('levelRules(level).firstLetterGiven', code)

    def test_main_builds_the_round_from_the_rounds_level(self):
        main = self.code('main.js')
        self.assertIn("import { pickWords, makeWord } from './round.js';", main)
        self.assertNotIn('makeCurrent', main)
        self.assertNotIn('shuffle', main)
        start = self.function('startRound')
        # `level` is the one read when the theme was tapped, which is also
        # the round's level (round.level)
        self.assertIn('pickWords(data, ROUND_SIZE, level)', start)
        self.assertIn('current: makeWord(words[0], level, newTileId),', start)
        self.assertIn('round: { index: 0, size: ROUND_SIZE, level, results: [] },', start)
        nxt = self.function('onNext')
        self.assertIn('current: makeWord(state.words[nextIndex], state.round.level, newTileId),', nxt)
        self.assertNotRegex(nxt, r'state\.level\b')

    def test_the_reveal_keeps_a_locked_letter_locked(self):
        self.assertIn('return p && p.letter === ch ? { ...p } : null;', self.function('revealed'))

    def test_card_lays_out_only_the_bench_blocks_and_marks_locked_slots(self):
        card = self.function('renderCard', 'card.js')
        self.assertIn('const bench = current.tray.filter((t) => !t.given);', card)
        self.assertIn('const spots = renderSpots(bench.length);', card)
        self.assertIn('bench.forEach((t, i) => {', card)
        self.assertIn("boxes[i].classList.toggle('locked', isLocked(slot));", card)
        self.assertIn("setDragEnabled(current.status === 'playing' || current.status === 'wrong', locked);", card)

    def test_the_locked_look(self):
        css = re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)
        rule = re.search(r'\n\.letter-box\.locked > \.draggable-letter\s*{([^}]*)}', css).group(1)
        # drawn as placed (the placed block's clay edges), plus a thin lit
        # edge and a soft glow in palette tokens, and no hand cursor
        self.assertIn('inset -2px -3px 0 var(--cream-lo),', rule)
        self.assertIn('1px 2px 3px var(--shadow-deep),', rule)
        self.assertIn('0 0 0 2px var(--amber),', rule)
        self.assertIn('0 0 6px 2px var(--glow-amber);', rule)
        self.assertIn('cursor: default;', rule)
