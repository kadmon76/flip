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
    the bench width (DESIGN.md "Layout", BACKLOG B-113). Hard adds two
    extra letters (BACKLOG B-207): up to 12 blocks, still three rows at
    360 wide, the first row taking a fifth block when the rows beside the
    robot are full."""

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
        # hard, 9 and 10 letters plus two extras (B-207): three rows, the
        # third holds three beside the robot, the first takes the twelfth
        self.assertEqual(self.rows(self.layout(11)), [4, 4, 3])
        self.assertEqual(self.rows(self.layout(12)), [5, 4, 3])

    def test_tilt_is_at_most_four_degrees_and_not_all_equal(self):
        spots = self.layout(10)['spots']
        self.assertTrue(all(abs(s['rot']) <= 4 for s in spots))
        self.assertGreater(len({s['rot'] for s in spots}), 1)

    def test_blocks_stay_on_the_bench_and_do_not_overlap(self):
        for n in range(1, 13):   # up to 10 letters plus hard's two extras
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

    def test_a_long_first_row_keeps_the_other_rows_spots(self):
        # 12 blocks (B-207): the first row holds five, centred and not
        # shifted, with narrower gaps inside the bench; the second row is
        # the second row of 10 and 11 blocks (the robot's cap clearance
        # is unchanged), the third that of 11
        twelve, eleven, ten = self.layout(12)['spots'], self.layout(11)['spots'], self.layout(10)['spots']
        self.assertEqual(twelve[5:9], ten[4:8])
        self.assertEqual(twelve[9:], eleven[8:])
        first = twelve[:5]
        self.assertTrue(all(s['y'] < 52 / 2 for s in first), first)          # all on the first row
        self.assertLessEqual(abs((first[0]['x'] + first[-1]['x'] + 52) / 2 - self.BENCH / 2), 4)   # centred
        self.assertTrue(all(b['x'] - a['x'] >= 52 + 6 for a, b in zip(first, first[1:])), first)

    def test_wider_benches(self):
        # a 480px column: three rows of four beside the robot too; 412px:
        # five on the first row
        self.assertEqual(self.rows(self.layout(12, 452)), [4, 4, 4])
        self.assertEqual(self.rows(self.layout(12, 384)), [5, 4, 3])
        for width in (384, 452):
            spots = self.layout(12, width)['spots']
            for s in spots:
                self.assertGreaterEqual(s['x'], 2)
                self.assertLessEqual(s['x'] + 52, width - 2)

    def test_height_fits_ten_letters_above_the_console(self):
        # 360x740: rail top 347 + two slot rows (114) + 4px gap + bench
        # + 4px gap + the console (324px wide, 972x175) + 22px safe area
        # must fit in 740 (BACKLOG B-114, DESIGN "Layout"); also with hard's
        # two extra letters (B-207): 12 blocks keep the three rows
        console = 324 * 175 / 972
        for n in (10, 12):
            self.assertLessEqual(347 + 114 + 4 + self.layout(n)['height'] + 4 + console + 22, 740, n)
        self.assertEqual(self.layout(12)['height'], self.layout(10)['height'])

    def test_third_row_sits_right_of_the_robot(self):
        # Rows from the third on are centred right of 40% of the bench
        # (the robot's head and shoulders end at about 36%).
        for n in (9, 10, 11):
            spots = self.layout(n)['spots'][8:]
            self.assertTrue(all(s['x'] >= 0.4 * self.BENCH for s in spots), (n, spots))
        self.assertTrue(all(s['x'] >= 0.4 * self.BENCH for s in self.layout(12)['spots'][9:]))
        # three blocks beside him (B-207) start right of his widest pose's
        # reach (44%), and keep at least 10px between them
        for n in (11, 12):
            third = self.layout(n)['spots'][-3:]
            self.assertTrue(all(s['x'] >= 0.44 * self.BENCH - 2 for s in third), (n, third))
            self.assertTrue(all(b['x'] - a['x'] >= 52 + 6 for a, b in zip(third, third[1:])), (n, third))
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
        # also on hard, where the bench has two extra letters (B-207): a
        # word of n letters has n + 2 blocks
        zones, console_top = self.keep_out()
        rail_top = 0.445 * self.W * 2739 / 1264
        for n in range(1, 11):
            for extras in (0, 2):
                slots, _ = self.layouts(n)
                _, blocks = self.layouts(n + extras)
                rail_h = 2 * slots['pad'] + slots['rows'] * slots['size'] + (slots['rows'] - 1) * slots['gap']
                bench_top = rail_top + rail_h + self.GAP
                # the column fits the screen: the console is not pushed down
                self.assertLessEqual(bench_top + blocks['height'] + self.GAP, console_top, (n, extras))
                for s in blocks['spots']:
                    x, y = self.SIDE + s['x'], bench_top + s['y']
                    box = (x - self.TILT, y - self.TILT, x + blocks['size'] + self.TILT, y + blocks['size'] + self.TILT)
                    for name, zone in zones.items():
                        self.assertFalse(self.overlap(box, zone), (n, extras, name, box, zone))

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
    every placed block back on the bench (on normal and hard always; easy's
    wrong-letters-first pull is LeverTests, B-205); any block move after a
    wrong check reopens the word (BACKLOG B-114)."""

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
                                      "out([d.returnAll(cur, 'normal'), JSON.parse(before)]);")
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
            'hintGiven': {'steps': steps(('happy', 'smallPop')), 'sound': None},
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
            'speakerLocked': ['locked'], 'hintGiven': [],
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
                         [[{'y': 0, 'duration': 0, 'ease': 'none'}]] * 7)
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
        # Also on hard (B-207), where a word of n letters has n + 2 blocks
        # (keys 'h1'-'h10'): clear at rest, and at the top of a pop only
        # the second row of a 7-10 letter word passes over him.
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
                for (const extras of [0, 2]) {{
                    const sl = slotLayout(n, BENCH), bl = blockLayout(n + extras, BENCH);
                    const railBottom = RAIL + 2 * sl.pad + sl.rows * sl.size + (sl.rows - 1) * sl.gap;
                    const benchTop = railBottom + GAP;
                    const row = (p) => Math.round(p.y / (bl.size + 10));
                    words.push({{ n: extras ? 'h' + n : n, railBottom, blocks: bl.spots.map((p) => [SIDE + p.x - TILT, benchTop + p.y - TILT,
                        SIDE + p.x + bl.size + TILT, benchTop + p.y + bl.size + TILT, row(p)]) }});
                }}
            }}
            for (const [pose, [sw, vx]] of Object.entries(poses)) {{
                const img = alphaOf(UI + '/robot-' + pose + '.png');
                const x0 = L + 72.6 - vx * s;
                const r = {{ minX: Infinity, maxX: -Infinity, lowest: -Infinity, rest: {{}}, pop: {{}}, popRows: {{}}, rail: 0 }};
                for (let sy = 0; sy < img.h; sy++) {{
                    for (let sx = 0; sx < img.w; sx++) {{
                        if (img.at(sx, sy) < 128) continue;
                        const x = x0 + (sx + 0.5) * s, yRest = TOP - 75 + (sy + 0.5) * s;
                        if (yRest >= TOP) continue;
                        r.minX = Math.min(r.minX, x); r.maxX = Math.max(r.maxX, x); r.lowest = Math.max(r.lowest, yRest);
                        for (const [at, y] of [['rest', yRest], ['pop', yRest - 20]]) {{
                            for (const w of words) {{
                                if (y < w.railBottom) r.rail++;
                                const hit = w.blocks.filter(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
                                if (hit.length) r[at][w.n] = (r[at][w.n] || 0) + 1;
                                if (at === 'pop') for (const blk of hit) r.popRows[blk[4]] = true;
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
                self.assertNotIn(f'h{n}', r['pop'], (pose, n))               # also with hard's extras
            self.assertEqual(list(r['popRows']), ['1'], pose)                 # only the second row
        # the reason for the z-order: the second row of a 7-10 letter word
        # is in the way of the pop-up
        pops = json.loads(result.stdout)['idle']['pop']
        self.assertEqual(sorted((k for k in pops if not k.startswith('h')), key=int), ['7', '8', '9', '10'])
        self.assertEqual(sorted((k for k in pops if k.startswith('h')), key=lambda k: int(k[1:])), ['h7', 'h8', 'h9', 'h10'])


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
        self.assertIn("import { LEVELS, loadLevel, saveLevel, streakAfter, levelUpFor } from './level.js';", main)
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
            # hard also has its two extra letters on the bench (B-207)
            word_tiles = [t for t in cur['tray'] if not t.get('extra')]
            self.assertEqual(len(cur['tray']) - len(word_tiles), 2 if level == 'hard' else 0)
            self.assertEqual(sorted(t['letter'] for t in word_tiles), sorted('tiger'))
            for t in word_tiles:
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
        # since B-208 the pick goes through pickRound (the theme's missed
        # words back, then pickWords by the level)
        self.assertIn("import { pickRound, makeWord } from './round.js';", main)
        self.assertNotIn('makeCurrent', main)
        self.assertNotIn('shuffle', main)
        start = self.function('startRound')
        # `level` is the one read when the theme was tapped, which is also
        # the round's level (round.level)
        self.assertIn('pickRound(data, ROUND_SIZE, level, missedWords(name))', start)
        self.assertIn('current: makeWord(words[0], level, newTileId),', start)
        self.assertIn('round: { index: 0, size: ROUND_SIZE, level, results: [] },', start)
        nxt = self.function('onNext')
        self.assertIn('current: makeWord(state.words[nextIndex], state.round.level, newTileId),', nxt)
        self.assertNotRegex(nxt, r'state\.level\b')

    def test_the_reveal_keeps_a_locked_letter_locked(self):
        # the reveal moved to drag.js with B-207 (a pure transition)
        self.assertIn('return p && p.letter === ch ? { ...p } : null;', self.function('revealed', 'drag.js'))

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


class LeverTests(TestCase):
    """Lever: wrong letters first, pull again to start over (BACKLOG
    B-205). static/js/drag.js leverResult(level, current) (which placed
    letters a pull sends back and which lock) and returnAll(current, level)
    (the pull applied to the word), run through node: on easy right after
    a wrong check only the wrong letters go back and the right ones lock;
    the next pull sends back every letter but the given one; normal and
    hard, and every level before a wrong check, send back every letter.
    The wiring in main.js is checked in the source."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

    def run_node(self, body):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
            f"const D = await import('{(self.JS / 'drag.js').as_uri()}');"
            f"const C = await import('{(self.JS / 'controls.js').as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def code(self, name):
        return re.sub(r'/\*.*?\*/|//[^\n]*', '', (self.JS / name).read_text(), flags=re.S)

    def function(self, name, file):
        js = self.code(file)
        start = re.search(rf'\n(export )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    @staticmethod
    def slot(letter, tile, locked=False):
        s = {'letter': letter, 'tileId': tile}
        if locked:
            s['locked'] = True
        return s

    def horse(self, level, status, letters, locked=()):
        """The word "horse" with `letters` in its slots (' ' = empty), one
        block per letter named by its letter (h, o, r, s, e). On easy the
        h is the given letter (locked in slot 1, its block `given`); the
        letters in `locked` (block ids) are locked too."""
        given = level == 'easy'
        tray = [{'id': t, 'letter': t, 'used': t in letters} for t in 'sroeh']
        if given:
            tray[-1]['given'] = True
        placed = [self.slot(ch, ch, (ch == 'h' and given) or ch in locked) if ch != ' ' else None for ch in letters]
        return {'word': 'horse', 'image': '/i.svg', 'audio': None, 'status': status, 'tray': tray, 'placed': placed}

    def pull(self, level, current):
        """[leverResult(level, current), returnAll(current, level), whether
        `current` was left untouched]."""
        return self.run_node(
            f"const cur = {json.dumps(current)}; const before = JSON.stringify(cur);"
            f"const r = D.leverResult({json.dumps(level)}, cur); const after = D.returnAll(cur, {json.dumps(level)});"
            "out([r, after, JSON.stringify(cur) === before]);")

    def used(self, current):
        return {t['id']: t['used'] for t in current['tray']}

    # --- leverResult and the pull ---

    def test_easy_after_a_wrong_check_sends_back_only_the_wrong_letters_and_locks_the_right(self):
        # "hsore": h given, s o r wrong, e right -> s, o, r go back; e locks
        result, after, pure = self.pull('easy', self.horse('easy', 'wrong', 'hsore'))
        self.assertEqual(result, {'back': ['s', 'o', 'r'], 'lock': ['e']})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), None, None, None, self.slot('e', 'e', True)])
        self.assertEqual(self.used(after), {'s': False, 'r': False, 'o': False, 'e': True, 'h': True})
        self.assertEqual(after['status'], 'playing')     # the dome stays off until the slots are full again
        self.assertTrue(pure)
        # the locked right letter is a locked slot like the given one: it
        # takes nothing and its block cannot be moved or tapped out
        self.assertEqual(self.run_node(
            f"const cur = {json.dumps(after)};"
            "out([D.isLocked(cur.placed[4]), D.placeIn(cur, 's', 4), D.placeIn(cur, 'e', 1), D.takeOut(cur, 'e'),"
            " C.domeAction(cur), C.canReset(cur)]);"),
            [True, None, None, None, None, True])

    def test_easy_second_pull_sends_back_everything_but_the_given_letter_and_unlocks_it(self):
        first = self.pull('easy', self.horse('easy', 'wrong', 'hsore'))[1]
        result, after, pure = self.pull('easy', first)
        self.assertEqual(result, {'back': ['e'], 'lock': []})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), None, None, None, None])
        self.assertEqual(self.used(after), {'s': False, 'r': False, 'o': False, 'e': False, 'h': True})
        self.assertTrue(pure)
        # any time later: blocks placed since the first pull go back too,
        # and the locked one unlocks (its slot is emptied)
        later = self.run_node(f"const cur = {json.dumps(first)}; out(D.placeIn(D.placeIn(cur, 'r', 1), 'o', 2));")
        result, after, _ = self.pull('easy', later)
        self.assertEqual(result, {'back': ['r', 'o', 'e'], 'lock': []})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), None, None, None, None])
        self.assertEqual(self.used(after), {'s': False, 'r': False, 'o': False, 'e': False, 'h': True})
        # with only the given letter left, a pull sends nothing back
        result, again, _ = self.pull('easy', after)
        self.assertEqual(result, {'back': [], 'lock': []})
        self.assertEqual(again['placed'], after['placed'])

    def test_easy_a_new_wrong_check_makes_the_next_pull_drop_the_wrong_letters_again(self):
        # after the first pull (e locked) the kid fills "hosre" and checks
        # wrong again: o is right now and locks, e stays locked, s and r go
        current = self.horse('easy', 'wrong', 'hosre', locked='e')
        result, after, _ = self.pull('easy', current)
        self.assertEqual(result, {'back': ['s', 'r'], 'lock': ['o', 'e']})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), self.slot('o', 'o', True), None, None,
                                           self.slot('e', 'e', True)])

    def test_easy_after_a_block_moved_since_the_wrong_check_the_pull_starts_over(self):
        # the wrong check belongs to the arrangement that was checked: once
        # a block moved (status back to 'playing') the lever cannot tell
        # right from wrong without a check, so it sends back every letter
        moved = self.run_node(f"out(D.takeOut({json.dumps(self.horse('easy', 'wrong', 'hsore'))}, 's'));")
        self.assertEqual(moved['status'], 'playing')
        result, after, _ = self.pull('easy', moved)
        self.assertEqual(result, {'back': ['o', 'r', 'e'], 'lock': []})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), None, None, None, None])

    def test_normal_and_hard_one_pull_sends_back_every_letter_and_never_locks(self):
        for level in ('normal', 'hard'):
            for status in ('wrong', 'playing'):
                result, after, pure = self.pull(level, self.horse(level, status, 'hsore'))
                self.assertEqual(result, {'back': ['h', 's', 'o', 'r', 'e'], 'lock': []}, (level, status))
                self.assertEqual(after['placed'], [None] * 5, (level, status))
                self.assertEqual(set(self.used(after).values()), {False}, (level, status))
                self.assertEqual(after['status'], 'playing')
                self.assertTrue(pure)

    def test_before_any_wrong_check_every_level_sends_back_every_letter_but_the_given_one(self):
        result, after, _ = self.pull('easy', self.horse('easy', 'playing', 'hro e'))
        self.assertEqual(result, {'back': ['r', 'o', 'e'], 'lock': []})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), None, None, None, None])
        self.assertEqual(self.used(after), {'s': False, 'r': False, 'o': False, 'e': False, 'h': True})
        for level in ('normal', 'hard'):
            result, after, _ = self.pull(level, self.horse(level, 'playing', 'hro e'))
            self.assertEqual(result, {'back': ['h', 'r', 'o', 'e'], 'lock': []}, level)
            self.assertEqual(after['placed'], [None] * 5, level)

    def test_a_word_with_a_letter_twice_judges_each_slot_by_its_letter(self):
        # "sheep" on easy, s given, checked as "seehp": either e block is
        # right in an e slot (as the check compares letters), so e2 in
        # slot 3 locks while e1 in slot 2 goes back, with the h; p locks
        current = {
            'word': 'sheep', 'status': 'wrong',
            'tray': [{'id': 's', 'letter': 's', 'used': True, 'given': True}, {'id': 'e1', 'letter': 'e', 'used': True},
                     {'id': 'p', 'letter': 'p', 'used': True}, {'id': 'h', 'letter': 'h', 'used': True},
                     {'id': 'e2', 'letter': 'e', 'used': True}],
            'placed': [self.slot('s', 's', True), self.slot('e', 'e1'), self.slot('e', 'e2'), self.slot('h', 'h'),
                       self.slot('p', 'p')],
        }
        result, after, _ = self.pull('easy', current)
        self.assertEqual(result, {'back': ['e1', 'h'], 'lock': ['e2', 'p']})
        self.assertEqual(after['placed'], [self.slot('s', 's', True), None, self.slot('e', 'e2', True), None,
                                           self.slot('p', 'p', True)])
        self.assertEqual(self.used(after), {'s': True, 'e1': False, 'p': True, 'h': False, 'e2': True})

    # --- wiring ---

    def test_the_rule_is_pure_and_reads_the_level_rules(self):
        drag = self.code('drag.js')
        self.assertIn("import { levelRules } from './level.js';", drag)
        for name in ('leverResult', 'returnAll'):
            body = self.function(name, 'drag.js')
            for word in ('document', 'window', 'state.', 'setState', 'gsap'):
                self.assertNotIn(word, body, (name, word))
        self.assertIn("current.status === 'wrong' && levelRules(level).leverDropsWrongFirst", self.function('leverResult', 'drag.js'))
        self.assertIn('leverResult(level, current)', self.function('returnAll', 'drag.js'))

    def test_the_lever_pulls_on_the_rounds_level(self):
        lever = self.function('onLever', 'main.js')
        self.assertIn("setState({ pressed: 'lever', current: returnAll(state.current, state.round.level) });", lever)
        self.assertNotRegex(lever, r'state\.level\b')


class HintTests(TestCase):
    """Second miss: the robot gives one letter (BACKLOG B-206). On every
    level the wrong check that leaves one bulb lit also places one letter:
    the first slot that is empty or wrong gets its right letter (from the
    bench if one lies there, else from the wrong slot it is in), the wrong
    letter in that slot goes back to the bench, and the letter locks.
    static/js/drag.js hintFor / giveHint and their lock and lever rules,
    character.js's hintGiven moment and its timing, and feedback.js's
    motion (with stand-ins for the DOM and GSAP) run through node; the
    wiring in main.js and the look in game.css are checked in the source."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

    def run_node(self, body):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
            f"const D = await import('{(self.JS / 'drag.js').as_uri()}');"
            f"const C = await import('{(self.JS / 'controls.js').as_uri()}');"
            f"const R = await import('{(self.JS / 'character.js').as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x)));"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def code(self, name):
        return re.sub(r'/\*.*?\*/|//[^\n]*', '', (self.JS / name).read_text(), flags=re.S)

    def function(self, name, file='main.js'):
        js = self.code(file)
        start = re.search(rf'\n(export )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    @staticmethod
    def slot(letter, tile, locked=False, hint=False):
        s = {'letter': letter, 'tileId': tile}
        if locked:
            s['locked'] = True
        if hint:
            s['hint'] = True
        return s

    def horse(self, level, status, letters, locked=()):
        """The word "horse" with `letters` in its slots (' ' = empty), one
        block per letter named by its letter (h, o, r, s, e), as in
        LeverTests. On easy the h is the given letter (locked in slot 1,
        its block `given`)."""
        given = level == 'easy'
        tray = [{'id': t, 'letter': t, 'used': t in letters} for t in 'sroeh']
        if given:
            tray[-1]['given'] = True
        placed = [self.slot(ch, ch, (ch == 'h' and given) or ch in locked) if ch != ' ' else None for ch in letters]
        return {'word': 'horse', 'image': '/i.svg', 'audio': None, 'status': status, 'tray': tray, 'placed': placed}

    def hint(self, current):
        """[hintFor(current), giveHint(current), whether `current` was left
        untouched]."""
        return self.run_node(
            f"const cur = {json.dumps(current)}; const before = JSON.stringify(cur);"
            "const r = D.hintFor(cur); const after = D.giveHint(cur);"
            "out([r, after, JSON.stringify(cur) === before]);")

    def used(self, current):
        return {t['id']: t['used'] for t in current['tray']}

    # --- which slot, which block ---

    def test_normal_the_first_wrong_slot_gets_its_letter_from_the_wrong_slot_it_is_in(self):
        # "hrose": r and o swapped. Slot 2 needs the o, which is in slot 3
        # (every block is in a slot at a check): the o moves there and
        # locks, the r goes back to the bench, slot 3 is left empty
        result, after, pure = self.hint(self.horse('normal', 'wrong', 'hrose'))
        self.assertEqual(result, {'index': 1, 'tileId': 'o', 'back': 'r'})
        self.assertEqual(after['placed'], [self.slot('h', 'h'), self.slot('o', 'o', True, True), None,
                                           self.slot('s', 's'), self.slot('e', 'e')])
        self.assertEqual(self.used(after), {'s': True, 'r': False, 'o': True, 'e': True, 'h': True})
        self.assertEqual(after['status'], 'wrong')     # the check's status: the dome stays off
        self.assertTrue(pure)

    def test_easy_skips_the_given_letter(self):
        # h is given and locked; "hsore": slot 2 needs the o (in slot 3),
        # the s there goes back
        result, after, _ = self.hint(self.horse('easy', 'wrong', 'hsore'))
        self.assertEqual(result, {'index': 1, 'tileId': 'o', 'back': 's'})
        self.assertEqual(after['placed'], [self.slot('h', 'h', True), self.slot('o', 'o', True, True), None,
                                           self.slot('r', 'r'), self.slot('e', 'e')])
        self.assertEqual(self.used(after), {'s': False, 'r': True, 'o': True, 'e': True, 'h': True})
        # the first slot may be the one: "ohrse" on normal
        result, after, _ = self.hint(self.horse('normal', 'wrong', 'ohrse'))
        self.assertEqual(result, {'index': 0, 'tileId': 'h', 'back': 'o'})
        self.assertEqual(after['placed'][:2], [self.slot('h', 'h', True, True), None])

    def test_a_block_on_the_bench_comes_from_the_bench_and_an_empty_slot_counts(self):
        # the o on the bench flies in from there; the r in the slot goes back
        result, after, _ = self.hint(self.horse('normal', 'wrong', 'hr se'))
        self.assertEqual(result, {'index': 1, 'tileId': 'o', 'back': 'r'})
        self.assertEqual(after['placed'], [self.slot('h', 'h'), self.slot('o', 'o', True, True), None,
                                           self.slot('s', 's'), self.slot('e', 'e')])
        self.assertEqual(self.used(after), {'s': True, 'r': False, 'o': True, 'e': True, 'h': True})
        # an empty first slot: nothing goes back; its o is in a wrong slot
        result, after, _ = self.hint(self.horse('normal', 'playing', 'h ose'))
        self.assertEqual(result, {'index': 1, 'tileId': 'o', 'back': None})
        self.assertEqual(after['placed'], [self.slot('h', 'h'), self.slot('o', 'o', True, True), None,
                                           self.slot('s', 's'), self.slot('e', 'e')])
        self.assertEqual(self.used(after), {'s': True, 'r': False, 'o': True, 'e': True, 'h': True})
        self.assertEqual(after['status'], 'playing')

    def test_a_block_in_a_right_slot_is_never_taken(self):
        # "sheep" checked as "shpee": slot 3 needs an e; e2 in slot 4 is
        # right, so e1 in slot 5 (wrong) moves, and the p goes back
        current = {
            'word': 'sheep', 'status': 'wrong',
            'tray': [{'id': 's', 'letter': 's', 'used': True}, {'id': 'e1', 'letter': 'e', 'used': True},
                     {'id': 'p', 'letter': 'p', 'used': True}, {'id': 'h', 'letter': 'h', 'used': True},
                     {'id': 'e2', 'letter': 'e', 'used': True}],
            'placed': [self.slot('s', 's'), self.slot('h', 'h'), self.slot('p', 'p'), self.slot('e', 'e2'),
                       self.slot('e', 'e1')],
        }
        result, after, _ = self.hint(current)
        self.assertEqual(result, {'index': 2, 'tileId': 'e1', 'back': 'p'})
        self.assertEqual(after['placed'], [self.slot('s', 's'), self.slot('h', 'h'), self.slot('e', 'e1', True, True),
                                           self.slot('e', 'e2'), None])
        # a letter the lever locked (always right) is skipped as a slot and
        # as a block
        result, _, _ = self.hint(self.horse('easy', 'wrong', 'hosre', locked='o'))
        self.assertEqual(result, {'index': 2, 'tileId': 'r', 'back': 's'})

    def test_nothing_to_give_when_every_slot_is_right(self):
        result, after, pure = self.hint(self.horse('normal', 'playing', 'horse'))
        self.assertIsNone(result)
        self.assertEqual(after, self.horse('normal', 'playing', 'horse'))
        self.assertTrue(pure)
        self.assertTrue(self.run_node(
            f"const cur = {json.dumps(self.horse('normal', 'playing', 'horse'))}; out(D.giveHint(cur) === cur);"))

    # --- the letter locks ---

    def test_the_hint_letter_is_locked_and_the_word_is_finished_by_hand(self):
        after = self.hint(self.horse('normal', 'wrong', 'hrose'))[1]
        res = self.run_node(
            f"const cur = {json.dumps(after)};"
            "const fixed = D.placeIn(cur, 'r', 2);"
            "out([D.isLocked(cur.placed[1]), D.placeIn(cur, 'r', 1), D.placeIn(cur, 'o', 2), D.takeOut(cur, 'o'),"
            " C.domeAction(cur), C.canReset(cur), fixed.status, C.domeAction(fixed),"
            " fixed.placed.map((p) => p.letter).join(''), fixed.placed[1]]);")
        self.assertEqual(res, [True, None, None, None, None, True, 'playing', 'check', 'horse',
                               self.slot('o', 'o', True, True)])

    def test_the_lever_leaves_the_hint_letter_on_every_level(self):
        pull = lambda level, cur: self.run_node(
            f"const cur = {json.dumps(cur)};"
            f"out([D.leverResult({json.dumps(level)}, cur), D.returnAll(cur, {json.dumps(level)})]);")
        # normal and hard: one pull sends back every other letter
        for level in ('normal', 'hard'):
            after = self.hint(self.horse(level, 'wrong', 'hrose'))[1]
            result, pulled = pull(level, after)
            self.assertEqual(result, {'back': ['h', 's', 'e'], 'lock': []}, level)
            self.assertEqual(pulled['placed'], [None, self.slot('o', 'o', True, True), None, None, None], level)
            self.assertEqual(self.used(pulled), {'s': False, 'r': False, 'o': True, 'e': False, 'h': False}, level)
        # easy right after the second miss: the wrong letters go back, the
        # right ones lock; the given and the hint letter are in neither list
        after = self.hint(self.horse('easy', 'wrong', 'hsore'))[1]
        result, first = pull('easy', after)
        self.assertEqual(result, {'back': ['r'], 'lock': ['e']})
        self.assertEqual(first['placed'], [self.slot('h', 'h', True), self.slot('o', 'o', True, True), None, None,
                                           self.slot('e', 'e', True)])
        # the next pull starts over: the lever-locked e goes back, the
        # given h and the robot's o stay
        result, second = pull('easy', first)
        self.assertEqual(result, {'back': ['e'], 'lock': []})
        self.assertEqual(second['placed'], [self.slot('h', 'h', True), self.slot('o', 'o', True, True), None, None, None])

    # --- the robot ---

    def test_the_robot_is_confused_then_gives_the_letter_happy(self):
        res = self.run_node(
            "const P = (s) => s.map((p) => (p ? { letter: p[0], tileId: p[1], ...(p[2] ? { locked: true, hint: true } : {}) } : null));"
            "const st = (lives, status, placed) => ({ screen: 'play', roundsStarted: 3, idleBeat: null, lockedTaps: 0, lives,"
            " round: { index: 0, size: 5, results: [] }, current: { word: 'cat', status, placed: P(placed) } });"
            "const m = (a, b) => R.momentsFor(R.snapshot(a), R.snapshot(b));"
            "const checked = st(2, 'playing', [['a', 't0'], ['c', 't1'], ['t', 't2']]);"
            "const hinted = st(1, 'wrong', [['c', 't1', 1], null, ['t', 't2']]);"
            "const filled = st(1, 'playing', [['c', 't1', 1], ['t', 't2'], ['a', 't0']]);"
            "const reveal = st(0, 'revealed', [['c', 't1', 1], ['a', 't0'], ['t', 't2']]);"
            "out([m(checked, hinted), m(hinted, hinted), m(st(3, 'playing', [['a', 't0'], ['c', 't1'], ['t', 't2']]),"
            " st(2, 'wrong', [['a', 't0'], ['c', 't1'], ['t', 't2']])), m(hinted, filled), m(filled, reveal),"
            " R.snapshot(hinted).hint, R.snapshot(checked).hint, R.NONE.hint,"
            " R.stepsFor(['wrongPeek', 'hintGiven']), R.soundsFor(['wrongPeek', 'hintGiven'])]);")
        self.assertEqual(res, [
            ['wrongPeek', 'hintGiven'], [], ['wrong'], ['filled'], ['thirdMiss'], 0, -1, -1,
            [{'pose': 'confused', 'move': 'peek'}, {'pose': 'happy', 'move': 'smallPop'}], ['error'],
        ])

    def test_his_pop_waits_for_the_peek_and_is_small(self):
        # CHARACTER "Presence": the peek keeps only his eyes above the
        # edge for 600ms, and changes are at least 300ms apart; the next
        # step waits for a step's move to end, so hintGiven comes when the
        # peek is over (950ms). Every other run of steps keeps 300ms.
        res = self.run_node(
            "const lasts = (ms, red) => R.stepsFor(ms).map((s) => R.moveMs(s.move, red));"
            "const two = ['wrongPeek', 'hintGiven'];"
            "out([R.moveMs('peek', false), R.moveMs('peek', true), R.moveMs('smallPop', false), R.moveMs('pop', false),"
            " R.stepDelays(2, Infinity, lasts(two, false)), R.stepDelays(2, 100, lasts(two, false)),"
            " R.stepDelays(2, Infinity, lasts(two, true)),"
            " [['kidIdle'], ['thirdMiss'], ['roundStart', 'picture']].map((ms) =>"
            "   JSON.stringify(R.stepDelays(R.stepsFor(ms).length, Infinity, lasts(ms, false))) === JSON.stringify(R.stepDelays(R.stepsFor(ms).length, Infinity))),"
            " R.MOVES.smallPop, R.MOVES.pop]);")
        peek, peek_reduced, small, pop, delays, delays_soon, delays_reduced, others, small_pop, full_pop = res
        self.assertEqual([peek, peek_reduced, small, pop], [950, 0, 300, 300])
        self.assertEqual(delays, [0, 950])
        self.assertEqual(delays_soon, [200, 1150])
        self.assertEqual(delays_reduced, [0, 300])
        self.assertEqual(others, [True, True, True])
        # the small pop is the pop at half the height, same timing
        self.assertEqual([s['y'] for s in small_pop], [p['y'] / 2 for p in full_pop])
        self.assertEqual([(s['duration'], s['ease']) for s in small_pop], [(p['duration'], p['ease']) for p in full_pop])

    # --- the motion (feedback.js, with stand-ins for the DOM and GSAP) ---

    FAKE_DOM = """
        const log = [];
        const later = [];
        const id = (el) => (Array.isArray(el) ? el.map((e) => e.id) : el.id);
        const timeline = () => {
            const t = { to(el, v, at) { log.push(['tl.to', id(el), v, at === undefined ? null : at]); return t; } };
            log.push(['timeline']);
            return t;
        };
        globalThis.gsap = {
            set(el, v) { log.push(['set', id(el), v]); },
            to(el, v) { log.push(['to', id(el), v]); },
            fromTo(el, a, b) { log.push(['fromTo', id(el), a, b]); },
            timeline,
            killTweensOf() {},
            getProperty(el) { return el.rot || 0; },
            delayedCall(s, fn) { log.push(['later', s]); later.push(fn); },
        };
        let reduced = false;
        globalThis.window = { matchMedia: () => ({ matches: reduced }) };
        const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) }; };
        const el = (name, x, y, w, rot = 0) => ({ id: name, rot, offsetWidth: w, classList: cls(),
            getBoundingClientRect: () => ({ left: x, top: y, width: w, height: w }) });
        // five slots 46px wide, 52px apart, at y 100; five bench spots 52px, 60px apart, at y 200
        const boxes = [0, 1, 2, 3, 4].map((i) => el('box' + i, 20 + i * 52, 100, 46));
        const spots = [0, 1, 2, 3, 4].map((i) => el('spot' + i, 20 + i * 60, 200, 52));
        const tiles = {};
        globalThis.document = {
            getElementById: (name) => (name === 'letter-boxes' ? { children: boxes } : name === 'letter-tray' ? { children: spots } : null),
            querySelector: (sel) => { const m = /data-tile-id="([^"]+)"/.exec(sel); return m ? tiles[m[1]] || null : null; },
            querySelectorAll: () => [],
        };
        const F = await import('FEEDBACK');
        // "horse" on normal, tray order s r o e h (bench spots 0-4), checked
        // as "hrose" with two bulbs lit: the miss leaves one and gives the o
        const tray = ['s', 'r', 'o', 'e', 'h'].map((t) => ({ id: t, letter: t, used: true }));
        const at = (letters) => letters.split('').map((ch) => (ch === ' ' ? null : { letter: ch, tileId: ch }));
        const before = { screen: 'play', lives: 2, pressed: null, round: { index: 0 },
            current: { word: 'horse', status: 'playing', tray, placed: at('hrose') } };
        const placed = at('hrose'); placed[1] = { letter: 'o', tileId: 'o', locked: true, hint: true }; placed[2] = null;
        const after = { ...before, lives: 1, current: { ...before.current, status: 'wrong', placed,
            tray: tray.map((t) => (t.id === 'r' ? { ...t, used: false } : t)) } };
        // where the render put them: r on its bench spot (tilted 3deg), o in slot 2
        tiles.r = el('r', 80, 200, 52, 3);
        tiles.o = el('o', 72, 100, 46);
        boxes.forEach((b) => { b.firstElementChild = null; });
    """

    def run_feedback(self, body):
        prelude = self.FAKE_DOM.replace('FEEDBACK', (self.JS / 'feedback.js').as_uri())
        return self.run_node(prelude + body)

    def test_the_wrong_letter_hops_back_then_his_letter_flies_in(self):
        log, landing, landed, cleared, again = self.run_feedback(
            "F.renderFeedback(before); F.renderFeedback(after);"
            "const landing = tiles.o.classList.contains('landing');"
            "const n = log.length; later.forEach((fn) => fn());"
            "const landed = tiles.o.classList.contains('landing');"
            "const cleared = log.slice(n); const m = log.length;"
            "F.renderFeedback(after);"
            "out([log.slice(0, n), landing, landed, cleared, log.length - m]);")
        r = [e for e in log if e[1:2] == ['r']]
        o = [e for e in log if e[1:2] == ['o']]
        size = round(46 / 52, 4)
        # r: held in slot 2 (centre 95,123; its spot's is 106,226), upright,
        # at a slot's size, lifted (over the o, which waits in slot 3 while
        # r hops past); it wiggles there, then hops (the lever's hop) back
        # onto its spot at 0.3s, turning to its tilt
        self.assertEqual(r[0], ['set', 'r', {'x': -11, 'y': -103, 'rotation': 0, 'scale': size,
                                             'position': 'relative', 'zIndex': 11}])
        self.assertEqual([e[2]['x'] for e in r[1:5]], [-17, -5, -17, -11])
        self.assertEqual(r[5], ['tl.to', 'r', {'x': 0, 'rotation': 3, 'scale': 1, 'duration': 0.3, 'ease': 'power1.inOut'}, 0.3])
        self.assertEqual(r[6], ['tl.to', 'r', {'y': -119, 'duration': 0.12, 'ease': 'power2.out'}, 0.3])
        self.assertEqual(r[7], ['tl.to', 'r', {'y': 0, 'duration': 0.18, 'ease': 'power2.in'}, 0.42])
        # o: held in slot 3 where it was checked (52px to the right), wiggles
        # there, then flies in like the reveal once r is down (0.6s)
        self.assertEqual(o[0], ['set', 'o', {'x': 52, 'y': 0, 'rotation': 0, 'scale': 1, 'position': 'relative', 'zIndex': 10}])
        self.assertEqual([e[2]['x'] for e in o[1:5]], [46, 58, 46, 52])
        self.assertEqual(o[5], ['tl.to', 'o', {'x': 0, 'y': 0, 'rotation': 0, 'scale': 1, 'duration': 0.3,
                                               'ease': 'back.out(1.4)'}, 0.6])
        self.assertEqual(len(r) + len(o), 14)
        # its locked edge lights as it lands (class `landing` until 0.9s);
        # everything set is put back by then
        self.assertTrue(landing)
        self.assertFalse(landed)
        self.assertEqual(sorted(e[1] for e in log if e[0] == 'later'), [0.6, 0.9, 0.9])
        self.assertEqual(cleared, [['set', 'r', {'clearProps': 'position,zIndex'}],
                                   ['set', 'o', {'clearProps': 'position,zIndex'}]])
        # a re-render in the same state starts nothing
        self.assertEqual(again, 0)

    def test_reduced_motion_fades_them_in_one_after_the_other(self):
        log, landing = self.run_feedback(
            "reduced = true; F.renderFeedback(before); F.renderFeedback(after);"
            "out([log, tiles.o.classList.contains('landing')]);")
        self.assertEqual([e for e in log if e[0] in ('set', 'fromTo', 'timeline')], [
            ['set', 'r', {'x': 0, 'y': 0}],
            ['fromTo', 'r', {'opacity': 0}, {'opacity': 1, 'duration': 0.2, 'delay': 0, 'ease': 'power1.out'}],
            ['set', 'o', {'x': 0, 'y': 0}],
            ['fromTo', 'o', {'opacity': 0}, {'opacity': 1, 'duration': 0.2, 'delay': 0.2, 'ease': 'power1.out'}],
        ])
        self.assertFalse(landing)

    def test_the_first_miss_gives_nothing(self):
        log = self.run_feedback(
            "const miss = { ...before, lives: 2, current: { ...before.current, status: 'wrong' } };"
            "F.renderFeedback({ ...before, lives: 3 }); F.renderFeedback(miss); out(log);")
        self.assertEqual([e for e in log if e[0] in ('set', 'timeline', 'later')], [])

    # --- wiring ---

    def test_the_check_that_leaves_one_bulb_gives_the_letter_on_every_level(self):
        main = self.code('main.js')
        self.assertIn("import { returnAll, giveHint, afterHint, revealed } from './drag.js';", main)
        check = self.function('onCheck')
        self.assertIn("const checked = { ...current, status: 'wrong' };", check)
        self.assertIn('const left = lives - 1;', check)
        self.assertIn('current: left === 1 ? giveHint(checked) : checked', check)
        self.assertEqual(check.count('giveHint('), 1)
        # every level: the round's level is not read
        self.assertNotIn('level', check)
        # a word checked correct after the hint is mastered like any other:
        # the result is the letters against the word, the sticker added
        # before the lives are looked at
        self.assertIn("const correct = answer === current.word;", check)
        self.assertLess(check.index('addSticker('), check.index('lives - 1 <= 0'))
        # the reveal keeps a right slot's object (so the hint letter stays
        # locked and marked through it); drag.js since B-207
        self.assertIn('return p && p.letter === ch ? { ...p } : null;', self.function('revealed', 'drag.js'))

    def test_the_helpers_are_pure_and_the_lever_skips_the_hint(self):
        for name in ('hintFor', 'giveHint'):
            body = self.function(name, 'drag.js')
            for word in ('document', 'window', 'state.', 'setState', 'gsap', 'levelRules'):
                self.assertNotIn(word, body, (name, word))
        self.assertIn('.filter(({ p }) => p && !given.has(p.tileId) && !p.hint);', self.function('leverResult', 'drag.js'))
        # a block picked up mid-motion stops where it is: its x, y and
        # scale tweens end on the press, also the parts of its motion not
        # yet started; a turn to its tilt (or a fade) still finishes
        drag = self.code('drag.js')
        press = drag[drag.index('onPress(e) {'):drag.index('onRelease()')]
        self.assertLess(press.index("gsap.killTweensOf(this.target, 'x,y,scale');"), press.index('pickUp(this.target);'))
        self.assertNotIn('gsap.killTweensOf(this.target);', press)
        # a block let go away from a slot springs back in x, y and scale
        # only, so that turn still ends at the bench spot's tilt
        self.assertIn("gsap.killTweensOf(el, 'x,y,scale');", self.function('springBack', 'drag.js'))

    def test_the_landing_look(self):
        css = re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)
        rule = re.search(r'\n\.letter-box\.locked > \.draggable-letter\.landing\s*{([^}]*)}', css).group(1)
        # drawn as a placed block, without the lit edge until it lands
        self.assertIn('1px 2px 3px var(--shadow-deep);', rule)
        self.assertNotIn('amber', rule)
        # the CSS cache-buster was bumped for this look (later items bump it again)
        html = (self.ROOT / 'templates' / 'spelling_game' / 'index.html').read_text()
        self.assertGreaterEqual(int(re.search(r"css/game\.css' %}\?v=(\d+)", html).group(1)), 20)


class HardExtrasTests(TestCase):
    """Hard: two extra letters on the bench (BACKLOG B-207). static/js/
    round.js extraLetters (the confusion table: partners of the word's
    letters first, else random letters, never one of the word) and makeWord
    (two `extra` blocks on hard, none on easy and normal); drag.js: an
    extra moves like any block and is wrong in any slot, the lever sends it
    back, the second-miss hint and the reveal never use one, and afterHint
    reopens a word the robot's letter finished; character.js's moments
    with extras; feedback.js hops an extra out of its slot on the reveal.
    All run through node; the wiring in main.js is checked in the source."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

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
            f"const H = await import('{(self.JS / 'character.js').as_uri()}');"
            f"{self.PRELUDE}"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def code(self, name):
        return re.sub(r'/\*.*?\*/|//[^\n]*', '', (self.JS / name).read_text(), flags=re.S)

    def function(self, name, file='main.js'):
        js = self.code(file)
        start = re.search(rf'\n(export )?(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    def words(self):
        return [w for theme in ('animals', 'transportation')
                for w in json.loads((self.ROOT / 'static' / 'data' / f'{theme}.json').read_text())]

    def extras(self, word, seeds=40, count=2):
        return self.run_node(
            f"out(Array.from({{ length: {seeds} }}, (_, i) => R.extraLetters({json.dumps(word)}, {count}, seeded(i + 1))));")

    # --- the letters ---

    def test_two_different_letters_never_in_the_word(self):
        words = self.words()
        picks = self.run_node(
            f"const words = {json.dumps(words)};"
            "out(words.map((w) => Array.from({ length: 30 }, (_, i) => R.extraLetters(w, 2, seeded(i + 1)))));")
        for word, runs in zip(words, picks):
            for letters in runs:
                self.assertEqual(len(letters), 2, word)
                self.assertEqual(len(set(letters)), 2, (word, letters))
                for ch in letters:
                    self.assertRegex(ch, r'^[a-z]$')
                    self.assertNotIn(ch, word, (word, letters))

    def test_the_table_has_the_backlogs_pairs(self):
        pairs = {frozenset(p) for p in self.run_node("out(R.CONFUSIONS);")}
        for a, b in ('bd', 'pq', 'ck', 'sz', 'mn', 'ie', 'ae', 'uo'):
            self.assertIn(frozenset((a, b)), pairs, a + b)

    def test_partners_of_the_words_letters_come_first(self):
        # duck: d -> b, u -> o, c -> s (c -> k and k -> c are in the word):
        # both extras are always partners, and each of the three comes up
        runs = self.extras('duck')
        for letters in runs:
            self.assertLessEqual(set(letters), {'b', 'o', 's'})
        self.assertEqual(set().union(*map(set, runs)), {'b', 'o', 's'})
        # helicopter: e -> a, i -> y, c -> k / s, o -> u, p -> q
        for letters in self.extras('helicopter'):
            self.assertLessEqual(set(letters), {'a', 'y', 'k', 's', 'u', 'q'})
        # fly has one partner (y -> i): i, then a random letter not in it
        runs = self.extras('fly')
        for letters in runs:
            self.assertIn('i', letters)
        self.assertGreater(len({ch for letters in runs for ch in letters}), 5)
        # no partner at all: two random letters, not in the word
        runs = self.extras('fht')
        for letters in runs:
            self.assertFalse(set(letters) & set('fht'))
        self.assertGreater(len({ch for letters in runs for ch in letters}), 10)

    def test_no_extras_and_no_randomness_when_the_level_has_none(self):
        self.assertEqual(
            self.run_node("const never = () => { throw new Error('rand'); };"
                          "out([R.extraLetters('duck', 0, never), R.extraLetters('duck', undefined, never)]);"),
            [[], []])

    def test_hard_puts_two_extra_blocks_on_the_bench(self):
        words = self.words()
        made = self.run_node(
            f"const words = {json.dumps(words)};"
            "out(words.map((w, i) => R.makeWord({ word: w, image: '/i.svg' }, 'hard', newId, seeded(i + 1))));")
        positions = set()
        for word, cur in zip(words, made):
            self.assertEqual(cur['placed'], [None] * len(word))
            self.assertEqual(cur['status'], 'playing')
            extra = [t for t in cur['tray'] if t.get('extra')]
            plain = [t for t in cur['tray'] if not t.get('extra')]
            self.assertEqual(len(extra), 2, word)
            self.assertEqual(sorted(t['letter'] for t in plain), sorted(word))
            self.assertFalse({t['letter'] for t in extra} & set(word), word)
            self.assertFalse(any(t['used'] or t.get('given') for t in cur['tray']), word)
            self.assertEqual(len({t['id'] for t in cur['tray']}), len(word) + 2)
            positions.update(i for i, t in enumerate(cur['tray']) if t.get('extra'))
        # shuffled in with the others, not always at the end
        self.assertGreater(len(positions), 4)

    def test_easy_and_normal_have_none_and_start_as_before(self):
        res = self.run_node(
            "out(['easy', 'normal', null].map((lv) => Array.from({ length: 10 }, (_, i) => {"
            "  const cur = R.makeWord({ word: 'helicopter' }, lv, newId, seeded(i + 1));"
            "  return [cur.tray.length, cur.tray.some((t) => 'extra' in t),"
            "          cur.tray.map((t) => t.letter).join('') === R.shuffle('helicopter'.split(''), seeded(i + 1)).join('')];"
            "})));")
        for runs in res:
            for length, has_extra, same_order in runs:
                self.assertEqual((length, has_extra, same_order), (10, False, True))

    # --- an extra on the play screen: moves like any block, wrong in a slot ---

    # duck on hard: blocks named by their letter, the extras xb and xo
    @staticmethod
    def duck(letters, status='playing', hint_at=None):
        """`letters` in the slots (' ' empty; B and O are the extras)."""
        ids = {'d': 'd', 'u': 'u', 'c': 'c', 'k': 'k', 'B': 'xb', 'O': 'xo'}
        tray = [{'id': i, 'letter': i[-1], 'used': i in [ids[ch] for ch in letters if ch != ' ']}
                for i in ('xo', 'k', 'd', 'xb', 'u', 'c')]
        for t in tray:
            if t['id'].startswith('x'):
                t['extra'] = True
        placed = []
        for n, ch in enumerate(letters):
            if ch == ' ':
                placed.append(None)
                continue
            slot = {'letter': ids[ch][-1], 'tileId': ids[ch]}
            if n == hint_at:
                slot.update(locked=True, hint=True)
            placed.append(slot)
        return {'word': 'duck', 'image': '/i.svg', 'audio': '/a.mp3', 'status': status, 'tray': tray, 'placed': placed}

    def test_an_extra_moves_like_any_block_and_the_check_ignores_the_bench(self):
        res = self.run_node(
            f"const empty = {json.dumps(self.duck('    '))};"
            f"const spelled = {json.dumps(self.duck('duck'))};"
            f"const withExtra = {json.dumps(self.duck('duBk'))};"
            "const a = D.placeIn(empty, 'xb', 0); const b = D.placeIn(a, 'xb', 2); const c = D.takeOut(b, 'xb');"
            "const swap = D.placeIn(withExtra, 'c', 2);"
            "out([a.placed[0], b.placed, c.placed, c.tray.find((t) => t.id === 'xb'),"
            " swap.placed[2], swap.tray.find((t) => t.id === 'xb').used,"
            " C.domeAction(spelled), C.domeAction(withExtra), C.canReset(withExtra)]);")
        self.assertEqual(res, [
            {'letter': 'b', 'tileId': 'xb'},
            [None, None, {'letter': 'b', 'tileId': 'xb'}, None],
            [None, None, None, None],
            {'id': 'xb', 'letter': 'b', 'used': False, 'extra': True},
            {'letter': 'c', 'tileId': 'c'}, False,
            # every slot right with both extras on the bench: ready to check;
            # with an extra in a slot it can be checked too (and is wrong)
            'check', 'check', True,
        ])
        # the check is the slots' letters against the word: the bench (and
        # the extras on it) is not looked at, and an extra in a slot is a
        # letter that is not the word's
        check = self.function('onCheck')
        self.assertIn("const answer = current.placed.map((p) => p.letter).join('');", check)
        self.assertIn('const correct = answer === current.word;', check)
        self.assertNotIn('tray', check)

    def test_the_lever_sends_an_extra_back(self):
        res = self.run_node(
            f"const cur = {json.dumps(self.duck('dOBk', 'wrong'))};"
            "const after = D.returnAll(cur, 'hard');"
            "out([D.leverResult('hard', cur), after.placed, after.tray.filter((t) => t.used).length, after.status]);")
        self.assertEqual(res, [{'back': ['d', 'xo', 'xb', 'k'], 'lock': []}, [None] * 4, 0, 'playing'])

    # --- the second-miss hint never uses one ---

    def test_the_hint_never_gives_an_extra(self):
        res = self.run_node(
            f"const a = {json.dumps(self.duck('dBck', 'wrong'))};"
            f"const b = {json.dumps(self.duck('dukc', 'wrong'))};"
            # a made-up bench where an extra block has the letter needed: it
            # is still not taken (the d comes from the wrong slot it is in)
            f"const c = {json.dumps(self.duck('kduc', 'wrong'))};"
            "c.tray.find((t) => t.id === 'xo').letter = 'd';"
            "const ga = D.giveHint(a);"
            "out([D.hintFor(a), ga.placed[1], ga.tray.find((t) => t.id === 'xb').used, D.hintFor(b), D.hintFor(c)]);")
        self.assertEqual(res, [
            # its slot's extra goes back, its right letter comes from the bench
            {'index': 1, 'tileId': 'u', 'back': 'xb'},
            {'letter': 'u', 'tileId': 'u', 'locked': True, 'hint': True},
            False,
            {'index': 2, 'tileId': 'c', 'back': 'k'},
            {'index': 0, 'tileId': 'd', 'back': 'k'},
        ])

    def test_a_hint_that_finishes_the_word_reopens_it(self):
        # "duBk" checked wrong with one bulb left: the hint puts the c from
        # the bench in slot 3 and sends the b back; every slot is right, an
        # arrangement nobody checked, so the word reopens and the dome lights
        res = self.run_node(
            f"const done = D.giveHint({json.dumps(self.duck('duBk', 'wrong'))});"
            f"const two = D.giveHint({json.dumps(self.duck('dOBk', 'wrong'))});"
            f"const normal = D.giveHint({json.dumps(self.duck('dkcu', 'wrong'))});"
            "const open = D.afterHint(done);"
            f"const others = ['playing', 'correct', 'revealed'].map((s) => {{ const c = {{ ...{json.dumps(self.duck('duck'))}, status: s }}; return D.afterHint(c) === c; }});"
            "out([done.status, C.domeAction(done), open.status, C.domeAction(open), C.domeState(open, null),"
            " open.placed.map((p) => p.letter).join(''), open.placed[2],"
            " D.afterHint(two) === two, C.domeAction(two), D.afterHint(normal) === normal, others]);")
        self.assertEqual(res, [
            'wrong', None, 'playing', 'check', 'ready', 'duck', {'letter': 'c', 'tileId': 'c', 'locked': True, 'hint': True},
            # another wrong letter left (the o), or a slot left empty: the
            # check's 'wrong' stays until a block moves, as before
            True, None, True,
            [True, True, True],
        ])

    def test_main_reopens_after_the_miss_in_a_setstate_of_its_own(self):
        check = self.function('onCheck')
        miss = check.index("current: left === 1 ? giveHint(checked) : checked")
        after = check.index('const reopened = afterHint(state.current);')
        self.assertLess(miss, after)
        self.assertIn('if (reopened !== state.current) setState({ current: reopened });', check)
        self.assertNotIn('level', check)
        for name in ('afterHint', 'revealed'):
            body = self.function(name, 'drag.js')
            for word in ('document', 'window', 'state.', 'setState', 'gsap', 'levelRules'):
                self.assertNotIn(word, body, (name, word))
        self.assertNotIn('function revealed', self.code('main.js'))

    def test_the_robot_hears_the_miss_then_nothing_more(self):
        # the miss's setState (status 'wrong', his letter in) is his
        # confused peek, his happy pop and the error clip; the reopen right
        # after it is no moment and no sound
        res = self.run_node(
            f"const before = {json.dumps(self.duck('duBk'))};"
            "const hinted = D.giveHint({ ...before, status: 'wrong' });"
            "const st = (lives, current) => ({ screen: 'play', roundsStarted: 3, idleBeat: null, lockedTaps: 0, lives,"
            " round: { index: 0, size: 5, results: [] }, current });"
            "const a = H.snapshot(st(2, before)), b = H.snapshot(st(1, hinted)), c = H.snapshot(st(1, D.afterHint(hinted)));"
            "out([H.momentsFor(a, b), H.soundsFor(H.momentsFor(a, b)), H.momentsFor(b, c)]);")
        self.assertEqual(res, [['wrongPeek', 'hintGiven'], ['error'], []])

    def test_the_robot_sees_an_extra_as_a_block(self):
        res = self.run_node(
            "const st = (letters, status = 'playing') => ({ screen: 'play', roundsStarted: 3, idleBeat: null, lockedTaps: 0, lives: 3,"
            " round: { index: 0, size: 5, results: [] }, current: CUR(letters, status) });"
            f"const CUR = (l, s) => ({{ ...{json.dumps(self.duck('    '))}, status: s, placed: l.split('').map((ch) => ch === ' ' ? null"
            " : { letter: ch.toLowerCase(), tileId: { B: 'xb', O: 'xo' }[ch] || ch }) });"
            "const m = (a, b) => H.momentsFor(H.snapshot(st(a)), H.snapshot(st(b)));"
            "out([m('d   ', 'dB  '), m('duc ', 'ducO'), m('duBk', 'du k'), m('dOBk', '    ')]);")
        self.assertEqual(res, [['blockPlaced'], ['filled'], ['blockReturned'], ['blockReturned']])

    # --- the reveal never uses one ---

    def test_the_reveal_never_uses_an_extra(self):
        res = self.run_node(
            f"const cur = {json.dumps(self.duck('BuOc', 'playing', hint_at=1))};"
            "const r = D.revealed(cur);"
            "const easy = D.revealed({ word: 'cat', status: 'playing', placed: [{ letter: 'c', tileId: 'c', locked: true }, { letter: 't', tileId: 't' }, null],"
            " tray: [{ id: 't', letter: 't', used: true }, { id: 'a', letter: 'a', used: false }, { id: 'c', letter: 'c', used: true, given: true }] });"
            "out([r.status, r.placed, r.tray.map((t) => [t.id, t.used]), easy.placed.map((p) => p.tileId), easy.tray.every((t) => t.used)]);")
        status, placed, used, easy_ids, easy_used = res
        self.assertEqual(status, 'revealed')
        self.assertEqual(placed, [{'letter': 'd', 'tileId': 'd'}, {'letter': 'u', 'tileId': 'u', 'locked': True, 'hint': True},
                                  {'letter': 'c', 'tileId': 'c'}, {'letter': 'k', 'tileId': 'k'}])
        # the extras go back to the bench, every word block is in a slot
        self.assertEqual(dict(used), {'xo': False, 'k': True, 'd': True, 'xb': False, 'u': True, 'c': True})
        # easy and normal as before: every block in a slot, a locked one kept
        self.assertEqual((easy_ids, easy_used), (['c', 'a', 't'], True))

    def test_on_the_reveal_an_extra_hops_back_as_the_right_letters_fly_in(self):
        # feedback.js with stand-ins for the DOM and GSAP: "duck" checked a
        # third time as "Bdck" (the extra b in slot 1, the d in slot 2, the
        # u on the bench): the d flies from slot 2 into slot 1, the u from
        # its bench spot into slot 2 (review fix round 1: it used to jump
        # there unseen), in slot order 120ms apart, and the b hops back
        res = self.run_node(
            "const log = [];"
            "const r = (v) => Math.round(v * 1e4) / 1e4;"
            "globalThis.gsap = { set(el, v) { log.push(['set', el.id || el.map((e) => e.id), v]); },"
            " to() {}, fromTo(el, a, b) { log.push(['fromTo', el.id, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, r(v)])),"
            "  b.delay, b.ease, b.scale === undefined ? null : b.scale]); },"
            " timeline() { const t = { fromTo(el) { log.push(['hop', el.id]); return t; }, to() { return t; } }; return t; },"
            " killTweensOf() {}, getProperty() { return 0; }, delayedCall() {} };"
            "globalThis.window = { matchMedia: () => ({ matches: false }) };"
            "const el = (id, x, y, w) => ({ id, parentNode: null, offsetWidth: w,"
            " getBoundingClientRect: () => ({ left: x, top: y, width: w, height: w }) });"
            # four 46px slots 52px apart at y 100; six 52px bench spots 60px apart at y 200
            "const boxes = [0, 1, 2, 3].map((i) => el('box' + i, 20 + i * 52, 100, 46));"
            "const spots = [0, 1, 2, 3, 4, 5].map((i) => el('spot' + i, 20 + i * 60, 200, 52));"
            # where the render put them: d in slot 1, u in slot 2, c and k
            # where they were, the extras on their bench spots (tray order
            # xo k d xb u c)
            "const tiles = { d: el('d', 20, 100, 46), u: el('u', 72, 100, 46), c: el('c', 124, 100, 46), k: el('k', 176, 100, 46),"
            " xb: el('xb', 200, 200, 52), xo: el('xo', 20, 200, 52) };"
            "globalThis.document = { getElementById: (n) => (n === 'letter-boxes' ? { children: boxes } : { children: spots }),"
            " querySelector: (sel) => tiles[/data-tile-id=\"([^\"]+)\"/.exec(sel)?.[1]] || null, querySelectorAll: () => [] };"
            f"const F = await import('{(self.JS / 'feedback.js').as_uri()}');"
            f"const before = {json.dumps(self.duck('Bdck'))};"
            "const after = D.revealed(before);"
            "const st = (lives, current) => ({ screen: 'play', lives, pressed: null, round: { index: 0 }, current });"
            "F.renderFeedback(st(1, before));"
            "tiles.xb.parentNode = spots[3]; tiles.xo.parentNode = spots[0];"
            "after.placed.forEach((p, i) => { tiles[p.tileId].parentNode = boxes[i]; });"
            "F.renderFeedback(st(0, after));"
            "out(log.filter((e) => e[0] === 'fromTo' || e[0] === 'hop'));")
        fly = [e for e in res if e[0] == 'fromTo']
        # d: from slot 2 (52px right), the size it has; u: from bench spot 5
        # (centre 286,226; its slot's 95,123) at the bench's size (52/46)
        self.assertEqual(fly, [
            ['fromTo', 'd', {'x': 52, 'y': 0, 'rotation': 0}, 0, 'back.out(1.4)', None],
            ['fromTo', 'u', {'x': 191, 'y': 103, 'rotation': 0, 'scale': round(52 / 46, 4)}, 0.12, 'back.out(1.4)', 1],
        ])
        # the b hops back to the bench (its hop's x and y parts); c and k
        # stay, the o on the bench too
        self.assertEqual({e[1] for e in res if e[0] == 'hop'}, {'xb'})


class MissedWordsTests(TestCase):
    """Missed words come back (BACKLOG B-208). static/js/missed.js keeps
    the words a round missed per theme in localStorage `flip.missed.v1`
    (shape { "<theme>": ["horse", ...] }, the oldest miss first; read and
    written only there), and round.js pickRound brings up to two of them
    back in the theme's next round, in random places; run through node
    with a fake localStorage and a seeded Math.random. The wiring in
    main.js (the pick at startRound, the record at the round end only) is
    checked in the source."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

    # In-memory localStorage (SEED: the key's initial value or null),
    # counting writes; a seeded Math.random stand-in.
    PRELUDE = """
        const store = new Map();
        if (SEED !== null) store.set('flip.missed.v1', SEED);
        let writes = 0;
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { writes++; store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
        };
        const raw = () => store.get('flip.missed.v1') ?? null;
        const seeded = (s) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
        const out = (v) => console.log(JSON.stringify(v));
    """

    def run_node(self, body, seed=None):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
            f"const SEED = {json.dumps(seed)};"
            f"{self.PRELUDE}"
            f"const M = await import('{(self.JS / 'missed.js').as_uri()}');"
            f"const R = await import('{(self.JS / 'round.js').as_uri()}');"
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

    def rounds(self, data, level, missed, seeds=60):
        return self.run_node(
            f"const data = {json.dumps(data)}; const missed = {json.dumps(missed)};"
            f"out(Array.from({{ length: {seeds} }}, (_, i) => R.pickRound(data, 5, {json.dumps(level)}, missed, seeded(i + 1))));")

    # --- missed.js: the list per theme ---

    def test_missing_key_is_no_missed_words(self):
        self.assertEqual(self.run_node("out([M.load(), M.wordsFor('animals'), raw(), writes]);"), [{}, [], None, 0])

    def test_a_round_end_remembers_the_missed_words_in_the_documented_shape(self):
        # the revealed words (correct: false) are remembered in round
        # order; the words checked correct are not
        results = [
            {'word': 'duck', 'correct': True, 'newSticker': True}, {'word': 'horse', 'correct': False},
            {'word': 'wolf', 'correct': True, 'newSticker': False}, {'word': 'tiger', 'correct': False},
            {'word': 'bear', 'correct': True, 'newSticker': True},
        ]
        back, lists, stored, mine = self.run_node(
            f"const back = M.record('animals', {json.dumps(results)});"
            "out([back, M.load(), JSON.parse(raw()), M.wordsFor('animals')]);")
        self.assertEqual(back, ['horse', 'tiger'])
        self.assertEqual(lists, {'animals': ['horse', 'tiger']})
        self.assertEqual(stored, {'animals': ['horse', 'tiger']})
        self.assertEqual(mine, ['horse', 'tiger'])

    def test_a_word_left_without_a_correct_check_counts_as_missed(self):
        # "skipped": today the only way past a word is a correct check or
        # the reveal; onNext records a word without a result as
        # { word, correct: false }, and anything not correct is missed
        self.assertEqual(
            self.run_node("out(M.record('animals', [{ word: 'deer', correct: false }, { word: 'lion' }, null, { correct: false }, { word: '' }]));"),
            ['deer', 'lion'])

    def test_a_correct_word_comes_out_and_a_new_miss_goes_to_the_end(self):
        lists, writes = self.run_node(
            "M.record('animals', [{ word: 'horse', correct: true }, { word: 'lion', correct: false },"
            " { word: 'cat', correct: false }, { word: 'dog', correct: true }, { word: 'mouse', correct: true }]);"
            "out([M.load(), writes]);",
            seed='{"animals": ["horse", "tiger", "lion"], "transportation": ["bus"]}')
        # horse spelled: out; lion missed again: now the newest; cat new;
        # tiger not played: keeps its place; the other theme untouched
        self.assertEqual(lists, {'animals': ['tiger', 'lion', 'cat'], 'transportation': ['bus']})
        self.assertEqual(writes, 1)

    def test_the_last_word_out_drops_the_theme_and_no_change_writes_nothing(self):
        lists, stored = self.run_node(
            "M.record('animals', [{ word: 'horse', correct: true }]); out([M.load(), JSON.parse(raw())]);",
            seed='{"animals": ["horse"], "transportation": ["bus"]}')
        self.assertEqual(lists, {'transportation': ['bus']})
        self.assertEqual(stored, {'transportation': ['bus']})
        # a round all correct with none of them in the list: nothing to write
        self.assertEqual(
            self.run_node(
                "const r = M.record('transportation', [{ word: 'car', correct: true }, { word: 'taxi', correct: true }]);"
                "out([r, writes, raw()]);", seed='{"transportation": ["bus"]}'),
            [['bus'], 0, '{"transportation": ["bus"]}'])
        # nor for no theme
        self.assertEqual(self.run_node("out([M.record('', [{ word: 'cat', correct: false }]), M.record(null, []), writes]);"), [[], [], 0])

    def test_corrupt_json_is_no_missed_words_and_a_round_end_recovers(self):
        for seed in ('{not json', '"a string"', '[1, 2]', 'null', '42'):
            self.assertEqual(
                self.run_node("out([M.load(), M.wordsFor('animals'), M.record('animals', [{ word: 'cat', correct: false }]), M.load()]);", seed=seed),
                [{}, [], ['cat'], {'animals': ['cat']}], seed)

    def test_bad_entries_inside_the_lists_are_dropped(self):
        self.assertEqual(
            self.run_node("out(M.load());", seed='{"animals": ["deer", "deer", 3, null, "", "lion"], "transportation": "bus", "x": null, "y": []}'),
            {'animals': ['deer', 'lion']})

    def test_no_or_blocked_localstorage_is_no_missed_words(self):
        self.assertEqual(
            self.run_node(
                "delete globalThis.localStorage;"
                "const a = [M.load(), M.wordsFor('animals'), M.record('animals', [{ word: 'cat', correct: false }]), M.wordsFor('animals')];"
                "Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });"
                "out([...a, M.load(), M.record('animals', [{ word: 'cat', correct: false }])]);"),
            [{}, [], ['cat'], [], {}, ['cat']])

    def test_after_round_is_pure(self):
        words, results, after = self.run_node(
            "const words = ['horse', 'tiger']; const results = [{ word: 'tiger', correct: false }, { word: 'horse', correct: true }];"
            "const after = M.afterRound(words, results); out([words, results, after]);")
        self.assertEqual(words, ['horse', 'tiger'])
        self.assertEqual(results, [{'word': 'tiger', 'correct': False}, {'word': 'horse', 'correct': True}])
        self.assertEqual(after, ['tiger'])
        self.assertEqual(self.run_node("out([M.afterRound(undefined, [{ word: 'cat' }]), M.afterRound(['cat'], undefined)]);"),
                         [['cat'], ['cat']])

    # --- round.js pickRound: the round-picking helper ---

    def test_with_no_missed_word_the_pick_is_as_before(self):
        # nothing remembered, or only words the theme no longer has: the
        # level's pick (pickWords) with the same random numbers
        data = self.content('animals')
        for level in ('easy', 'normal', 'hard'):
            for missed in ([], None, ['unicorn', 'dragon']):
                same = self.run_node(
                    f"const data = {json.dumps(data)};"
                    "out(Array.from({ length: 20 }, (_, i) => JSON.stringify(R.pickRound(data, 5, "
                    f"{json.dumps(level)}, {json.dumps(missed) if missed is not None else 'undefined'}, seeded(i + 1))) ==="
                    f" JSON.stringify(R.pickWords(data, 5, {json.dumps(level)}, seeded(i + 1)))));")
                self.assertEqual(same, [True] * 20, (level, missed))

    def test_the_two_oldest_missed_words_come_back_on_every_level(self):
        data = self.content('animals')
        missed = ['tiger', 'rabbit', 'lion', 'wolf']
        for level in ('easy', 'normal', 'hard'):
            for words in self.rounds(data, level, missed):
                self.assertEqual(len(words), 5, level)
                self.assertEqual(len(set(words)), 5, level)
                self.assertLessEqual(set(words), set(data), level)
                self.assertLessEqual({'tiger', 'rabbit'}, set(words), level)
                # up to two: the newer misses wait for a later round
                self.assertEqual(set(words) & set(missed), {'tiger', 'rabbit'}, level)

    def test_one_missed_word_comes_back_and_the_others_follow_the_level(self):
        data = self.content('animals')
        easy = {w for w, v in data.items() if v.get('difficulty') == 'easy'}
        seen = set()
        for words in self.rounds(data, 'easy', ['horse']):
            self.assertIn('horse', words)
            # easy fills the other four from its easy-tagged words
            self.assertLessEqual(set(words) - {'horse'}, easy)
            seen |= set(words)
        self.assertEqual(seen, easy | {'horse'})
        # transportation on easy: a long word missed on hard comes back,
        # and the other places are three of easy's five tagged words
        data = self.content('transportation')
        tagged = {'boat', 'bus', 'car', 'scooter', 'taxi'}
        for words in self.rounds(data, 'easy', ['helicopter', 'submarine']):
            self.assertLessEqual({'helicopter', 'submarine'}, set(words))
            self.assertEqual(len(set(words) & tagged), 3)
        # normal and hard: the other places from the whole rest of the theme
        for level in ('normal', 'hard'):
            seen = {w for words in self.rounds(data, level, ['helicopter']) for w in words}
            self.assertEqual(seen, set(data), level)

    def test_missed_words_come_back_in_random_places(self):
        data = self.content('animals')
        for level in ('easy', 'normal'):
            rounds = self.rounds(data, level, ['tiger', 'rabbit'])
            for word in ('tiger', 'rabbit'):
                self.assertEqual({words.index(word) for words in rounds}, {0, 1, 2, 3, 4}, (level, word))

    def test_words_the_theme_no_longer_has_are_skipped(self):
        data = self.content('animals')
        for words in self.rounds(data, 'normal', ['unicorn', 'tiger', 'tiger', 'dragon', 'lion', 'bear']):
            self.assertEqual(set(words) & {'tiger', 'lion', 'bear'}, {'tiger', 'lion'})

    def test_a_theme_with_every_word_missed_still_gets_a_full_round(self):
        data = {w: {'image': f'/{w}.svg'} for w in ('ant', 'bee', 'cow', 'pig', 'yak', 'emu')}
        missed = ['pig', 'emu', 'ant', 'bee', 'cow', 'yak']
        for level in ('easy', 'hard'):
            for words in self.rounds(data, level, missed, seeds=20):
                self.assertEqual(len(set(words)), 5, level)
                self.assertLessEqual({'pig', 'emu'}, set(words), level)
        # and a round shorter than the list takes only the oldest
        self.assertEqual(sorted(self.run_node(
            f"out(R.pickRound({json.dumps(data)}, 1, 'normal', {json.dumps(missed)}, seeded(3)));")), ['pig'])

    def test_the_pick_leaves_its_inputs_alone(self):
        data = self.content('animals')
        before, after, missed = self.run_node(
            f"const data = {json.dumps(data)}; const missed = ['tiger', 'lion', 'wolf']; const before = JSON.stringify(data);"
            "R.pickRound(data, 5, 'easy', missed, seeded(5)); out([before, JSON.stringify(data), missed]);")
        self.assertEqual(before, after)
        self.assertEqual(missed, ['tiger', 'lion', 'wolf'])

    def test_a_missed_word_comes_back_until_it_is_spelled(self):
        # three rounds of animals on normal through both modules, as
        # main.js runs them: startRound picks with wordsFor(theme), the
        # round end records the results
        data = self.content('animals')
        res = self.run_node(
            f"const data = {json.dumps(data)}; const rounds = [];"
            "const play = (seed, wrong) => {"
            "  const words = R.pickRound(data, 5, 'normal', M.wordsFor('animals'), seeded(seed));"
            "  const missed = wrong(words);"
            "  M.record('animals', words.map((word) => ({ word, correct: !missed.includes(word) })));"
            "  rounds.push({ words, after: M.wordsFor('animals') }); return missed; };"
            # round 1: the 2nd and 4th words revealed; round 2: the first of
            # them missed again; round 3: all spelled
            "const missed = play(1, (w) => [w[1], w[3]]);"
            "play(2, () => [missed[0]]); play(3, () => []);"
            "out({ missed, rounds });")
        missed, rounds = res['missed'], res['rounds']
        self.assertEqual(rounds[0]['after'], missed)
        self.assertLessEqual(set(missed), set(rounds[1]['words']))
        self.assertEqual(rounds[1]['after'], [missed[0]])
        self.assertIn(missed[0], rounds[2]['words'])
        self.assertEqual(rounds[2]['after'], [])

    # --- wiring ---

    def test_only_missed_js_names_the_key_and_it_has_no_dom(self):
        for path in sorted(self.JS.glob('*.js')):
            text = path.read_text()
            if path.name == 'missed.js':
                self.assertIn("export const KEY = 'flip.missed.v1';", text)
            else:
                self.assertNotIn('flip.missed', text, path.name)
        code = self.code('missed.js')
        for word in ('document', 'window', 'import', 'state'):
            self.assertNotIn(word, code, word)
        self.assertNotIn('localStorage', self.code('main.js'))

    def test_pick_round_is_pure_and_reads_the_level_through_pick_words(self):
        pick = self.function('pickRound', 'round.js')
        self.assertIn('pickWords(', pick)
        self.assertNotRegex(pick, r'localStorage|document|window|state\.')
        self.assertIn('export const MISSED_BACK = 2;', self.code('round.js'))

    def test_main_picks_with_the_themes_missed_words_and_records_only_at_the_round_end(self):
        main = self.code('main.js')
        self.assertIn("import { wordsFor as missedWords, record as recordMissed } from './missed.js';", main)
        self.assertIn('pickRound(data, ROUND_SIZE, level, missedWords(name))', self.function('startRound'))
        # recorded once, in onNext's round-end branch, before the screen
        # changes; a round left with the back button records nothing
        self.assertEqual(main.count('recordMissed('), 1)
        nxt = self.function('onNext')
        end = nxt.index('if (nextIndex >= round.size) {')
        rec = nxt.index('recordMissed(state.theme, results);')
        self.assertLess(end, rec)
        self.assertLess(rec, nxt.index("screen: 'round-end'"))
        self.assertLess(rec, nxt.index('} else {', end))
        for name in ('onPlayBack', 'onThemes', 'onCheck', 'startRound'):
            self.assertNotIn('recordMissed', self.function(name), name)

    def test_stickers_still_only_for_correct_words(self):
        main = self.code('main.js')
        self.assertEqual(main.count('addSticker('), 1)
        check = self.function('onCheck')
        branch = check[check.index('if (correct) {'):check.index('} else if (lives - 1 <= 0) {')]
        self.assertIn('results[round.index].newSticker = addSticker(state.theme, current.word);', branch)
        self.assertNotIn('missed', self.code('stickers.js'))


class LevelUpTests(TestCase):
    """The level-up nudge (BACKLOG B-209): level.js nextLevel, streakAfter
    and levelUpFor (pure, run through node); the streak of 3-star rounds
    on one level in state.js, this session only, written once per
    finished round (main.js onNext) and never by a round left with the
    back button; the round-end screen's #level-up-btn (the next level's
    bulbs, lit, in a pulsing glow; none on hard) and its tap, which sets
    the level through level.js and starts a round of the same theme."""

    ROOT = Path(__file__).resolve().parent.parent
    MODULE = ROOT / 'static' / 'js' / 'level.js'

    def run_node(self, body):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
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

    def function(self, name, module='main.js'):
        js = self.code(module)
        start = re.search(rf'\n(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)

    def rule(self, selector):
        return re.search(r'\n' + re.escape(selector) + r'\s*{([^}]*)}', self.css()).group(1)

    # --- level.js (pure) ---

    def test_next_level(self):
        self.assertEqual(
            self.run_node("out([L.nextLevel('easy'), L.nextLevel('normal'), L.nextLevel('hard'),"
                          " L.nextLevel(null), L.nextLevel(undefined), L.nextLevel('Hard')]);"),
            ['normal', 'hard', None, None, None, None],
        )

    def test_three_star_rounds_on_one_level_count_up(self):
        self.assertEqual(
            self.run_node("const a = L.streakAfter({ level: null, rounds: 0 }, 'easy', 3);"
                          "const b = L.streakAfter(a, 'easy', 3); const c = L.streakAfter(b, 'easy', 3);"
                          "out([a, b, c, L.LEVEL_UP_ROUNDS]);"),
            [{'level': 'easy', 'rounds': 1}, {'level': 'easy', 'rounds': 2}, {'level': 'easy', 'rounds': 3}, 2],
        )

    def test_fewer_than_three_stars_break_the_streak(self):
        self.assertEqual(
            self.run_node("out([0, 1, 2].map((s) => L.streakAfter({ level: 'easy', rounds: 2 }, 'easy', s)));"),
            [{'level': 'easy', 'rounds': 0}] * 3,
        )

    def test_a_round_on_another_level_starts_over(self):
        self.assertEqual(
            self.run_node("out([L.streakAfter({ level: 'easy', rounds: 2 }, 'normal', 3),"
                          " L.streakAfter({ level: 'easy', rounds: 2 }, 'normal', 2),"
                          " L.streakAfter({ level: 'normal', rounds: 1 }, 'easy', 3)]);"),
            [{'level': 'normal', 'rounds': 1}, {'level': 'normal', 'rounds': 0}, {'level': 'easy', 'rounds': 1}],
        )

    def test_streak_after_is_a_new_object_and_takes_any_start(self):
        self.assertEqual(
            self.run_node("const s = Object.freeze({ level: 'easy', rounds: 1 }); const n = L.streakAfter(s, 'easy', 3);"
                          "out([n, s, n === s,"
                          " [undefined, null, {}, { level: 'easy' }, { level: 'easy', rounds: 'x' }, { level: 'easy', rounds: -1 }]"
                          "   .map((v) => L.streakAfter(v, 'easy', 3))]);"),
            [{'level': 'easy', 'rounds': 2}, {'level': 'easy', 'rounds': 1}, False,
             [{'level': 'easy', 'rounds': 1}] * 6],
        )

    def test_level_up_for(self):
        self.assertEqual(
            self.run_node("out([{ level: null, rounds: 0 }, { level: 'easy', rounds: 1 }, { level: 'easy', rounds: 2 },"
                          " { level: 'easy', rounds: 3 }, { level: 'normal', rounds: 2 }, { level: 'hard', rounds: 2 },"
                          " { level: 'hard', rounds: 7 }, { level: 'Hard', rounds: 2 }, { level: 'easy', rounds: '2' },"
                          " null, undefined, {}].map((s) => L.levelUpFor(s)));"),
            [None, None, 'normal', 'normal', 'hard', None, None, None, None, None, None, None],
        )

    def test_rounds_in_a_row_as_main_js_plays_them(self):
        # each round's end: streakAfter, then what the round-end screen
        # shows (levelUpFor); the stars come from score.js as in onNext
        score = (self.ROOT / 'static' / 'js' / 'score.js').as_uri()
        self.assertEqual(
            self.run_node(
                f"const {{ starsFor }} = await import('{score}');"
                "const play = (rounds) => { let s = { level: null, rounds: 0 }; return rounds.map(([level, correct]) => {"
                "  s = L.streakAfter(s, level, starsFor(correct, 5)); return L.levelUpFor(s); }); };"
                "out([play([['easy', 5], ['easy', 5]]),"
                " play([['easy', 5], ['easy', 4], ['easy', 5]]),"
                " play([['easy', 5], ['normal', 5]]),"
                " play([['easy', 5], ['easy', 5], ['easy', 5]]),"
                " play([['easy', 5], ['easy', 5], ['normal', 5], ['normal', 5]]),"
                " play([['normal', 5], ['normal', 5]]),"
                " play([['hard', 5], ['hard', 5], ['hard', 5]]),"
                " play([['easy', 4], ['easy', 4], ['easy', 0]])]);"),
            [[None, 'normal'],
             [None, None, None],
             [None, None],
             [None, 'normal', 'normal'],
             [None, 'normal', None, 'hard'],
             [None, 'hard'],
             [None, None, None],
             [None, None, None]],
        )

    # --- state and main.js ---

    def test_the_streak_is_in_state_for_this_session_only(self):
        state = (self.ROOT / 'static' / 'js' / 'state.js').read_text()
        self.assertIn('\n    streak: { level: null, rounds: 0 },', state)
        for f in sorted((self.ROOT / 'static' / 'js').glob('*.js')):
            self.assertNotIn('flip.streak', self.code(f.name), f.name)
        for name in ('level.js', 'main.js'):
            self.assertNotRegex(self.code(name), r'setItem\([^)]*streak', name)

    def test_the_streak_moves_once_per_finished_round(self):
        main = self.code('main.js')
        self.assertEqual(len(re.findall(r'\bstreak:', main)), 1)
        nxt = self.function('onNext')
        end = nxt.index('if (nextIndex >= round.size) {')
        branch = nxt[end:nxt.index('} else {', end)]
        self.assertIn('const stars = starsFor(results.filter((r) => r.correct).length, round.size);', branch)
        # in the setState that shows the round-end screen
        call = branch[branch.index('setState({'):]
        self.assertIn("screen: 'round-end',", call)
        self.assertIn('streak: streakAfter(state.streak, round.level, stars),', call)
        # a round left with the back button (or for the theme screen), a
        # new round, a check and the nudge's tap leave it
        for name in ('onPlayBack', 'onThemes', 'startRound', 'onCheck', 'onLevelUp', 'onLevel'):
            self.assertNotIn('streak:', self.function(name), name)
        self.assertNotRegex(nxt, r'state\.level\b')

    def test_round_end_renders_the_nudge_from_the_streak(self):
        self.assertIn('renderLevelUp(state);', self.function('renderRoundEnd'))
        render = self.function('renderLevelUp')
        self.assertIn('const next = levelUpFor(state.streak);', render)
        self.assertIn("const btn = $('level-up-btn');", render)
        self.assertIn('btn.hidden = !next;', render)
        self.assertIn("btn.innerHTML = next ? '<span class=\"bulb\"></span>'.repeat(LEVELS.indexOf(next) + 1) : '';", render)
        self.assertIn("btn.setAttribute('aria-label', next ? `next level: ${next}` : 'next level');", render)

    def test_the_tap_sets_the_level_and_starts_the_same_theme(self):
        main = self.code('main.js')
        self.assertIn("$('level-up-btn').addEventListener('click', onLevelUp);", main)
        tap = self.function('onLevelUp')
        self.assertIn("if (state.screen !== 'round-end' || state.startingRound) return;", tap)
        self.assertIn('const next = levelUpFor(state.streak);', tap)
        self.assertIn('if (!next) return;', tap)
        # remembered through level.js as a pick on the theme screen is,
        # set before the round starts (startRound reads state.level)
        self.assertLess(tap.index('saveLevel(next);'), tap.index('setState({ level: next });'))
        self.assertLess(tap.index('setState({ level: next });'), tap.index('onPlayAgain();'))
        self.assertIn('const theme = state.themes.find((t) => t.name === state.theme);', self.function('onPlayAgain'))
        self.assertLess(self.function('startRound').index('const level = state.level;'),
                        self.function('startRound').index('await fetch('))

    # --- the button ---

    def test_the_button_is_a_bulb_icon_button_right_of_play_again(self):
        html = self.client.get('/').content.decode()
        end = html[html.index('<div id="screen-round-end"'):html.index('<div id="screen-gallery"')]
        actions = end[end.index('<div class="actions">'):]
        self.assertLess(actions.index('id="themes-btn"'), actions.index('id="play-again-btn"'))
        self.assertLess(actions.index('id="play-again-btn"'), actions.index('id="level-up-btn"'))
        m = re.search(r'<button id="level-up-btn"([^>]*)>(.*?)</button>', actions, flags=re.S)
        self.assertIsNotNone(m)
        attrs, inner = m.groups()
        self.assertIn('class="panel-btn level-btn level-up"', attrs)
        self.assertIn('type="button"', attrs)
        self.assertRegex(attrs, r'aria-label="[^"]+"')
        self.assertRegex(attrs, r'\shidden(\s|$)')
        self.assertNotIn('aria-pressed', attrs)
        self.assertEqual(re.sub(r'<[^>]+>', '', inner).strip(), '')    # no text
        # one button with that id, not in the theme screen's picker
        self.assertEqual(html.count('id="level-up-btn"'), 1)

    def test_the_glow_pulses_and_the_bulbs_are_lit(self):
        css = self.css()
        self.assertIn('display: none;', self.rule('.level-up[hidden]'))
        self.assertIn('opacity: 1;', self.rule('.level-up .bulb::before'))
        self.assertIn('position: relative;', self.rule('.level-up'))
        glow = self.rule('.level-up::after')
        self.assertIn('animation: level-up-glow 1.2s ease-in-out infinite alternate;', glow)
        self.assertIn('pointer-events: none;', glow)
        self.assertRegex(glow, r'box-shadow: [^;]*var\(--amber\)[^;]*var\(--glow-amber\);')
        frames = re.search(r'@keyframes level-up-glow\s*{(.*?)\n}', css, flags=re.S).group(1)
        self.assertRegex(frames, r'from\s*{\s*opacity: 0\.3;\s*}')
        self.assertRegex(frames, r'to\s*{\s*opacity: 1;\s*}')
        # reduced motion: a steady glow
        self.assertRegex(css, r'@media \(prefers-reduced-motion: reduce\) {\s*\.level-up::after {\s*animation: none;\s*}')
        # the picker's bulbs (14px) through .level-btn, the lives bulbs' look
        self.assertIn('width: 14px;', self.rule('.level-btn .bulb'))

    def test_three_buttons_fit_the_row_clear_of_the_bezel(self):
        # the column is 324px at 360 (18px safe sides); the row of three
        # stays 36px or more from the screen's edges (the frame's 28px
        # border and 8px); the row of two keeps its 48px gap
        gap = int(re.search(r'gap: (\d+)px;', self.rule('#screen-round-end .actions:has(.level-up:not([hidden]))')).group(1))
        width = 3 * 72 + 2 * gap
        self.assertLessEqual(width, 360 - 2 * 36)
        self.assertIn('gap: 48px;', self.rule('.actions'))

    def test_the_ring_clears_the_bezel_below(self):
        # review fix round 1: the row ends `margin-bottom` above the safe
        # area's bottom (the column's padding, --safe-bottom); the ring
        # reaches `inset` + its spread below the button. Its bottom must
        # be at or above the safe-area bottom + 2px (the bezel's visible
        # inner edge, y 720 at 360x740), on any screen height, since the
        # row sits at the bottom whenever the screen fits.
        css = self.css()
        safe_bottom = int(re.search(r'--safe-bottom: (\d+)px;', css).group(1))
        rows = re.findall(r'\n#screen-round-end \.actions\s*{([^}]*)}', css)
        margins = [int(m) for body in rows for m in re.findall(r'margin-bottom: (\d+)px;', body)]
        self.assertEqual(len(margins), 1)
        glow = self.rule('.level-up::after')
        inset = -int(re.search(r'inset: (-\d+)px;', glow).group(1))
        spread = int(re.search(r'box-shadow: 0 0 0 (\d+)px var\(--amber\)', glow).group(1))
        self.assertEqual(inset + spread, 8)
        for height in (740, 667, 640):
            button_bottom = height - safe_bottom - margins[0]
            self.assertLessEqual(button_bottom + inset + spread, height - safe_bottom + 2, height)
        # on every round-end, not only with the nudge
        self.assertNotIn('margin-bottom', self.rule('#screen-round-end .actions:has(.level-up:not([hidden]))'))

    # --- one round at a time (review fix round 1) ---

    def test_a_round_being_started_takes_no_second_tap(self):
        state = (self.ROOT / 'static' / 'js' / 'state.js').read_text()
        self.assertIn('\n    startingRound: false,', state)
        start = self.function('startRound')
        # the guard first, then the level, then the flag before the fetch
        self.assertLess(start.index('if (state.startingRound) return;'), start.index('const level = state.level;'))
        self.assertLess(start.index('const level = state.level;'), start.index('setState({ startingRound: true });'))
        self.assertLess(start.index('setState({ startingRound: true });'), start.index('await fetch('))
        # a failed fetch lets the next tap try again; the round's own
        # setState clears it with everything else
        catch = start[start.index('} catch (e) {'):]
        self.assertLess(catch.index('setState({ startingRound: false });'), catch.index('throw e;'))
        last = start[start.rindex('setState({'):]
        self.assertIn("screen: 'play',", last)
        self.assertIn('roundsStarted: state.roundsStarted + 1,', last)
        self.assertIn('startingRound: false,', last)
        # only startRound writes it; the nudge also waits (its level must
        # not change under a round play again already started)
        main = self.code('main.js')
        self.assertEqual(len(re.findall(r'\bstartingRound:', main)), 3)
        self.assertIn("if (state.screen !== 'round-end' || state.startingRound) return;", self.function('onLevelUp'))
        for name in ('onPlayAgain', 'onThemes', 'onNext', 'onLevelUp', 'onLevel', 'onPlayBack'):
            self.assertNotIn('startingRound:', self.function(name), name)
