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
    """static/js/layout.js slotLayout(): 8px of brass round the slots and
    the ladder of BACKLOG B-213 (DESIGN.md "Layout"): 1-6 letters one row
    of 46px slots 6px apart; 7-8 letters one row, never broken, the slots
    shrunk to the largest whole px that fits (never under 36px), 4px
    apart, the letter 0.58 of the slot and the tap and drop area reaching
    the rail's edges; 9-10 letters two rows of 46px split at the word's
    `break`, each row centred, at half without one. A rail narrower than
    360 wide holds what fits, in rows as even as possible (B-113)."""

    MODULE = Path(__file__).resolve().parent.parent / 'static' / 'js' / 'layout.js'
    RAIL = 332   # 360px phone minus the frame's 14px safe area on each side

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def node(self, expr):
        script = (
            f"import * as L from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify({expr}));"
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def layout(self, count, width=RAIL, brk=None):
        return self.node(f"L.slotLayout({count}, {width}, {json.dumps(brk)})")

    @staticmethod
    def xs(l, width):
        """Each slot's left edge in the rail (px from its outer left edge):
        the grid has two columns per slot of the longest row, each
        (size - gap) / 2 wide, `gap` apart, centred inside the padding."""
        half = (l['size'] - l['gap']) / 2
        grid = 2 * l['cols'] * half + (2 * l['cols'] - 1) * l['gap']
        left = l['pad'] + (width - 2 * l['pad'] - grid) / 2
        return [left + (c['col'] - 1) * (half + l['gap']) for c in l['cells']]

    def test_slot_size_gap_and_padding(self):
        self.assertEqual(self.layout(4), {
            'size': 46, 'gap': 6, 'pad': 8, 'font': 28, 'hit': {'x': 0, 'y': 0}, 'cols': 4, 'rows': 1, 'split': [4],
            'cells': [{'row': 1, 'col': 1}, {'row': 1, 'col': 3}, {'row': 1, 'col': 5}, {'row': 1, 'col': 7}], 'joints': []})

    def test_up_to_six_letters_fit_one_row_at_phone_width(self):
        for n in range(1, 7):
            l = self.layout(n)
            self.assertEqual((l['size'], l['gap'], l['cols'], l['rows'], l['split'], l['joints']), (46, 6, n, 1, [n], []), n)

    def test_seven_and_eight_letters_shrink_into_one_row(self):
        # 41px for 7 letters and 36px for 8 at 360 wide, 4px apart, a
        # letter of 0.58 of the slot, the tap and drop area out to the
        # rail's edges (8px of padding) and halfway into the gaps
        seven, eight = self.layout(7), self.layout(8)
        self.assertEqual((seven['size'], seven['gap'], seven['font'], seven['hit']), (41, 4, 24, {'x': 2, 'y': 8}))
        self.assertEqual((eight['size'], eight['gap'], eight['font'], eight['hit']), (36, 4, 21, {'x': 2, 'y': 8}))
        inner = self.RAIL - 16
        for l, n in ((seven, 7), (eight, 8)):
            self.assertEqual((l['rows'], l['split'], l['joints']), (1, [n], []))
            # the largest whole size that fits
            self.assertLessEqual(n * l['size'] + (n - 1) * 4, inner)
            self.assertGreater(n * (l['size'] + 1) + (n - 1) * 4, inner)
            # the tap area covers the rail's full height: about 52px
            self.assertEqual(l['size'] + 2 * l['hit']['y'], l['size'] + 2 * l['pad'])
        self.assertEqual(eight['size'] + 2 * eight['hit']['y'], 52)

    def test_seven_and_eight_letters_never_break_even_with_a_break(self):
        # scooter 4, bicycle 2 in the content; an 8-letter word likewise
        for n, brk in ((7, 4), (7, 2), (8, 4), (8, 3)):
            l = self.layout(n, brk=brk)
            self.assertEqual((l['rows'], l['split'], l['joints']), (1, [n], []), (n, brk))
            self.assertEqual(l, self.layout(n), (n, brk))

    def test_the_slots_never_shrink_under_36px_nor_grow_over_46px(self):
        # a 480px column (452px rail): 7 and 8 fit at 46px, still 4px apart
        for n in (7, 8):
            l = self.layout(n, 452)
            self.assertEqual((l['size'], l['gap'], l['font'], l['hit'], l['rows']), (46, 4, 28, {'x': 0, 'y': 0}, 1), n)
        # 412 and 375 wide phones: one row in between
        for width in (384, 347):
            for n in (7, 8):
                l = self.layout(n, width)
                self.assertTrue(36 <= l['size'] <= 46, (n, width, l['size']))
                self.assertEqual(l['rows'], 1)
        # under 360 wide 8 slots of 36px no longer fit: two even rows of
        # 46px, as many as fit on a row
        l = self.layout(8, 300)
        self.assertEqual((l['size'], l['split']), (46, [4, 4]))

    def test_nine_and_ten_letters_split_at_the_break(self):
        # the content's words: helicopter 4 (heli | copter), submarine 3
        # (sub | marine), motorbike 5 (motor | bike); 46px slots, 6px apart
        for n, brk, split in ((10, 4, [4, 6]), (9, 3, [3, 6]), (9, 5, [5, 4]), (10, 6, [6, 4]), (10, 5, [5, 5])):
            l = self.layout(n, brk=brk)
            self.assertEqual((l['size'], l['gap'], l['font'], l['hit'], l['rows'], l['split']),
                             (46, 6, 28, {'x': 0, 'y': 0}, 2, split), (n, brk))
            self.assertEqual([c['row'] for c in l['cells']], [1] * split[0] + [2] * split[1])
            # the joint: the end of the first row and the start of the second
            self.assertEqual(l['joints'], [{'at': brk - 1, 'side': 'end'}, {'at': brk, 'side': 'start'}])

    def test_each_row_is_centred(self):
        for n, brk in ((10, 4), (9, 3), (9, 5), (10, None), (9, None), (8, None), (7, None), (5, None)):
            for width in (self.RAIL, 452):
                l = self.layout(n, width, brk)
                xs, k = self.xs(l, width), 0
                for count in l['split']:
                    row = xs[k:k + count]
                    k += count
                    left, right = row[0], width - (row[-1] + l['size'])
                    self.assertAlmostEqual(left, right, msg=(n, brk, width))
                    # slots `gap` apart on the row
                    self.assertTrue(all(abs(b - a - l['size'] - l['gap']) < 1e-9 for a, b in zip(row, row[1:])), (n, brk, row))

    def test_without_a_usable_break_nine_and_ten_split_at_half(self):
        # round.js makeWord warns about a missing break; the rail falls
        # back to the even split, never by a break that cannot split it
        for brk in (None, 0, 10, 11, -2, 2.5, '4'):
            self.assertEqual(self.layout(10, brk=brk)['split'], [5, 5], brk)
            self.assertEqual(self.layout(9, brk=brk if brk != 10 else 9)['split'], [5, 4], brk)
        # a break whose row would not fit the rail: also at half
        self.assertEqual(self.layout(10, brk=1)['split'], [5, 5])
        self.assertEqual(self.node("[L.isBreak(4, 10), L.isBreak(9, 10), L.isBreak(10, 10), L.isBreak(0, 9), L.isBreak(2.5, 9), L.isBreak('3', 9), L.isBreak(null, 9)]"),
                         [True, True, False, False, False, False, False])

    def test_every_row_fits_the_rail(self):
        for n in range(1, 11):
            for brk in [None] + list(range(1, n)):
                l = self.layout(n, brk=brk)
                self.assertLessEqual(max(l['split']) * l['size'] + (max(l['split']) - 1) * l['gap'] + 2 * 8, self.RAIL, (n, brk))
                self.assertEqual(sum(l['split']), n)
                self.assertEqual(len(l['cells']), n)
                self.assertLessEqual(l['rows'], 2)

    def test_narrow_rail_holds_what_fits(self):
        # 280px rail: 264px inside, five 46px slots with 6px gaps
        l = self.layout(6, 280)
        self.assertEqual((l['cols'], l['rows'], l['split']), (3, 2, [3, 3]))
        self.assertEqual(l['joints'], [{'at': 2, 'side': 'end'}, {'at': 3, 'side': 'start'}])

    def test_zero_letters_is_safe(self):
        self.assertEqual(self.layout(0), {'size': 46, 'gap': 6, 'pad': 8, 'font': 28, 'hit': {'x': 0, 'y': 0},
                                          'cols': 1, 'rows': 0, 'split': [], 'cells': [], 'joints': []})

    def test_a_slots_drop_area(self):
        # slotArea grows a slot by `hit`; dropsIn is GSAP's hitTest(block,
        # slot, '50%') for 46px slots (half of the smaller of the two),
        # and on a small slot the area reaching the rail's edges only adds
        # to it: a block let go over the brass round the slot lands
        res = self.node(
            "(() => {"
            " const r = (left, top, w, h = w) => ({ left, top, width: w, height: h });"
            " const slot = r(100, 100, 36), hit = { x: 2, y: 8 }, none = { x: 0, y: 0 };"
            " const big = r(100, 100, 46);"
            " return ["
            "  L.slotArea(slot, hit),"
            # 46px slot: half of the slot's area (1058px²) or not
            "  L.dropsIn(r(100 - 3, 100 + 23, 56), big, none), L.dropsIn(r(100 - 3, 100 + 26, 56), big, none),"
            # 36px slot, the block's centre 32px below the slot's: 14px x 36 of the
            # slot (504px², under half of 1296) but 22px x 40 of its area (880px²)
            "  L.dropsIn(r(90, 122, 56), slot, none), L.dropsIn(r(90, 122, 56), slot, hit),"
            # touching, or beside the area: never
            "  L.dropsIn(r(138, 100, 56), slot, hit), L.dropsIn(r(100, 144, 56), slot, hit),"
            # the area never makes it stricter: a corner overlap that lands on
            # the slot (26px x 26) lands on its area (28 x 34) too
            "  L.dropsIn(r(110, 110, 56), slot, none), L.dropsIn(r(110, 110, 56), slot, hit),"
            " ];"
            "})()")
        self.assertEqual(res[0], {'left': 98, 'top': 92, 'width': 40, 'height': 52, 'right': 138, 'bottom': 144})
        self.assertEqual(res[1:], [True, False, False, True, False, False, True, True])


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
    lower corners also clear the frame's rounded inner corners. Since
    BACKLOG B-213 a 7-8 letter word is one row of smaller slots and a 9-10
    letter word two rows split at its `break` (every split whose rows fit
    is checked), with the brass joint on the rail."""

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

    def layouts(self, count, brk=None):
        bench = self.W - 2 * self.SIDE
        script = (
            f"import {{ slotLayout, blockLayout }} from '{self.MODULE.as_uri()}';"
            f"console.log(JSON.stringify([slotLayout({count}, {bench}, {json.dumps(brk)}), blockLayout({count}, {bench})]));"
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
            # 9-10 letters: every break whose rows fit, and none
            for brk in [None] + ([b for b in range(3, n - 2)] if n > 8 else []):
                for extras in (0, 2):
                    slots, _ = self.layouts(n, brk)
                    _, blocks = self.layouts(n + extras)
                    rail_h = 2 * slots['pad'] + slots['rows'] * slots['size'] + (slots['rows'] - 1) * slots['gap']
                    bench_top = rail_top + rail_h + self.GAP
                    # the column fits the screen: the console is not pushed down
                    self.assertLessEqual(bench_top + blocks['height'] + self.GAP, console_top, (n, brk, extras))
                    for s in blocks['spots']:
                        x, y = self.SIDE + s['x'], bench_top + s['y']
                        box = (x - self.TILT, y - self.TILT, x + blocks['size'] + self.TILT, y + blocks['size'] + self.TILT)
                        for name, zone in zones.items():
                            self.assertFalse(self.overlap(box, zone), (n, brk, extras, name, box, zone))

    def test_long_words_rail_heights(self):
        # BACKLOG B-213 at 360 wide: one row of 41px (7 letters) or 36px
        # (8) slots makes the rail 57 or 52px tall (62 for 1-6 letters);
        # two rows of 46px for 9-10 letters, 114px, whatever the break
        def rail_h(n, brk=None):
            sl, _ = self.layouts(n, brk)
            return 2 * sl['pad'] + sl['rows'] * sl['size'] + (sl['rows'] - 1) * sl['gap']
        self.assertEqual([rail_h(n) for n in range(1, 11)], [62] * 6 + [57, 52, 114, 114])
        self.assertEqual({rail_h(10, b) for b in (4, 5, 6)} | {rail_h(9, b) for b in (3, 4, 5, 6)}, {114})

    def test_the_brass_joint_stays_on_the_rail(self):
        # each half of the joint (game.css .rail-joint: `width`, 1px off
        # its slot) lies inside the rail's 8px padding or the free brass
        # beside a row, never on another slot and never past the rail's
        # edge, for every split whose rows fit, at 360 and 480 wide
        css = re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)
        joint = re.search(r'\n\.rail-joint\s*{(.*?)}', css, flags=re.S).group(1)
        jw = float(re.search(r'\n\s*width:\s*([\d.]+)px;', joint).group(1))
        jh = float(re.search(r'\n\s*height:\s*([\d.]+)px;', joint).group(1))
        self.assertIn('pointer-events: none;', joint)
        off = float(re.search(r'\n\.rail-joint\.end\s*{[^}]*left: calc\(100% \+ ([\d.]+)px\);', css).group(1))
        self.assertIn(f'right: calc(100% + {off:g}px);', re.search(r'\n\.rail-joint\.start\s*{([^}]*)}', css).group(1))
        for width in (self.W - 2 * self.SIDE, 452):
            for n in (9, 10):
                for brk in [None] + list(range(3, n - 2)):
                    sl = json.loads(subprocess.run(
                        ['node', '--input-type=module', '-e',
                         f"import {{ slotLayout }} from '{self.MODULE.as_uri()}';"
                         f"console.log(JSON.stringify(slotLayout({n}, {width}, {json.dumps(brk)})));"],
                        capture_output=True, text=True, timeout=20).stdout)
                    xs = SlotLayoutTests.xs(sl, width)
                    self.assertLessEqual(jh, sl['size'])
                    for j in sl['joints']:
                        x = xs[j['at']]
                        a, b = (x + sl['size'] + off, x + sl['size'] + off + jw) if j['side'] == 'end' else (x - off - jw, x - off)
                        self.assertGreaterEqual(a, 2, (width, n, brk, j))              # inside the rail, 2px of brass to spare
                        self.assertLessEqual(b, width - 2, (width, n, brk, j))
                        row = sl['cells'][j['at']]['row']
                        for k, c in enumerate(sl['cells']):                            # clear of the other slots on its row
                            if c['row'] == row and k != j['at']:
                                self.assertFalse(a < xs[k] + sl['size'] and xs[k] < b, (width, n, brk, j, k))

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
        # BACKLOG B-212: its own state, 'next' (the blink), not the ready
        # pulse of a check
        self.assertEqual(
            self.run_node("out(['correct', 'revealed'].map((s) => [c.domeAction(cur(s, 'cat')), c.domeState(cur(s, 'cat'), null)]));"),
            [['next', 'next'], ['next', 'next']],
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
        # BACKLOG B-210: the puppet's moments as in
        # design/reference/robot-puppet.html (its "Game moments"), each
        # step at its time (the reference's waits added up), and the clip
        # per moment as before (B-108)
        LP = [{'at': 0, 'sink': 0, 'head': 0, 'eyes': 'idle', 'brows': 'calm', 'hands': 'rest', 'look': [-26, 22]},
              {'at': 0.6, 'look': [0, 0]}]
        steps = lambda m: self.run_node(f"out(c.MOMENTS.{m}.steps);")
        variants = lambda m: self.run_node(f"out(c.MOMENTS.{m}.variants);")
        self.assertEqual(steps('roundStart'), [
            {'at': 0, 'sink': 0, 'head': 0, 'eyes': 'idle', 'brows': 'up', 'hands': 'wave', 'pop': 1},
            {'at': 0.6, 'brows': 'calm', 'hands': 'rest'}])
        self.assertEqual(variants('picture'), {
            'surprise': {'chance': 1 / 3, 'steps': [
                {'at': 0, 'sink': 0, 'head': -10, 'look': [0, -22], 'eyes': 'wide', 'brows': 'up', 'hands': 'gasp', 'pop': 1},
                {'at': 1.4, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': -4}]},
            'giggle': {'chance': 1 / 3, 'steps': [
                {'at': 0, 'sink': 0, 'head': -8, 'look': [0, -22], 'eyes': 'happy', 'brows': 'happy', 'hands': 'giggle'},
                {'at': 0.2, 'fx': 'giggle'},
                {'at': 1.8, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': -4}]},
            'shock': {'chance': 1 / 3, 'steps': [
                {'at': 0, 'sink': 0, 'head': -12, 'look': [0, -24], 'eyes': 'dots', 'brows': 'worried', 'hands': 'shock', 'pop': 1},
                {'at': 0.5, 'eyes': 'wide'},
                {'at': 1.9, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': -4}]},
        })
        for m in ('blockPlaced', 'blockReturned', 'filled'):
            self.assertEqual(steps(m), LP, m)
        point = {'at': 0, 'sink': 0, 'head': 6, 'eyes': 'wide', 'brows': 'up', 'hands': 'point', 'look': [26, 22]}
        self.assertEqual(variants('filledEarly'), {
            'point': {'chance': 0.6, 'steps': [point]},
            'excited': {'chance': 0.4, 'steps': [{**point, 'pop': 2}, {'at': 0.3, 'fx': 'wag'}, {'at': 0.6, 'fx': 'browJump'}]},
        })
        self.assertEqual(steps('kidIdle'), [
            {'at': 0, 'sink': 0, 'head': -6, 'eyes': 'squint', 'brows': 'frown', 'hands': 'chin'},
            {'at': 0.9, 'hands': 'rest', 'sink': 150}, {'at': 1.4, 'peek': True}])
        self.assertEqual(steps('wake'), [
            {'at': 0, 'sink': 0, 'head': 0, 'eyes': 'wide', 'brows': 'up', 'hands': 'rest', 'pop': 1},
            {'at': 0.5, 'eyes': 'idle', 'brows': 'calm'}])
        self.assertEqual(steps('wrong'), [
            {'at': 0, 'sink': 0, 'head': 6, 'eyes': 'confused', 'brows': 'puzzled', 'hands': 'shrug', 'shake': True},
            {'at': 1.8, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': 0}])
        self.assertEqual(steps('wrongPeek'), [
            {'at': 0, 'head': 4, 'eyes': 'confused', 'brows': 'worried', 'sink': 104, 'look': [-24, -6]},
            {'at': 0.5, 'look': [24, -6]}, {'at': 1.4, 'fx': 'shiver'}, {'at': 2, 'look': [0, -10]},
            {'at': 2.5, 'sink': 0, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': 0, 'look': [0, 0]}])
        self.assertEqual(steps('thirdMiss'), [
            {'at': 0, 'sink': 0, 'head': -3, 'eyes': 'dots', 'brows': 'worried', 'hands': 'cover'},
            {'at': 0.9, 'hands': 'rest', 'eyes': 'happy', 'brows': 'happy', 'head': 5}])
        self.assertEqual(steps('correct'), [
            {'at': 0, 'sink': 0, 'head': 0, 'eyes': 'happy', 'brows': 'up', 'hands': 'pump', 'pop': 1},
            {'at': 0.3, 'fx': 'pump'}, {'at': 1.7, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm'}])
        self.assertEqual(steps('streak'), [
            {'at': 0, 'sink': 0, 'head': 0, 'eyes': 'happy', 'brows': 'up', 'hands': 'pump2', 'pop': 2},
            {'at': 0.25, 'fx': 'pump2'}, {'at': 1.85, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm'}])
        self.assertEqual(steps('roundEndGood'), [
            {'at': 0, 'sink': 0, 'head': 5, 'eyes': 'happy', 'brows': 'happy', 'hands': 'clap'},
            {'at': 0.3, 'fx': 'clap'}, {'at': 2.5, 'hands': 'rest'}])
        # 0-1 stars: his rest pose, never sad
        self.assertEqual(steps('roundEnd'), [{'at': 0, 'sink': 0, 'head': 0, 'eyes': 'idle', 'brows': 'calm', 'hands': 'rest'}])
        self.assertEqual(steps('speakerLocked'), [
            {'at': 0, 'sink': 0, 'eyes': 'idle', 'brows': 'frown', 'hands': 'shrug', 'shake': True},
            {'at': 1.6, 'hands': 'rest', 'brows': 'calm'}])
        # his letter on the second miss (B-206): glad, a small pop, pointing up at it
        self.assertEqual(steps('hintGiven'), [
            {'at': 0, 'sink': 0, 'head': 0, 'look': [0, 0], 'eyes': 'happy', 'brows': 'happy', 'hands': 'pointUp', 'pop': 'small'},
            {'at': 1.2, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm'}])
        # his nudge toward the dome on an answered word (B-212): the
        # pointing of "All slots filled", a pop, the finger wagging, rest
        self.assertEqual(steps('domeNudge'), [
            {**point, 'pop': 1}, {'at': 0.3, 'fx': 'wag'},
            {'at': 2, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': 0, 'look': [0, 0]}])
        self.assertEqual(self.run_node("out(Object.keys(c.MOMENTS));"), [
            'roundStart', 'picture', 'blockPlaced', 'blockReturned', 'filledEarly', 'filled', 'kidIdle', 'wake',
            'wrong', 'wrongPeek', 'thirdMiss', 'correct', 'streak', 'roundEndGood', 'roundEnd', 'speakerLocked', 'hintGiven',
            'domeNudge'])
        # the idle peek: up to his eyes, looks left, right and ahead, sinks again
        self.assertEqual(self.run_node("out(c.PEEK);"), {'wait': 1.6, 'every': 4.8, 'steps': [
            {'at': 0, 'sink': 104, 'look': [-26, -8], 'brows': 'up'}, {'at': 0.9, 'look': [26, -8]},
            {'at': 1.6, 'look': [0, -10]}, {'at': 2.2, 'sink': 150, 'brows': 'calm'}]})

    def test_every_part_a_step_names_exists(self):
        # every eyes / brows / hands / fx / pop a step names is in its
        # table, and every hand shape is an image on disk
        steps, tables = self.run_node(
            "const all = Object.keys(c.MOMENTS).flatMap((m) => c.variantsOf(m).flatMap((v) => v.steps)).concat(c.PEEK.steps);"
            "out([all, { eyes: Object.keys(c.EYES), brows: Object.keys(c.BROWS), hands: Object.keys(c.HANDS), fx: Object.keys(c.FX),"
            " files: Object.keys(c.HANDS).flatMap((h) => ['L', 'R'].map((s) => c.handPose(h)[s].file)) }]);")
        keys = {'at', 'sink', 'head', 'eyes', 'brows', 'hands', 'look', 'pop', 'shake', 'fx', 'peek'}
        for step in steps:
            self.assertLessEqual(set(step), keys, step)
            for part in ('eyes', 'brows', 'hands', 'fx'):
                if part in step:
                    self.assertIn(step[part], tables[part], step)
            if 'pop' in step:
                self.assertIn(step['pop'], (1, 2, 'small'), step)
        for f in set(tables['files']):
            self.assertTrue((self.UI / 'robot' / f).exists(), f)
        for f in ('body.png', 'head.png', 'browL.png', 'browR.png'):
            self.assertTrue((self.UI / 'robot' / f).exists(), f)

    def test_round_start_pops_him_up_then_the_picture_makes_him_think(self):
        self.assertEqual(self.run_node(
            "out([moments(theme, st()), moments({ ...st(), screen: 'round-end' }, st({ roundsStarted: 2 })),"
            " moments(st(), st({ roundsStarted: 2 })), c.scriptFor(['roundStart', 'picture'], { picture: 'surprise' })]);"), [
            ['roundStart', 'picture'], ['roundStart', 'picture'], ['roundStart', 'picture'],
            # he waves and pops up, then (in place of his hands' return to
            # rest) the picture: surprised, looking up at the TV
            [{'at': 0, 'sink': 0, 'head': 0, 'eyes': 'idle', 'brows': 'up', 'hands': 'wave', 'pop': 1},
             {'at': 0.6, 'sink': 0, 'head': -10, 'look': [0, -22], 'eyes': 'wide', 'brows': 'up', 'hands': 'gasp', 'pop': 1},
             {'at': 2, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': -4}],
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
        # both are the reference's "Letter placed": rest pose, a glance
        # down at the block, then ahead
        self.assertEqual(self.run_node("out([c.stepsOf('blockPlaced'), c.stepsOf('blockReturned')]);"),
                         [[{'at': 0, 'sink': 0, 'head': 0, 'eyes': 'idle', 'brows': 'calm', 'hands': 'rest', 'look': [-26, 22]},
                           {'at': 0.6, 'look': [0, 0]}]] * 2)

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
            'speakerLocked': ['locked'], 'hintGiven': [], 'domeNudge': [],
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
            " c.stepsOf('kidIdle').map((s) => [s.at, s.hands || null, 'sink' in s ? s.sink : null, !!s.peek]), c.stepsOf('wake')[0]]);"),
            [['kidIdle'], ['wake'], [[0, 'chin', 0, False], [0.9, 'rest', 150, False], [1.4, None, None, True]],
             {'at': 0, 'sink': 0, 'head': 0, 'eyes': 'wide', 'brows': 'up', 'hands': 'rest', 'pop': 1}])

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
            " c.stepsOf('speakerLocked').map((s) => [s.hands, !!s.shake]), c.soundsFor(['speakerLocked']),"
            " c.snapshot(st({ lockedTaps: 7 })).lockedTaps, c.snapshot(st()).lockedTaps, c.NONE.lockedTaps]);"),
            [['speakerLocked'], ['speakerLocked'], [], [], ['speakerLocked'], ['speakerLocked'],
             ['wake'], ['speakerLocked'], [['shrug', True], ['rest', False]], ['locked'], 7, 0, 0])

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

    def test_the_head_shake_is_the_references(self):
        # design/reference/robot-puppet.html shake(): the head turns 9° from
        # its pose and back, 90ms a swing, sine in-out, three times
        # (yoyo, repeat 5: 540ms), then settles on its pose in 150ms; the
        # body stays. Wrong and speaker locked shake it (with the shrug).
        self.assertEqual(self.run_node("out(c.TIMING.shake);"),
                         {'turn': 9, 'duration': 0.09, 'repeat': 5, 'ease': 'sine.inOut', 'settle': 0.15})
        self.assertEqual(self.run_node(
            "out(Object.keys(c.MOMENTS).filter((m) => c.variantsOf(m).some((v) => v.steps.some((s) => s.shake))));"),
            ['wrong', 'speakerLocked'])

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
        # CHARACTER "Presence": never more than one change per 300ms. A new
        # moment's first step waits until CHANGE_MS after his last change;
        # within every moment (and the idle peek) the steps that change his
        # pose are at least that far apart (glances and flourishes come
        # between them)
        self.assertEqual(self.run_node(
            "out([c.CHANGE_MS, c.startDelay(Infinity), c.startDelay(1000), c.startDelay(100), c.startDelay(0),"
            " c.isChange({ at: 0, look: [1, 1] }), c.isChange({ at: 0, fx: 'pump' }), c.isChange({ at: 0, sink: 0 })]);"),
            [300, 0, 0, 200, 300, False, False, True])
        scripts = self.run_node(
            "out(Object.keys(c.MOMENTS).flatMap((m) => c.variantsOf(m).map((v) => v.steps)).concat([c.PEEK.steps])"
            ".map((steps) => steps.filter(c.isChange).map((s) => s.at)));")
        for times in scripts:
            for a, b in zip(times, times[1:]):
                self.assertGreaterEqual(round(b - a, 3), 0.3, times)
            self.assertEqual(times[0], 0, times)
        # the peek round ends before the next one starts
        self.assertGreater(self.run_node("out(c.PEEK.every - c.PEEK.steps[c.PEEK.steps.length - 1].at);"), 0.3)

    def test_moves(self):
        # the reference's pop (body up 26 puppet px in 180ms, down in
        # 140ms; hands up 30 a beat later and trailing 10 down), sink
        # (400ms; hands hidden past 40 down; sunk past 60) and the pose
        # tweens' times and eases
        self.assertEqual(self.run_node("out(c.TIMING);"), {
            'hands': {'duration': 0.35, 'ease': 'back.out(1.5)', 'lag': 0.04},
            'eyes': {'duration': 0.25, 'ease': 'back.out(1.4)'},
            'brows': {'duration': 0.3, 'ease': 'back.out(2)'},
            'head': {'duration': 0.4, 'ease': 'back.out(1.5)'},
            'look': {'duration': 0.25, 'ease': 'power2.out'},
            'sink': {'duration': 0.4, 'ease': 'power2.out', 'hands': 0.3, 'hideHands': 40, 'sunk': 60},
            'pop': {
                'body': {'y': -26, 'up': 0.18, 'down': 0.14},
                'hands': {'y': -30, 'delay': 0.04, 'up': 0.2, 'down': 0.18},
                'trail': {'y': 10, 'delay': 0.05, 'down': 0.12, 'back': 0.3, 'ease': 'back.out(3)'},
                'small': 0.5,
            },
            'shake': {'turn': 9, 'duration': 0.09, 'repeat': 5, 'ease': 'sine.inOut', 'settle': 0.15},
        })
        # the idle sink and the peeks go down far enough to hide his
        # hands; every sink in a moment ends with him back up (0) except
        # the idle one, which the peek and the wake undo
        self.assertEqual(self.run_node(
            "out(Object.keys(c.MOMENTS).map((m) => [m, c.variantsOf(m).flatMap((v) => v.steps).filter((s) => 'sink' in s).map((s) => s.sink)])"
            ".filter(([, s]) => s.some((v) => v)));"),
            [['kidIdle', [0, 150]], ['wrongPeek', [104, 0]]])
        # puppet px as a share of the 505px canvas (the parts' xPercent / yPercent)
        self.assertEqual(self.run_node("out([c.CANVAS, c.EDGE, c.SCALE, c.pct(505), c.pct(-26), c.pct(0)]);"),
                         [505, 374, 0.24, 100, -5.1485, 0])

    def test_reduced_motion_is_pose_and_shape_changes_only(self):
        # BACKLOG B-210: no floating, bobbing or hops: a step loses its pop
        # and head-shake (the render plays every change instantly and
        # starts no ambient loop), a flourish keeps only its light (the
        # cap's flash), nothing else
        self.assertEqual(self.run_node(
            "out([c.reducedStep(c.stepsOf('correct')[0]), c.reducedStep(c.stepsOf('wrong')[0]), c.reducedStep({ at: 0.3, fx: 'pump' }),"
            " Object.keys(c.FX).map((f) => [f, c.fxFor(f, true).map((t) => t.part)]), c.fxFor('pump', false).length]);"),
            [{'at': 0, 'sink': 0, 'head': 0, 'eyes': 'happy', 'brows': 'up', 'hands': 'pump'},
             {'at': 0, 'sink': 0, 'head': 6, 'eyes': 'confused', 'brows': 'puzzled', 'hands': 'shrug'},
             {'at': 0.3, 'fx': 'pump'},
             [['giggle', []], ['wag', []], ['browJump', []], ['shiver', []], ['pump', []], ['pump2', ['capFlash']], ['clap', []]],
             1])

    def test_idle_wait_is_10s_from_the_last_input_once_per_word(self):
        self.assertEqual(self.run_node(
            "out([c.IDLE_MS, c.idleWait(st({ lastInput: 1000 }), 1000), c.idleWait(st({ lastInput: 1000 }), 8000),"
            " c.idleWait(st({ lastInput: 1000 }), 11000), c.idleWait(st({ lastInput: 1000 }), 50000),"
            " c.idleWait(st({ idleBeat: 'sunk' }), 50000), c.idleWait(st({ idleBeat: 'over' }), 50000),"
            " c.idleWait({ ...st(), screen: 'round-end' }, 50000), c.idleWait(theme, 50000)]);"),
            [10000, 10000, 3000, 0, 0, None, None, None, None])



class PuppetTests(TestCase):
    """static/js/character.js, the robot as a puppet (BACKLOG B-210): the
    parts' tables, poses per moment, the drag aim and the talking effects
    are the numbers of the approved prototype
    design/reference/robot-puppet.html, ported as they are; read from the
    prototype itself where they are plain data."""

    ROOT = Path(__file__).resolve().parent.parent
    MODULE = ROOT / 'static' / 'js' / 'character.js'
    REF = ROOT / 'design' / 'reference' / 'robot-puppet.html'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        script = (
            f"const c = await import('{self.MODULE.as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def ref(self):
        return self.REF.read_text()

    def ref_literal(self, name):
        """The object literal `const <name> = {...};` of the prototype,
        evaluated by node."""
        m = re.search(r'const ' + name + r' = (\{.*?\});\n', self.ref(), flags=re.S)
        self.assertIsNotNone(m, name)
        result = subprocess.run(['node', '-e', f'console.log(JSON.stringify({m.group(1)}))'],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_hand_poses_eyes_brows_and_rest_are_the_prototypes(self):
        ours = self.run_node("out([c.HANDS, c.EYES, c.BROWS, c.REST]);")
        self.assertEqual(ours, [self.ref_literal('H'), self.ref_literal('EYES'), self.ref_literal('BROWS'), self.ref_literal('REST')])
        # the head turns about (241, 262) (the prototype's HEAD), the body
        # breathes from (241, 420), the brows turn about their middles
        for snippet in ("const HEAD = '241px 262px';", "transformOrigin:'241px 420px'",
                        "transformOrigin:'230px 126px'", "transformOrigin:'308px 136px'"):
            self.assertTrue(snippet in self.ref(), snippet)
        self.assertEqual(self.run_node("out(c.PIVOT);"),
                         {'head': [241, 262], 'body': [241, 420], 'browL': [230, 126], 'browR': [308, 136]})

    def test_hand_shapes_are_the_prototypes_images(self):
        # the left hand uses the right-hand shapes mirrored, except rest;
        # widths are the <img width> of the prototype (2x images)
        ref = self.ref()
        for shape, width, left, mirror in (('rest', 86, 'hand-restL.png', False), ('wave', 83, 'hand-wave.png', True),
                                           ('point', 101, 'hand-point.png', True), ('ball', 72, 'hand-ball.png', True),
                                           ('palm', 103, 'hand-palm.png', True)):
            on = ' class="on"' if shape == 'rest' else ''
            img = f'data-s="{shape}"{on} alt="" src="../../static/images/ui/robot/{left}" width="{width}"'
            self.assertTrue(img + (' class="mir"' if mirror else '') + '>' in ref, shape)
        self.assertEqual(self.run_node("out(c.HAND_SHAPES);"), {
            'rest': {'L': 'restL', 'R': 'restR', 'width': 86}, 'wave': {'L': 'wave', 'R': 'wave', 'width': 83},
            'point': {'L': 'point', 'R': 'point', 'width': 101}, 'ball': {'L': 'ball', 'R': 'ball', 'width': 72},
            'palm': {'L': 'palm', 'R': 'palm', 'width': 103}})

    def test_hand_pose_lookup(self):
        # a pose as moves of each hand's layer from its rest point
        self.assertEqual(self.run_node("out([c.handPose('rest'), c.handPose('point').R, c.handPose('shrug').L]);"), [
            {'L': {'x': 16, 'y': 2, 'rotation': -8, 'shape': 'rest', 'file': 'hand-restL.png', 'width': 86, 'mirror': False},
             'R': {'x': -16, 'y': -2, 'rotation': 8, 'shape': 'rest', 'file': 'hand-restR.png', 'width': 86, 'mirror': False}},
            {'x': 48, 'y': -28, 'rotation': 32, 'shape': 'point', 'file': 'hand-point.png', 'width': 101, 'mirror': False},
            {'x': -30, 'y': -46, 'rotation': -10, 'shape': 'palm', 'file': 'hand-palm.png', 'width': 103, 'mirror': True},
        ])
        self.assertIn('unknown hand pose', self.run_node("try { c.handPose('salute'); out('no'); } catch (e) { out(e.message); }"))

    def test_hand_pose_per_moment(self):
        # the hands each moment's first step takes (the reference's hands()
        # call per moment; hintGiven points up at his letter)
        self.assertEqual(self.run_node(
            "out(Object.fromEntries(Object.keys(c.MOMENTS).map((m) => [m, c.variantsOf(m).map((v) => v.steps[0].hands || null)])));"), {
            'roundStart': ['wave'], 'picture': ['gasp', 'giggle', 'shock'], 'blockPlaced': ['rest'], 'blockReturned': ['rest'],
            'filledEarly': ['point', 'point'], 'filled': ['rest'], 'kidIdle': ['chin'], 'wake': ['rest'], 'wrong': ['shrug'],
            'wrongPeek': [None], 'thirdMiss': ['cover'], 'correct': ['pump'], 'streak': ['pump2'], 'roundEndGood': ['clap'],
            'roundEnd': ['rest'], 'speakerLocked': ['shrug'], 'hintGiven': ['pointUp'], 'domeNudge': ['point']})

    def test_the_hands_hide_before_they_sink_and_show_after_they_rise(self):
        # BACKLOG B-210 review: going below hideHands (40) the hands vanish
        # at once, then slide; coming back they slide hidden, then fade in
        # (0.3s each); reduced motion: the same order, instant
        self.assertEqual(self.run_node("out([c.handsSink(150, false), c.handsSink(104, false), c.handsSink(0, false), c.handsSink(0, true), c.handsSink(150, true)]);"), [
            [{'set': {'opacity': 0}}, {'to': {'y': 150}, 'duration': 0.3, 'delay': 0}],
            [{'set': {'opacity': 0}}, {'to': {'y': 104}, 'duration': 0.3, 'delay': 0}],
            [{'to': {'y': 0}, 'duration': 0.3, 'delay': 0}, {'to': {'opacity': 1}, 'duration': 0.3, 'delay': 0.3}],
            [{'to': {'y': 0}, 'duration': 0, 'delay': 0}, {'to': {'opacity': 1}, 'duration': 0, 'delay': 0}],
            [{'set': {'opacity': 0}}, {'to': {'y': 150}, 'duration': 0, 'delay': 0}],
        ])

    def test_eye_and_brow_lookup(self):
        self.assertEqual(self.run_node("out([c.eyeShape('idle'), c.eyeShape('happy'), c.eyeShape('confused'), c.browPose('worried')]);"), [
            {'L': {'rx': 34, 'ry': 48}, 'R': {'rx': 30, 'ry': 42}, 'arc': False},
            {'L': {'rx': 34, 'ry': 48}, 'R': {'rx': 30, 'ry': 42}, 'arc': True},
            {'L': {'rx': 40, 'ry': 54}, 'R': {'rx': 14, 'ry': 16}, 'arc': False},
            {'L': {'y': -12, 'rotation': -10}, 'R': {'y': -12, 'rotation': 10}},
        ])

    def test_motion_numbers_are_the_prototypes(self):
        # each number of the tables next to the prototype line it comes from
        ref = self.ref()
        ours = self.run_node("out({ T: c.TIMING, A: c.AMBIENT, F: c.FX, P: c.PEEK, AIM: c.AIM, TALK: c.TALK });")
        T, A, F, AIM, TALK = ours['T'], ours['A'], ours['F'], ours['AIM'], ours['TALK']
        pairs = [
            ("gsap.to(['#pupF','#handsF'], { y:-6, duration:1.7, ...T });", A['float'] == {'y': -6, 'duration': 1.7}),
            ("gsap.to('#body', { scaleY:1.012, scaleX:.996, duration:1.3,", A['breathe'] == {'scaleY': 1.012, 'scaleX': 0.996, 'duration': 1.3}),
            ("gsap.to('#handL .float', { y:-8, x:3, duration:1.5, ...T, delay:.35 });", A['handL'] == {'y': -8, 'x': 3, 'duration': 1.5, 'delay': 0.35}),
            ("gsap.to('#handR .float', { y:-10, x:-3, duration:1.8, ...T, delay:.6 });", A['handR'] == {'y': -10, 'x': -3, 'duration': 1.8, 'delay': 0.6}),
            ("gsap.to('#browL .bf', { y:-3, duration:1.9, ...T });", A['browL'] == {'y': -3, 'duration': 1.9}),
            ("gsap.to('#browR .bf', { y:-3, rotation:2, duration:2.3, ...T, delay:.5,", A['browR'] == {'y': -3, 'rotation': 2, 'duration': 2.3, 'delay': 0.5}),
            ("y:'-=9', duration:.18, yoyo:true, repeat:1, repeatDelay:.5", A['browSolo']['lift'] == {'y': -9, 'duration': 0.18, 'hold': 0.5}),
            ("rotation:'+=7', duration:.09, yoyo:true, repeat:3", A['browSolo']['wiggle'] == {'rotation': 7, 'duration': 0.09, 'repeat': 3}),
            ("gsap.delayedCall(2.5 + Math.random()*3.5, browSolo);", A['browSolo']['every'] == [2.5, 3.5]),
            ("scaleY:.08, duration:.07, ease:'power1.in'", (A['blink']['scaleY'], A['blink']['close']) == (0.08, 0.07)),
            ("{ scaleY:1, duration:.1, ease:'power1.out' }", A['blink']['open'] == 0.1),
            ("if (Math.random()<.2) gsap.delayedCall(.25,", (A['blink']['twice'], A['blink']['gap']) == (0.2, 0.25)),
            ("gsap.delayedCall(2.2 + Math.random()*3, blink);", A['blink']['every'] == [2.2, 3]),
            ("look((Math.random()-.5)*34, (Math.random()-.5)*18);", (A['wander']['x'], A['wander']['y']) == (34, 18)),
            ("gsap.delayedCall(1.6+Math.random()*2.4, wander);", A['wander']['every'] == [1.6, 2.4]),
            ("function hands(name, d=.35)", T['hands']['duration'] == 0.35),
            ("ease:'back.out(1.5)', delay:k==='L'?0:.04", (T['hands']['ease'], T['hands']['lag']) == ('back.out(1.5)', 0.04)),
            ("function eyes(name, d=.25)", T['eyes']['duration'] == 0.25),
            ("duration:reduce?0:.3, ease:'back.out(2)'", T['brows'] == {'duration': 0.3, 'ease': 'back.out(2)'}),
            ("function head(r, d=.4){ state.head = r; gsap.to('#head', { rotation:r, duration:reduce?0:d, ease:'back.out(1.5)'", T['head'] == {'duration': 0.4, 'ease': 'back.out(1.5)'}),
            ("gsap.to('#eyes', { x, y, duration:.25, ease:'power2.out' })", T['look'] == {'duration': 0.25, 'ease': 'power2.out'}),
            ("tl.to('#pupIn', { y:-26, duration:.18, ease:'power2.out' }).to('#pupIn', { y:0, duration:.14, ease:'power2.in' })", T['pop']['body'] == {'y': -26, 'up': 0.18, 'down': 0.14}),
            ("gsap.timeline({ delay:.04 }).to('#handsIn', { y:-30, duration:.2, ease:'power2.out' }).to('#handsIn', { y:0, duration:.18, ease:'power2.in' })", T['pop']['hands'] == {'y': -30, 'delay': 0.04, 'up': 0.2, 'down': 0.18}),
            ("gsap.timeline({ delay:.05 }).to('.hand .flip', { y:10, duration:.12 }).to('.hand .flip', { y:0, duration:.3, ease:'back.out(3)' })", T['pop']['trail'] == {'y': 10, 'delay': 0.05, 'down': 0.12, 'back': 0.3, 'ease': 'back.out(3)'}),
            ("gsap.to('#pupIn', { y:px, duration:reduce?0:.4, ease:'power2.out' })", (T['sink']['duration'], T['sink']['ease']) == (0.4, 'power2.out')),
            ("opacity: (px > 40 && !keepHands) ? 0 : 1, duration:reduce?0:.3", (T['sink']['hideHands'], T['sink']['hands']) == (40, 0.3)),
            ("state.sunk = px > 60;", T['sink']['sunk'] == 60),
            ("rotation:state.head+9, duration:.09, yoyo:true, repeat:5, ease:'sine.inOut'", T['shake'] == {'turn': 9, 'duration': 0.09, 'repeat': 5, 'ease': 'sine.inOut', 'settle': 0.15}),
            ("head(state.head,.15)", T['shake']['settle'] == 0.15),
            # the peek timeline: its first round 1.6s in, its last call at 2.2s, then 2.6s
            # until the next round, so a round every 2.2 + 2.6 = 4.8s
            ("repeat:-1, delay:1.6, repeatDelay:2.6", (ours['P']['wait'], round(ours['P']['every'] - ours['P']['steps'][-1]['at'], 3)) == (1.6, 2.6)),
            ("sink(150); brows('calm'); }, null, 2.2);", ours['P']['steps'][-1]['at'] == 2.2 and ours['P']['every'] == 4.8),
            ("gsap.to('#head',{ rotation:'+=4', duration:.08, yoyo:true, repeat:7,", F['giggle'][0] == {'part': 'head', 'to': {'rotation': '+=4'}, 'duration': 0.08, 'yoyo': True, 'repeat': 7}),
            ("gsap.to('#handR .flip',{ x:12, duration:.12, yoyo:true, repeat:7 })", F['wag'][0] == {'part': 'flipR', 'to': {'x': 12}, 'duration': 0.12, 'yoyo': True, 'repeat': 7}),
            ("gsap.to(['#browL .bf','#browR .bf'],{ y:'-=8', duration:.12, yoyo:true, repeat:5 })", F['browJump'][0] == {'part': 'browFloat', 'to': {'y': '-=8'}, 'duration': 0.12, 'yoyo': True, 'repeat': 5}),
            ("gsap.to('#pupIn',{ x:3, duration:.05, yoyo:true, repeat:7 })", F['shiver'][0] == {'part': 'pupIn', 'to': {'x': 3}, 'duration': 0.05, 'yoyo': True, 'repeat': 7}),
            ("gsap.to('#handR .flip',{ y:-26, duration:.14, yoyo:true, repeat:3, ease:'power2.out' })", F['pump'][0] == {'part': 'flipR', 'to': {'y': -26}, 'duration': 0.14, 'yoyo': True, 'repeat': 3, 'ease': 'power2.out'}),
            ("gsap.to('#handL .flip',{ y:-28, duration:.14, yoyo:true, repeat:5, ease:'power2.out' }); gsap.to('#handR .flip',{ y:-28, duration:.14, yoyo:true, repeat:5, ease:'power2.out', delay:.14 });", F['pump2'][:2] == [
                {'part': 'flipL', 'to': {'y': -28}, 'duration': 0.14, 'yoyo': True, 'repeat': 5, 'ease': 'power2.out'},
                {'part': 'flipR', 'to': {'y': -28}, 'duration': 0.14, 'yoyo': True, 'repeat': 5, 'ease': 'power2.out', 'delay': 0.14}]),
            ("gsap.fromTo('#cap',{ opacity:1 },{ opacity:0, duration:.9 })", F['pump2'][2] == {'part': 'capFlash', 'from': {'opacity': 1}, 'to': {'opacity': 0}, 'duration': 0.9, 'light': True}),
            ("{ x:(i)=>i?-10:10, duration:.13, yoyo:true, repeat:7 }", F['clap'] == [
                {'part': 'flipL', 'to': {'x': 10}, 'duration': 0.13, 'yoyo': True, 'repeat': 7},
                {'part': 'flipR', 'to': {'x': -10}, 'duration': 0.13, 'yoyo': True, 'repeat': 7}]),
            ("const dx = p.clientX-(r.left+r.width*.53), dy = p.clientY-(r.top+r.height*.37)", AIM['from'] == [0.53, 0.37]),
            ("look(dx/len*Math.min(30,len/5), dy/len*Math.min(18,len/7));", (AIM['x'], AIM['xPer'], AIM['y'], AIM['yPer']) == (30, 5, 18, 7)),
            ("Math.max(-8,Math.min(8,dx/25)), duration:.3", (AIM['turn'], AIM['turnPer'], AIM['duration']) == (8, 25, 0.3)),
            ("level += ((Math.min(1,rms*4)) - level) * 0.35;", (TALK['gain'], TALK['attack']) == (4, 0.35)),
            ("if (fx.scope && level > .02 && analyser){", TALK['quiet'] == 0.02),
            ("const n = 44;", TALK['scope']['points'] == 44),
            ("const x = 556 + i*(220/n);", (TALK['scope']['x0'], TALK['scope']['x1']) == (556, 776)),
            ("(548 + v*190*Math.sin(Math.PI*i/n))", (TALK['scope']['y'], TALK['scope']['amp']) == (548, 190)),
            ("(0.55 + level*0.45)", (TALK['scope']['base'], TALK['scope']['span']) == (0.55, 0.45)),
            ("scope.setAttribute('opacity', fx.scope ? '.28' : '0')", TALK['scope']['rest'] == 0.28),
            ("scale: fx.eyes ? 1 + level*0.22 : 1", TALK['eyes'] == 0.22),
            ("Math.min(1, level*1.6)", TALK['cap'] == 1.6),
            ("if (fx.cap && level > .45) gsap.set('#sparks', { rotation:(Math.random()-.5)*20, svgOrigin:'722 186', opacity:Math.random()<.6?1:0 });",
             TALK['sparks'] == {'above': 0.45, 'turn': 20, 'show': 0.6, 'origin': '722 186'}),
            ("const target = talking ? -level*12 : 0; browUp += (target - browUp)*0.3;", TALK['brows'] == {'lift': 12, 'ease': 0.3}),
            ("level > .5 && t - lastPeak > 220", (TALK['nod']['above'], TALK['nod']['gap']) == (0.5, 220)),
            ("rotation: state.head + nodSign*3, y:-4, duration:.1, yoyo:true, repeat:1", (TALK['nod']['turn'], TALK['nod']['y'], TALK['nod']['duration']) == (3, -4, 0.1)),
        ]
        for snippet, same in pairs:
            self.assertTrue(snippet in ref, snippet)    # the prototype says so
            self.assertTrue(same, snippet)              # and so does the table

    def test_variants_are_picked_by_chance(self):
        # new picture: surprise, giggle or shock, a third each; all slots
        # filled: the extra-excited version about 4 in 10 times
        self.assertEqual(self.run_node(
            "out([[0, 0.3, 0.34, 0.6, 0.67, 0.99].map((r) => c.pickVariant('picture', r)),"
            " [0, 0.59, 0.6, 0.99].map((r) => c.pickVariant('filledEarly', r)), c.pickVariant('correct', 0.5),"
            " c.variantsOf('picture').map((v) => v.name), c.stepsOf('filledEarly', 'excited')[0].pop, c.stepsOf('filledEarly')[0].pop || null]);"),
            [['surprise', 'surprise', 'giggle', 'giggle', 'shock', 'shock'], ['point', 'point', 'excited', 'excited'], 'only',
             ['surprise', 'giggle', 'shock'], 2, None])

    def test_the_second_miss_happy_pop_comes_when_his_peek_is_over(self):
        # CHARACTER "Moment map" (B-206): his letter's happy, small pop
        # when the peek ends, in place of the peek's own return
        self.assertEqual(self.run_node("out(c.scriptFor(['wrongPeek', 'hintGiven']).map((s) => [s.at, s.eyes || null, s.pop || null]));"),
                         [[0, 'confused', None], [0.5, None, None], [1.4, None, None], [2, None, None],
                          [2.5, 'happy', 'small'], [3.7, 'idle', None]])
        # a moment of one step followed by another keeps it (300ms apart)
        self.assertEqual(self.run_node("out(c.scriptFor(['roundEnd', 'wake']).map((s) => s.at));"), [0, 0.3, 0.8])
        self.assertEqual(self.run_node("out(c.scriptFor(['correct']).map((s) => s.at));"), [0, 0.3, 1.7])

    def test_eyes_and_head_aim_at_the_dragged_block(self):
        # further away looks further, up to 30 / 18 visor units; the head
        # turns dx / 25 degrees, at most 8
        self.assertEqual(self.run_node(
            "out([c.aimAt(0, 0), c.aimAt(500, 0), c.aimAt(-50, 0), c.aimAt(0, 70), c.aimAt(0, -500), c.aimAt(300, 400)]);"), [
            {'look': [0, 0], 'turn': 0}, {'look': [30, 0], 'turn': 8}, {'look': [-10, 0], 'turn': -2},
            {'look': [0, 10], 'turn': 0}, {'look': [0, -18], 'turn': 0}, {'look': [18, 14.4], 'turn': 8}])

    def test_loudness_and_its_smoothing(self):
        # rms of the byte samples (128 = silence); the level moves 35% of
        # the way to min(1, rms * 4) each frame, up and down
        res = self.run_node(
            "const sq = (a) => Array.from({ length: 512 }, (_, i) => (i % 2 ? 128 + a : 128 - a));"
            "let l = 0; const up = []; for (let i = 0; i < 4; i++) { l = c.smoothLevel(l, c.loudness(sq(32))); up.push(l); }"
            "const down = []; for (let i = 0; i < 3; i++) { l = c.smoothLevel(l, 0); down.push(l); }"
            "out([c.loudness(null), c.loudness(sq(0)), c.loudness(sq(32)), c.loudness(sq(128)), up, down,"
            " c.smoothLevel(0, 1), c.smoothLevel(1, 1), c.smoothLevel(0.5, 0.05)]);")
        self.assertEqual(res[:4], [0, 0, 0.25, 1])
        level, want = 0, []
        for target in (1, 1, 1, 1, 0, 0, 0):            # rms 0.25 * 4 = 1, then silence
            level += (target - level) * 0.35
            want.append(level)
        for got, exp in zip(res[4] + res[5], want):
            self.assertAlmostEqual(got, exp)
        self.assertAlmostEqual(want[0], 0.35)
        self.assertAlmostEqual(want[4], 0.534, places=3)
        self.assertEqual(res[6:8], [0.35, 1])
        self.assertAlmostEqual(res[8], 0.5 + (0.2 - 0.5) * 0.35)

    def test_the_four_talking_effects_follow_the_level(self):
        # scope: the waveform across the visor when louder than 0.02,
        # brighter with the level; flat and faint (0.28) when quiet or
        # silent. Eyes 1 + 0.22 * level, cap min(1, 1.6 * level), sparks
        # past 0.45; the brows ride up to 12 puppet px, easing 30% a frame;
        # a nod on a peak past 0.5, at most every 220ms.
        res = self.run_node(
            "const w = Array.from({ length: 512 }, (_, i) => 128 + Math.round(100 * Math.sin(i / 8)));"
            "const loud = c.scopeLine(w, 0.8);"
            "out([c.scopeLine(null, 0.8), c.scopeLine(w, 0.01), loud.opacity, loud.d.split('L').length, loud.d.slice(0, 12),"
            " c.talkLights(0), c.talkLights(0.5), c.talkLights(1), c.talkLights(0.4).sparks,"
            " c.browRide(0, 1, true), c.browRide(-3.6, 1, true), c.browRide(-3.6, 0, false), c.browRide(-3.6, 1, false),"
            " c.nodDue(0.6, 1000, 700), c.nodDue(0.6, 1000, 800), c.nodDue(0.5, 1000, 0)]);")
        flat = {'d': 'M556 548 L776 548', 'opacity': 0.28}
        self.assertEqual(res[0], flat)
        self.assertEqual(res[1], flat)
        self.assertEqual(res[2], 0.91)
        self.assertEqual(res[3], 45)                     # 44 segments across the visor
        self.assertEqual(res[4], 'M556.0 548.0')        # starts on the line (sin 0)
        self.assertEqual(res[5:9], [{'eyes': 1, 'cap': 0, 'sparks': False}, {'eyes': 1.11, 'cap': 0.8, 'sparks': True},
                                    {'eyes': 1.22, 'cap': 1, 'sparks': True}, False])
        self.assertAlmostEqual(res[9], -3.6)
        self.assertAlmostEqual(res[10], -6.12)
        self.assertAlmostEqual(res[11], -2.52)
        self.assertAlmostEqual(res[12], -2.52)          # not talking: back down, whatever the level
        self.assertEqual(res[13:], [True, False, False])


class PuppetRenderTests(TestCase):
    """character.js's render part with stand-ins for the DOM and GSAP
    (BACKLOG B-210): the ambient life starts when he comes on screen and
    stops when he leaves; under prefers-reduced-motion only pose and shape
    changes, no floating, bobbing or hops; the talking frames draw while
    he talks and nothing once he is quiet; the eyes and head follow a
    dragged block and come back on release. main.js and drag.js feed it."""

    ROOT = Path(__file__).resolve().parent.parent
    MODULE = ROOT / 'static' / 'js' / 'character.js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body, reduced=False):
        # Every element the module looks up is a stand-in named by its
        # selector path; gsap calls are logged as [call, target names, vars].
        script = (
            "const els = new Map(); const log = [];"
            "const mk = (name) => { const cls = new Set(); const attrs = {};"
            " const el = { name, dataset: {}, isConnected: true, attrs,"
            "  classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),"
            "   toggle: (x, on) => ((on === undefined ? !cls.has(x) : on) ? cls.add(x) : cls.delete(x)), contains: (x) => cls.has(x),"
            "   [Symbol.iterator]: () => [...cls][Symbol.iterator]() },"
            "  setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k],"
            "  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),"
            "  querySelector: (sel) => get(name + ' ' + sel),"
            "  querySelectorAll: (sel) => (sel === 'img' ? ['rest', 'wave', 'point', 'ball', 'palm'].map((sh) => { const i = get(name + ' img.' + sh); i.dataset.shape = sh; return i; })"
            "   : [get(name + ' ' + sel + ' #1'), get(name + ' ' + sel + ' #2')]) };"
            " return el; };"
            "const get = (k) => { if (!els.has(k)) els.set(k, mk(k)); return els.get(k); };"
            "const nm = (t) => (Array.isArray(t) ? t.map(nm).join(' & ') : t && t.name ? t.name.replace('#screen-play ', '') : String(t));"
            "const tl = () => { const t = { to(el, v) { log.push(['tl.to', nm(el), v]); return t; } }; return t; };"
            "globalThis.document = { querySelector: (sel) => get(sel) };"
            f"globalThis.window = {{ matchMedia: () => ({{ matches: {'true' if reduced else 'false'} }}) }};"
            "globalThis.gsap = { to: (el, v) => log.push(['to', nm(el), v]), set: (el, v) => log.push(['set', nm(el), v]),"
            " fromTo: (el, a, b) => log.push(['fromTo', nm(el), a, b]), timeline: (o) => { log.push(['timeline', nm(o && o.delay)]); return tl(); },"
            " delayedCall: (t, fn, args) => log.push(['delayedCall', t, fn.name, args || null]),"
            " killTweensOf: (x) => log.push(['kill', typeof x === 'function' ? x.name : 'parts']) };"
            f"const c = await import('{self.MODULE.as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            "const put = (s) => s.split('').map((ch, i) => (ch === '-' ? null : { letter: ch, tileId: 't' + i }));"
            "const st = (o = {}) => ({ screen: 'play', roundsStarted: 1, idleBeat: null, lastInput: 0, lives: 3, lockedTaps: 0,"
            " round: { index: 0, size: 5, results: [] }, current: { word: 'cat', status: 'playing', placed: put('---') }, ...o });"
            "const theme = { screen: 'theme', roundsStarted: 0, idleBeat: null, lives: 3, lockedTaps: 0,"
            " round: { index: 0, size: 5, results: [] }, current: { word: null, placed: [] } };"
            "const robot = () => get('#screen-play .robot');"
            "const take = () => log.splice(0, log.length);"
            f"{body}"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_ambient_life_runs_while_he_is_on_screen(self):
        # Math.random pinned: no double blink (a 20% chance) in the log
        res = self.run_node(
            "Math.random = () => 0.5;"
            "c.renderRobot(theme); const offScreen = take();"
            "c.renderRobot(st()); const on = take();"
            "c.renderRobot(st()); const again = take();"
            "c.renderRobot({ ...st(), screen: 'round-end', round: { index: 4, size: 5, results: [] } }); const off = take();"
            "out({ offScreen, loops: on.filter((e) => e[0] === 'to' && e[2].repeat === -1).map((e) => e[1]),"
            " calls: on.filter((e) => e[0] === 'delayedCall').map((e) => e[2]),"
            " pops: on.filter((e) => e[0] === 'timeline').map((e) => e[1]), again,"
            " killed: off.filter((e) => e[0] === 'kill').map((e) => e[1]), cls: [...robot().classList].sort() });")
        self.assertEqual(res['offScreen'], [])
        # float (body and hands together), breathing, the two hands'
        # drift, the two eyebrows' bob
        self.assertEqual(res['loops'], [
            '.robot .pup-float & .robot-hands .hands-float', '.robot .robot-torso',
            '.robot-hands .hand-L .hand-drift', '.robot-hands .hand-R .hand-drift',
            '.robot .brow-L .brow-float', '.robot .brow-R .brow-float'])
        # blink, wander, an eyebrow's solo; the round start's later step and the picture's
        self.assertEqual(res['calls'][:3], ['blink', 'wander', 'browSolo'])
        self.assertEqual(set(res['calls'][3:]), {'applyStep'})
        # his pop: body, hands (0.04s later), the hands' trail (0.05s); and a blink
        self.assertEqual(sorted(res['pops']), ['0.04', '0.05', 'undefined', 'undefined'])
        self.assertEqual(res['again'], [])        # a re-render plays nothing
        for fn in ('applyStep', 'peekOnce', 'blink', 'blinkOnce', 'wander', 'browSolo', 'parts'):
            self.assertIn(fn, res['killed'])
        self.assertNotIn('is-sunk', res['cls'])

    def test_reduced_motion_is_pose_and_shape_changes_only(self):
        res = self.run_node(
            "c.renderRobot(theme); c.renderRobot(st()); const on = take();"
            "c.renderRobot(st({ current: { word: 'cat', status: 'correct', placed: put('cat') },"
            " round: { index: 0, size: 5, results: [{ correct: true }] } })); const correct = take();"
            "c.renderRobot(st({ current: { word: 'cat', status: 'correct', placed: put('cat') }, lockedTaps: 1,"
            " round: { index: 0, size: 5, results: [{ correct: true }] } })); const locked = take();"
            "const all = on.concat(correct, locked);"
            "out({ loops: all.filter((e) => e[2] && e[2].repeat === -1).length, timelines: all.filter((e) => e[0] === 'timeline').length,"
            " moving: all.filter((e) => e[0] === 'to' && e[2].duration > 0).map((e) => e[1]),"
            " calls: all.filter((e) => e[0] === 'delayedCall').map((e) => e[2]),"
            " heads: all.filter((e) => e[0] === 'to' && e[1] === '.robot .robot-head').map((e) => e[2]) });", reduced=True)
        self.assertEqual(res['loops'], 0)         # no float, breathing, drift or bob
        self.assertEqual(res['timelines'], 0)     # no pop (nor blink)
        # every change is instant (only the eyes' glance would keep its
        # 250ms, the reference's look())
        self.assertLessEqual(set(res['moving']), {'.robot .visor-eyes'})
        self.assertEqual(set(res['calls']), {'applyStep'})   # no blink, wander or brow solo
        # the head turns to its pose at once and never shakes (no yoyo)
        self.assertTrue(res['heads'])
        for h in res['heads']:
            self.assertEqual(h['duration'], 0)
            self.assertNotIn('yoyo', h)

    def test_talking_frames(self):
        res = self.run_node(
            "c.renderRobot(theme); c.renderRobot(st()); take();"
            "const scope = get('#screen-play .robot .scope'), cap = get('#screen-play .robot .cap');"
            "c.renderTalk(null); const quiet = take();"
            "const loud = new Uint8Array(512).map((_, i) => (i % 2 ? 255 : 1));"
            "for (let i = 0; i < 6; i++) c.renderTalk(loud);"
            "const talking = take(); const drawn = [scope.attrs.opacity, cap.attrs.opacity, scope.attrs.d.split('L').length];"
            "for (let i = 0; i < 60; i++) c.renderTalk(null);"
            "const settled = [scope.attrs.d, scope.attrs.opacity, cap.attrs.opacity]; take(); c.renderTalk(null); const still = take();"
            "c.renderRobot({ ...st(), screen: 'round-end', round: { index: 4, size: 5, results: [] } }); take();"
            "scope.attrs.d = 'x'; c.renderTalk(loud); const offScreen = [take().filter((e) => e[0] === 'set').length, scope.attrs.d];"
            "out({ quiet, drawn, sets: [...new Set(talking.filter((e) => e[0] === 'set').map((e) => e[1]))].sort(),"
            " eyes: talking.filter((e) => e[0] === 'set' && e[1].includes('ball')).map((e) => e[2].scale).pop(),"
            " nods: talking.filter((e) => e[0] === 'to' && e[1] === '.robot .robot-head').map((e) => [e[2].yoyo, e[2].repeat, e[2].duration]),"
            " settled, still, offScreen });")
        self.assertEqual(res['quiet'], [])        # quiet and drawn so: nothing to do
        self.assertGreater(float(res['drawn'][0]), 0.9)   # the scope bright
        self.assertEqual(res['drawn'][1], '1')             # the cap fully lit
        self.assertEqual(res['drawn'][2], 45)     # the waveform across the visor
        self.assertEqual(res['sets'], ['.robot .brow-float img #1 & .robot .brow-float img #2', '.robot .cap .sparks',
                                       '.robot .visor-eye .ball #1 & .robot .visor-eye .ball #2'])
        self.assertGreater(res['eyes'], 1.2)
        self.assertEqual(res['nods'], [[True, 1, 0.1]])   # one bob in 6 frames (peaks at most every 220ms)
        self.assertEqual(res['settled'], ['M556 548 L776 548', '0.28', '0'])
        self.assertEqual(res['still'], [])
        self.assertEqual(res['offScreen'], [0, 'x'])

    def test_eyes_and_head_follow_a_dragged_block(self):
        res = self.run_node(
            "c.renderRobot(theme); c.followBlock({ x: 600, y: 37 }); const offScreen = take();"
            "c.renderRobot(st()); take(); robot().dataset.head = '-4';"
            "c.followBlock({ x: 553, y: 37 }); const drag = take(); const following = robot().classList.contains('is-following');"
            "c.followBlock(null); const drop = take(); c.followBlock(null); const twice = take();"
            "out({ offScreen, drag: drag.map((e) => [e[1], e[2]]), following, drop: drop.map((e) => [e[1], e[2]]), twice,"
            " after: robot().classList.contains('is-following') });")
        self.assertEqual(res['offScreen'], [])
        # the block is 500px right of his head (53, 37): eyes right as far
        # as they go, head turned the most, 8°, from its pose (-4°)
        self.assertEqual(res['drag'], [['.robot .visor-eyes', {'x': 30, 'y': 0, 'duration': 0.25, 'ease': 'power2.out'}],
                                       ['.robot .robot-head', {'rotation': 4, 'duration': 0.3, 'overwrite': 'auto'}]])
        self.assertTrue(res['following'])
        self.assertEqual(res['drop'], [['.robot .visor-eyes', {'x': 0, 'y': 0, 'duration': 0.25, 'ease': 'power2.out'}],
                                       ['.robot .robot-head', {'rotation': -4, 'duration': 0.4, 'ease': 'back.out(1.5)'}]])
        self.assertEqual(res['twice'], [])
        self.assertFalse(res['after'])

    def test_the_hands_vanish_before_he_sinks_and_return_after_he_rises(self):
        # kidIdle's sink: the hands' layer is hidden at once (set) and only
        # then slides down; on the wake it slides up hidden and only then
        # fades in. Steps are run by hand (delayedCall recorded).
        script = (
            "c.renderRobot(theme); c.renderRobot(st()); take();"
            "const due = []; globalThis.gsap.delayedCall = (t, fn, args) => due.push([fn, args]);"
            "const run = (pick) => { const [fn, args] = due.find(([, a]) => a && pick(a[0])); take(); fn(...args);"
            " return take().filter((e) => e[1] === '.robot-hands .hands-in' && (e[0] === 'set' || e[0] === 'to')).map((e) => [e[0], e[2]]); };"
            "c.renderRobot(st({ idleBeat: 'sunk' })); const down = run((s) => s.sink === 150);"
            "due.length = 0; c.renderRobot(st({ idleBeat: 'over' })); const up = run((s) => s.sink === 0);"
            "out({ down, up });")
        res = self.run_node(script)
        self.assertEqual(res['down'], [['set', {'opacity': 0}], ['to', {'yPercent': 29.703, 'duration': 0.3, 'delay': 0, 'ease': 'power2.out'}]])
        self.assertEqual(res['up'], [['to', {'yPercent': 0, 'duration': 0.3, 'delay': 0, 'ease': 'power2.out'}],
                                     ['to', {'opacity': 1, 'duration': 0.3, 'delay': 0.3, 'ease': 'power2.out'}]])
        # a fade still waiting from the rise is dropped before they hide
        code = re.sub(r'/\*.*?\*/|//[^\n]*', '', self.MODULE.read_text(), flags=re.S)
        body = code[code.index('function sink('):code.index('function shake(')]
        self.assertLess(body.index("gsap.killTweensOf(d.handsIn, 'opacity');"), body.index('handsSink(px, reduced)'))
        # reduced motion: the same order, instant
        res = self.run_node(script, reduced=True)
        self.assertEqual(res['down'], [['set', {'opacity': 0}], ['to', {'yPercent': 29.703, 'duration': 0, 'delay': 0, 'ease': 'power2.out'}]])
        self.assertEqual(res['up'], [['to', {'yPercent': 0, 'duration': 0, 'delay': 0, 'ease': 'power2.out'}],
                                     ['to', {'opacity': 1, 'duration': 0, 'delay': 0, 'ease': 'power2.out'}]])

    def test_under_reduced_motion_the_head_follows_at_once(self):
        res = self.run_node(
            "c.renderRobot(theme); c.renderRobot(st()); take(); robot().dataset.head = '0';"
            "c.followBlock({ x: 553, y: 37 }); const drag = take(); c.followBlock(null); const drop = take();"
            "out([drag.filter((e) => e[1] === '.robot .robot-head').map((e) => e[2].duration),"
            " drop.filter((e) => e[1] === '.robot .robot-head').map((e) => e[2].duration)]);", reduced=True)
        self.assertEqual(res, [[0], [0]])

    def test_a_nudge_points_him_at_the_dome(self):
        # BACKLOG B-212: one more state.nudges on the answered word plays
        # domeNudge (its steps after the moment before, 300ms after his last
        # change); a re-render with the same count plays nothing
        res = self.run_node(
            "const done = (n) => st({ nudges: n, round: { index: 0, size: 5, results: [{ correct: true }] },"
            " current: { word: 'cat', status: 'correct', placed: put('cat') } });"
            "c.renderRobot(done(0)); take();"
            "c.renderRobot(done(1)); const one = take();"
            "c.renderRobot(done(1)); const again = take();"
            "out({ steps: one.filter((e) => e[0] === 'delayedCall' && e[2] === 'applyStep').map((e) => [e[1], e[3][0]]),"
            " dropped: one.filter((e) => e[0] === 'kill').map((e) => e[1]), again });")
        self.assertEqual([s['hands'] for _, s in res['steps'] if 'hands' in s], ['point', 'rest'])
        self.assertEqual(res['steps'][0][1]['look'], [26, 22])
        self.assertTrue(any(s.get('fx') == 'wag' for _, s in res['steps']))
        self.assertIn('applyStep', res['dropped'])
        self.assertEqual(res['again'], [])

    def test_wiring(self):
        js = self.ROOT / 'static' / 'js'
        code = lambda f: re.sub(r'/\*.*?\*/|//[^\n]*', '', (js / f).read_text(), flags=re.S)
        main, drag = code('main.js'), code('drag.js')
        # every frame, the analyser's samples (or null) to the robot
        self.assertIn('gsap.ticker.add(() => renderTalk(voiceWave()));', main)
        self.assertIn("import { followBlock } from './character.js';", drag)
        on_drag = drag[drag.index('onDrag()'):drag.index('onRelease()')]
        self.assertIn('followBlock(centre(this.target));', on_drag)
        on_release = drag[drag.index('onRelease()'):drag.index('onDragEnd()')]
        self.assertIn('followBlock(null);', on_release)
        # the follow point and the talking level never reach state
        for f in ('drag.js', 'character.js', 'main.js', 'audio.js'):
            for word in ('setState({ follow', 'setState({ pointer', 'setState({ talk', 'setState({ voice', 'setState({ wave'):
                self.assertFalse(word in code(f), (f, word))
        self.assertFalse('setState' in code('character.js'))


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

    def test_his_voice_passes_an_analyser_and_the_swipe_does_not(self):
        # BACKLOG B-210: on the first gesture the context gets one
        # AnalyserNode (FFT 1024) on its way out; his clips (the voice
        # channel) play into it, the swipe straight out. voiceWave() is
        # the analyser's 512 samples while one of his clips plays, null
        # otherwise: before the gesture, with only the swipe, after the
        # clip, and while muted (nothing plays).
        res = self.run_node(
            "const analysers = [];"
            "AudioContext.prototype.createAnalyser = function () { const n = { kind: 'analyser', fftSize: 2048, to: null,"
            " connect(t) { n.to = t; }, getByteTimeDomainData(a) { a.fill(200); n.reads = (n.reads || 0) + 1; } }; analysers.push(n); return n; };"
            "const cbs = AudioContext.prototype.createBufferSource;"
            "AudioContext.prototype.createBufferSource = function () { const s = cbs.call(this); s.connect = (t) => { s.to = t; }; return s; };"
            "const before = a.voiceWave();"
            "await ready(); S.setState({ muted: false, speaking: false });"
            "const an = analysers[0], ctx = ctxs[0];"
            "const silent = a.voiceWave();"
            "a.play('swipe'); const swipe = sources[sources.length - 1]; const swipeOnly = a.voiceWave();"
            "a.play('error'); const err = sources[sources.length - 1]; const w = a.voiceWave();"
            "const during = [w && w.length, w && w[0], w && w[511]];"
            "err.onended(); const after = a.voiceWave();"
            "a.play('locked'); const locked = sources[sources.length - 1].to === an;"
            "S.setState({ muted: true }); [...sources].forEach((x) => x.onended && x.onended());"
            "a.play('correct'); const muted = a.voiceWave();"
            "out([before, analysers.length, an.fftSize, an.to === ctx.destination, swipe.to === ctx.destination, err.to === an,"
            " silent, swipeOnly, during, after, locked, muted, a.ANALYSER]);")
        self.assertEqual(res, [None, 1, 1024, True, True, True, None, None, [512, 200, 200], None, True, None,
                               {'fftSize': 1024, 'samples': 512}])

    def test_without_an_analyser_he_still_speaks(self):
        # a browser without createAnalyser: his clips go straight out, he
        # just does not show them
        self.assertEqual(self.run_node(
            "const cbs = AudioContext.prototype.createBufferSource;"
            "AudioContext.prototype.createBufferSource = function () { const s = cbs.call(this); s.connect = (t) => { s.to = t; }; return s; };"
            "await ready(); S.setState({ muted: false, speaking: false });"
            "a.play('error'); const err = sources[sources.length - 1];"
            "out([err.to === ctxs[0].destination, kinds(), a.voiceWave()]);"),
            [True, ['error'], None])

    def test_the_target_word_is_not_his_voice_clip(self):
        # the word stays an <audio> element straight out (never through
        # the context: it must play whatever the context's state), so the
        # analyser never hears it
        code = re.sub(r'/\*.*?\*/|//[^\n]*', '', self.MODULE.read_text(), flags=re.S)
        self.assertNotIn('createMediaElementSource', code)
        self.assertNotIn('captureStream', code)
        self.assertEqual(self.run_node(
            "AudioContext.prototype.createAnalyser = function () { return { connect() {}, getByteTimeDomainData(x) { x.fill(9); } }; };"
            "await ready(); S.setState({ muted: false, speaking: true });"
            "a.speakWord('/static/sounds/themes/animals/cat.mp3', () => {});"
            "out([made.length > 0, a.voiceWave()]);"),
            [True, None])

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
    """The robot behind the console (BACKLOG B-115, B-210, DESIGN "Layout",
    CHARACTER "Presence", CLAUDE.md's robot rule): a puppet of parts on one
    505x505 canvas, in two layers inside .console. His body and head are
    drawn under the console, the rail and the bench blocks, with ~75px of
    him above the console's left third; his hands are drawn over the
    console's top edge, resting on it, still under the controls and the
    blocks, and never over a control's tap area or a bench block."""

    ROOT = Path(__file__).resolve().parent.parent
    CSS = ROOT / 'static' / 'css' / 'game.css'
    UI = ROOT / 'static' / 'images' / 'ui'
    LAYOUT = ROOT / 'static' / 'js' / 'layout.js'
    CHARACTER = ROOT / 'static' / 'js' / 'character.js'

    def css(self):
        return re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)

    def rule(self, selector):
        # the rule whose whole selector this is (not one line of a list)
        return re.search(r'(?<!,)\n' + re.escape(selector) + r'\s*{(.*?)}', self.css(), flags=re.S).group(1)

    def test_the_puppet_is_in_the_console_in_two_layers(self):
        html = self.client.get('/').content.decode()
        console = html[html.index('<div class="console">'):html.index('id="reset-btn"')]
        robot = console.index('<div class="robot ')
        body = console.index('class="console-body"')
        hands = console.index('<div class="robot-hands"')
        self.assertLess(robot, body)          # body and head under the console image
        self.assertLess(body, hands)          # hands over it
        pup, mitts = console[robot:body], console[hands:]
        for part in ('body.png', 'head.png', 'browL.png', 'browR.png'):
            self.assertIn(f'/static/images/ui/robot/{part}', pup, part)
        # the eyes, scope mouth and cap sparks are code (SVG) in the visor
        for part in ('<svg class="visor" viewBox="0 0 1264 1264"', 'clip-path="url(#robot-visor)"',
                     '<clipPath id="robot-visor"><ellipse cx="666" cy="464" rx="194" ry="116" transform="rotate(10 666 464)" />',
                     'class="visor-eye visor-eye-L" transform="translate(590 452)"', '<ellipse class="ball" rx="34" ry="48" />',
                     'class="visor-eye visor-eye-R" transform="translate(748 480)"', '<ellipse class="ball" rx="30" ry="42" />',
                     '<path class="scope" d="M556 548 L776 548" opacity=".28" />', '<g class="cap" opacity="0">', '<g class="cap-flash">'):
            self.assertIn(part, pup, part)
        self.assertLess(pup.index('head.png'), pup.index('<svg'))       # visor over the head,
        self.assertLess(pup.index('</svg>'), pup.index('browL.png'))    # eyebrows over the visor
        # each hand stacks every shape; the left hand mirrors all but rest
        left = mitts[mitts.index('hand-L'):mitts.index('hand-R')]
        right = mitts[mitts.index('hand-R'):]
        self.assertEqual(re.findall(r'class="shape-(\w+)( on)?( mirror)?" data-shape="\1" src="/static/images/ui/robot/hand-(\w+)\.png"', left),
                         [('rest', ' on', '', 'restL'), ('wave', '', ' mirror', 'wave'), ('point', '', ' mirror', 'point'),
                          ('ball', '', ' mirror', 'ball'), ('palm', '', ' mirror', 'palm')])
        self.assertEqual(re.findall(r'class="shape-(\w+)( on)?( mirror)?" data-shape="\1" src="/static/images/ui/robot/hand-(\w+)\.png"', right),
                         [('rest', ' on', '', 'restR'), ('wave', '', '', 'wave'), ('point', '', '', 'point'),
                          ('ball', '', '', 'ball'), ('palm', '', '', 'palm')])
        # the six still poses are no longer drawn (they stay on disk)
        self.assertNotIn('images/ui/robot-', html)
        for pose in ('idle', 'thinking', 'confused', 'excited', 'happy', 'oops', 'hero'):
            self.assertTrue((self.UI / f'robot-{pose}.png').exists(), pose)

    def test_body_under_everything_hands_over_the_console_image_only(self):
        # In #screen-play's stacking context (isolation): .robot at -2, the
        # console image at -1, .robot-hands at -1 after it, then the rail,
        # the bench blocks and the controls (z auto). The console must not
        # be a stacking context of its own, or he would be lifted with it.
        self.assertIn('isolation: isolate;', self.rule('#screen-play'))
        robot = self.rule('#screen-play .robot')
        for decl in ('z-index: -2;', 'overflow: hidden;', 'position: absolute;'):
            self.assertIn(decl, robot)
        self.assertIn('z-index: -1;', self.rule('#screen-play .robot-hands'))
        self.assertIn('z-index: -1;', self.rule('.console-body'))
        self.assertIn('pointer-events: none;', self.rule('#screen-play .robot,\n#screen-play .robot-hands'))
        console = self.rule('#screen-play .console')
        for prop in ('z-index', 'transform', 'filter', 'opacity', 'isolation', 'will-change', 'contain'):
            self.assertNotIn(prop + ':', console, prop)
        for sel in ('.letter-boxes', '.letter-tray', '.block-spot', '.draggable-letter', '.ctl'):
            self.assertNotRegex(self.rule(sel), r'z-index:\s*-', sel)

    def test_the_css_places_the_canvas_by_character_js(self):
        # one puppet px is SCALE (0.24) of --rpx; the canvas is 505 of them;
        # its visor centre (puppet x 266) is 72.6px from the console's left
        # edge (v5) and puppet y 374 (EDGE) is the console's top; the
        # turning points, the hands' rest points and the mitten widths are
        # character.js's
        c = subprocess.run(['node', '--input-type=module', '-e',
                            f"const c = await import('{self.CHARACTER.as_uri()}');"
                            "console.log(JSON.stringify([c.SCALE, c.EDGE, c.CANVAS, c.PIVOT, c.REST, c.HAND_SHAPES]));"],
                           capture_output=True, text=True, timeout=20)
        self.assertEqual(c.returncode, 0, c.stderr)
        scale, edge, canvas, pivot, rest, shapes = json.loads(c.stdout)
        console = self.rule('#screen-play .console')
        self.assertIn('--rpx: calc(var(--console-w) / 324);', console)
        self.assertIn(f'--ppx: calc(var(--rpx) * {scale});', console)
        both = self.rule('#screen-play .puppet,\n#screen-play .robot-hands')
        for decl in ('left: calc(72.6 * var(--rpx) - 266 * var(--ppx));', f'width: calc({canvas} * var(--ppx));',
                     f'height: calc({canvas} * var(--ppx));', 'filter: drop-shadow(2px 3px 3px var(--shadow-contact));'):
            self.assertIn(decl, both)
        self.assertIn(f'top: calc(130 * var(--rpx) - {edge} * var(--ppx));', self.rule('#screen-play .puppet'))
        self.assertIn(f'top: calc(-{edge} * var(--ppx));', self.rule('#screen-play .robot-hands'))
        self.assertIn('top: calc(-130 * var(--rpx));', self.rule('#screen-play .robot'))
        at = lambda x, y: f'calc(100% * {x} / {canvas}) calc(100% * {y} / {canvas})'
        self.assertIn(f'transform-origin: {at(*pivot["head"])};', self.rule('.robot-head'))
        self.assertIn(f'transform-origin: {at(*pivot["body"])};', self.rule('.robot-torso'))
        self.assertIn(f'transform-origin: {at(*pivot["browL"])};', self.rule('.brow-L'))
        self.assertIn(f'transform-origin: {at(*pivot["browR"])};', self.rule('.brow-R,\n.brow-R .brow-float'))
        for side in ('L', 'R'):
            hand = self.rule(f'.hand-{side}')
            self.assertIn(f'--hx: calc(100% * {rest[side]["x"]} / {canvas});', hand)
            self.assertIn(f'--hy: calc(100% * {rest[side]["y"]} / {canvas});', hand)
        for name, shape in shapes.items():
            self.assertIn(f'.robot-hands .shape-{name} {{ width: calc(100% * {shape["width"]} / {canvas}); }}', self.CSS.read_text())

    def test_he_fits_beside_the_bench_and_his_hands_clear_the_controls(self):
        # At 360x740 (console 324px at x 18, top 659.7; TenLetterFitTests),
        # the puppet's pixels (alpha >= 50%) at its scale:
        # - at rest (idle, with his float, his hands' drift and his
        #   eyebrows at their highest) about 75px of him shows above the
        #   console (76px at the top of his float), he is inside his window
        #   and the console's left third, clear of every block of every
        #   word (1-10 letters, also with hard's two extras) and of the
        #   rail;
        # - at the top of his pop only the second block row of a 9-10
        #   letter word passes over him (he is drawn under the blocks;
        #   7-8 letter words did too until BACKLOG B-213 put their slots
        #   on one row);
        # - his hands rest on the console's edge, and in every hand pose
        #   (and at rest even at the bottom of the pop's trail) they are
        #   clear of the lever's, the speaker's and the dome's tap areas
        #   (48x48 at least) and of every bench block.
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        fit = TenLetterFitTests()
        left, top, cw, ch = fit.console_box()
        bench = fit.W - 2 * fit.SIDE
        rail_top = 0.445 * fit.W * 2739 / 1264
        taps = {}
        for name, sel in (('lever', '#reset-btn'), ('speaker', '#speak-btn'), ('dome', '#check-btn')):
            r = self.rule(sel)
            cx = float(re.search(r'--cx: ([\d.]+)%;', r).group(1)) / 100
            cy = float(re.search(r'--cy: ([\d.]+)%;', r).group(1)) / 100
            w = cw * float(re.search(r'--w: calc\(var\(--console-w\) \* ([\d.]+)\);', r).group(1))
            ar = re.search(r'--ar: calc\((\d+) / (\d+)\);', r)
            h = w * int(ar.group(1)) / int(ar.group(2))
            tw, th = max(48, w), max(48, h)
            x, y = left + cx * cw, top + cy * ch
            taps[name] = [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2]
        script = TenLetterFitTests.PNG_ALPHA_JS + f"""
            import {{ slotLayout, blockLayout }} from '{self.LAYOUT.as_uri()}';
            const c = await import('{self.CHARACTER.as_uri()}');
            const D = {json.dumps(str(self.UI / 'robot'))} + '/';
            const L = {left}, TOP = {top}, BENCH = {bench}, RAIL = {rail_top}, SIDE = {fit.SIDE}, GAP = {fit.GAP}, TILT = {fit.TILT};
            const TAPS = {json.dumps(taps)};
            const K = c.SCALE, VX = L + 72.6;
            const X = (px) => VX + (px - 266) * K, Y = (py) => TOP + (py - c.EDGE) * K;
            const words = [];
            for (let n = 1; n <= 10; n++) for (const extras of [0, 2]) {{
                const sl = slotLayout(n, BENCH), bl = blockLayout(n + extras, BENCH);
                const railBottom = RAIL + 2 * sl.pad + sl.rows * sl.size + (sl.rows - 1) * sl.gap, benchTop = railBottom + GAP;
                words.push({{ n: extras ? 'h' + n : '' + n, railBottom, blocks: bl.spots.map((p) => [SIDE + p.x - TILT, benchTop + p.y - TILT,
                    SIDE + p.x + bl.size + TILT, benchTop + p.y + bl.size + TILT, Math.round(p.y / (bl.size + 10))]) }});
            }}
            const hits = (x, y) => words.map((w) => [w.n, w.blocks.filter(([a, b, cc, d]) => x >= a && x <= cc && y >= b && y <= d)]).filter(([, h]) => h.length);
            const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
            const img = {{}};
            for (const f of ['body', 'head', 'browL', 'browR', 'hand-restL', 'hand-restR', 'hand-wave', 'hand-point', 'hand-ball', 'hand-palm'])
                img[f] = alphaOf(D + f + '.png');
            // canvas parts, lifted by `up` puppet px (float, brows)
            const solid = (f, px, py) => px >= 0 && py >= 0 && px < 505 && py < 505 && img[f].at(px, py) >= 128;
            // the mitten of hand `side` in pose `p` (target centre, turn, shape), shifted by (dx, dy)
            const mitten = (side, p, dx, dy, px, py) => {{
                const file = 'hand-' + c.HAND_SHAPES[p.s][side], im = img[file], k = im.w / c.HAND_SHAPES[p.s].width;
                const a = -p.r * Math.PI / 180, ox = px - (p.x + dx), oy = py - (p.y + dy);
                let ix = ox * Math.cos(a) - oy * Math.sin(a); const iy = ox * Math.sin(a) + oy * Math.cos(a);
                if (side === 'L' && p.s !== 'rest') ix = -ix;
                const u = ix * k + im.w / 2, v = iy * k + im.h / 2;
                return u >= 0 && v >= 0 && u < im.w && v < im.h && im.at(u, v) >= 128;
            }};
            const A = c.AMBIENT, F = -A.float.y;
            const out = {{ top: Infinity, minX: Infinity, maxX: -Infinity, lowest: -Infinity, rail: 0, rest: {{}}, pop: {{}}, popRows: {{}},
                          hands: {{}}, restBottom: -Infinity, trailBottom: -Infinity }};
            const step = 0.5;
            for (let py = 0; py < 505; py += step) for (let px = 0; px < 505; px += step) {{
                const lifts = [0, F];   // at rest and at the top of his float
                let him = false;
                for (const up of lifts) {{
                    const y = py + up;
                    if (solid('body', px, y) || solid('head', px, y) || solid('browL', px, y + 12) || solid('browR', px, y + 12)) him = true;
                    for (const side of ['L', 'R']) {{
                        const d = side === 'L' ? A.handL : A.handR;
                        if (mitten(side, c.HANDS.rest[side], up ? d.x : 0, up ? d.y - F : 0, px, py)) him = true;
                    }}
                }}
                if (!him) continue;
                const x = X(px), y = Y(py);
                if (y >= TOP) continue;
                out.top = Math.min(out.top, y); out.minX = Math.min(out.minX, x); out.maxX = Math.max(out.maxX, x); out.lowest = Math.max(out.lowest, y);
                for (const [at, yy] of [['rest', y], ['pop', y + c.TIMING.pop.body.y * K]]) for (const w of words) {{
                    if (yy < w.railBottom) out.rail++;
                    const h = w.blocks.filter(([a, b, cc, d]) => x >= a && x <= cc && yy >= b && yy <= d);
                    if (h.length) out[at][w.n] = (out[at][w.n] || 0) + 1;
                    if (at === 'pop') for (const blk of h) out.popRows[blk[4]] = true;
                }}
            }}
            // every hand pose at its target; the rest pose also at the bottom of the pop's trail
            for (const [name, pose] of Object.entries(c.HANDS)) {{
                const r = {{ taps: [], blocks: [] }};
                for (const side of ['L', 'R']) {{
                    const p = pose[side];
                    for (let py = p.y - 70; py < p.y + 70; py += step) for (let px = p.x - 70; px < p.x + 70; px += step) {{
                        for (const dy of name === 'rest' ? [0, c.TIMING.pop.trail.y] : [0]) {{
                            if (!mitten(side, p, 0, dy, px, py)) continue;
                            const x = X(px), y = Y(py);
                            for (const [t, b] of Object.entries(TAPS)) if (inBox(x, y, b) && !r.taps.includes(t)) r.taps.push(t);
                            for (const [n] of hits(x, y)) if (!r.blocks.includes(n)) r.blocks.push(n);
                            if (name === 'rest') {{
                                if (dy === 0) out.restBottom = Math.max(out.restBottom, y);
                                else out.trailBottom = Math.max(out.trailBottom, y);
                            }}
                        }}
                    }}
                }}
                out.hands[name] = r;
            }}
            // how far down the resting hands can be and still clear every tap area (puppet px)
            let clear = 0;
            for (let dy = 0; dy <= 80; dy += 0.5) {{
                let hit = false;
                for (const side of ['L', 'R']) {{
                    const p = c.HANDS.rest[side];
                    for (let py = p.y - 70; py < p.y + 70 && !hit; py += 1) for (let px = p.x - 70; px < p.x + 70 && !hit; px += 1)
                        if (mitten(side, p, 0, dy, px, py) && Object.values(TAPS).some((b) => inBox(X(px), Y(py), b))) hit = true;
                }}
                if (hit) break;
                clear = dy;
            }}
            out.clear = clear;
            // every sink a moment or the idle peek uses, from every one to every
            // other: the hands' layer (c.handsSink), sampled every 5ms; where it
            // is visible (opacity > 0) it must be no lower than `clear`
            const used = Object.keys(c.MOMENTS).flatMap((m) => c.variantsOf(m).flatMap((v) => v.steps)).concat(c.PEEK.steps);
            const sinks = [...new Set(used.filter((st) => 'sink' in st).map((st) => st.sink))].sort((a, b) => a - b);
            out.sinks = sinks; out.shown = [];
            for (const reduced of [false, true]) for (const from of sinks) for (const to of sinks) {{
                const plan = c.handsSink(to, reduced);
                const value = (prop, start, t) => {{
                    let v = start;
                    for (const tw of plan) {{
                        if (tw.set && prop in tw.set) v = tw.set[prop];
                        if (tw.to && prop in tw.to) {{
                            if (t >= tw.delay + tw.duration) v = tw.to[prop];
                            else if (t > tw.delay) v = v + (tw.to[prop] - v) * (t - tw.delay) / tw.duration;
                        }}
                    }}
                    return v;
                }};
                for (let t = 0; t <= 1; t += 0.005) {{
                    const y = value('y', from, t), o = value('opacity', from > c.TIMING.sink.hideHands ? 0 : 1, t);
                    if (o > 0 && y > clear) out.shown.push([reduced, from, to, +t.toFixed(3), +y.toFixed(1), +o.toFixed(2)]);
                }}
            }}
            console.log(JSON.stringify(out));
        """
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stderr)
        r = json.loads(result.stdout)
        self.assertGreater(r['lowest'], top - 1)                 # he shows down to the console edge
        self.assertGreaterEqual(top - r['top'], 70)              # ~75px of him above it
        self.assertLessEqual(top - r['top'], 77)
        self.assertGreaterEqual(r['minX'], left)                 # inside his window (x 18-178)
        self.assertLessEqual(r['maxX'], left + 160)
        self.assertLessEqual(r['maxX'], left + cw / 3)           # the console's left third
        self.assertEqual(r['rail'], 0)                           # never reaches the rail
        self.assertEqual(r['rest'], {})                          # at rest, clear of all blocks
        for n in range(1, 7):
            self.assertNotIn(str(n), r['pop'], n)                # room for the pop-up
            self.assertNotIn(f'h{n}', r['pop'], n)
        self.assertEqual(list(r['popRows']), ['1'])              # only the second row
        # of a 9-10 letter word: since BACKLOG B-213 a 7-8 letter word is
        # one row of slots, so its bench lies higher, clear of his pop too
        self.assertEqual(sorted((k for k in r['pop'] if not k.startswith('h')), key=int), ['9', '10'])
        # the hands rest on the console's edge, over it by a few px, above
        # the lever's tap area even at the bottom of the pop's trail
        self.assertGreater(r['restBottom'], top)
        self.assertLess(r['trailBottom'], taps['lever'][1])
        for name, hand in r['hands'].items():
            self.assertEqual(hand, {'taps': [], 'blocks': []}, name)
        # ... and while he sinks and rises (BACKLOG B-210 review): the
        # resting hands clear the tap areas down to `clear` puppet px (the
        # pop's trail stays within it); lower than that they are hidden at
        # every moment of every sink and rise a moment uses
        self.assertGreaterEqual(r['clear'], 10)
        self.assertLess(r['clear'], 40)
        self.assertEqual(r['sinks'], [0, 104, 150])
        self.assertEqual(r['shown'], [])


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
        # BACKLOG B-210: the puppet's head turns about its neck, (241, 262)
        # on the 505 canvas (character.js PIVOT.head); the body stays. The
        # shake ends with the head back on its pose.
        self.assertIn('transform-origin: calc(100% * 241 / 505) calc(100% * 262 / 505);', self.css_rule('.robot-head'))
        self.assertIn('PIVOT = { head: [241, 262]', self.code('character.js'))
        self.assertIn('onComplete: () => setHead(d, headTurn(d), s.settle, false)', self.code('character.js'))


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
        # it never lifts, so no hand cursor; the look itself (the riveted
        # brass plate that replaced B-204's amber edge) is BACKLOG B-211's,
        # checked in LockedLookTests
        self.assertIn('cursor: default;', rule)
        self.assertIn('\n.letter-box.locked > .draggable-letter:not(.landing) {', css)


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
            " R.scriptFor(['wrongPeek', 'hintGiven']).filter(R.isChange).map((s) => [s.at, s.eyes || null, 'sink' in s ? s.sink : null, s.pop || null]),"
            " R.soundsFor(['wrongPeek', 'hintGiven'])]);")
        self.assertEqual(res, [
            ['wrongPeek', 'hintGiven'], [], ['wrong'], ['filled'], ['thirdMiss'], 0, -1, -1,
            # confused, ducked to his eyes; then happy, up with a small pop
            [[0, 'confused', 104, None], [2.5, 'happy', 0, 'small'], [3.7, 'idle', None, None]], ['error'],
        ])

    def test_his_pop_waits_for_the_peek_and_is_small(self):
        # CHARACTER "Moment map": his happy pop comes when the peek is
        # over. The puppet's peek (BACKLOG B-210, the reference's "Wrong
        # (peek)") ducks to his eyes, looks left and right, shivers and
        # comes back at 2.5s: the hintGiven step takes the place of that
        # return. The pop is the pop at half height, same timing; under
        # reduced motion no pop at all.
        res = self.run_node(
            "const script = R.scriptFor(['wrongPeek', 'hintGiven']);"
            "const peek = R.stepsOf('wrongPeek');"
            "out([peek[peek.length - 1].at, script.find((s) => s.eyes === 'happy').at, script.filter((s) => s.at === 2.5).length,"
            " R.TIMING.pop.small, R.stepsOf('hintGiven')[0].pop, 'pop' in R.reducedStep(R.stepsOf('hintGiven')[0]),"
            " R.scriptFor(['wrong']).map((s) => s.at), R.startDelay(Infinity), R.startDelay(100)]);")
        self.assertEqual(res, [2.5, 2.5, 1, 0.5, 'small', False, [0, 1.8], 0, 200])

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
        # as it lands (0.9s) it clunks into the slot (BACKLOG B-211): it
        # is pressed in, and at the hit (0.99s) its locked look comes on
        # (class `landing` until then) and it comes up to its locked size
        self.assertEqual(o[6], ['to', 'o', {'scale': 0.8, 'duration': 0.09, 'ease': 'power2.in', 'delay': 0.9}])
        self.assertEqual(len(r) + len(o), 15)
        self.assertTrue(landing)
        self.assertFalse(landed)
        self.assertEqual(sorted(e[1] for e in log if e[0] == 'later'), [0.6, 0.9, 0.99])
        # everything set is put back by then (the clunk ends at scale 1)
        self.assertEqual(cleared, [['set', 'r', {'clearProps': 'position,zIndex'}],
                                   ['set', 'o', {'clearProps': 'position,zIndex'}],
                                   ['fromTo', 'o', {'scale': 0.8},
                                    {'scale': 1, 'duration': 0.11, 'ease': 'power2.out', 'lazy': False}]])
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
        # drawn as a placed block until it lands: the locked look (BACKLOG
        # B-211) leaves out a block with class `landing`, so the placed
        # block's rule draws it and no override is needed
        self.assertIn('\n.letter-box.locked > .draggable-letter:not(.landing) {', css)
        self.assertNotRegex(css, r'\.letter-box\.locked > \.draggable-letter\.landing\s*{')
        placed = re.search(r'\n\.letter-box > \.draggable-letter\s*{([^}]*)}', css).group(1)
        self.assertIn('1px 2px 3px var(--shadow-deep);', placed)
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


class LockedLookTests(TestCase):
    """Locked letters you can see at a glance (BACKLOG B-211). One look for
    every locked letter (easy's given letter, the right letters the easy
    lever keeps, the robot's letter), keyed only on the slot's `locked`
    flag (card.js class `locked`): a brass plate riveted into the slot,
    sunk below the rim (game.css), in place of B-204's amber edge. A letter
    that locks clunks into its slot (feedback.js): the lever's at once,
    the robot's as it lands (HintTests). `newlyLocked` and the clunk run
    through node with stand-ins for the DOM and GSAP, the motion spec
    through motion.js; the look and the wiring are checked in the
    source."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

    FAKE_DOM = """
        const log = [];
        const later = [];
        const id = (el) => (Array.isArray(el) ? el.map((e) => e.id) : el.id);
        const timeline = () => {
            const t = {};
            for (const k of ['to', 'fromTo', 'set']) t[k] = (el) => { log.push(['tl.' + k, id(el)]); return t; };
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
        // a block: `w` px as rendered; a block in a slot is 46px while it
        // has class `landing` (drawn as a placed block) and 40px drawn locked
        const el = (name, x, y, w) => {
            const e = { id: name, classList: cls(), parentNode: null,
                getBoundingClientRect: () => ({ left: x, top: y, width: w, height: w }) };
            Object.defineProperty(e, 'offsetWidth', { get: () => (e.classList.contains('landing') ? 46 : w) });
            return e;
        };
        const rect = (name, x, y, w) => ({ id: name, getBoundingClientRect: () => ({ left: x, top: y, width: w, height: w }) });
        const boxes = [0, 1, 2, 3, 4].map((i) => rect('box' + i, 20 + i * 52, 100, 46));
        const spots = [0, 1, 2, 3].map((i) => rect('spot' + i, 20 + i * 60, 200, 52));
        const tiles = {};
        globalThis.document = {
            getElementById: (name) => (name === 'letter-boxes' ? { id: 'rail', children: boxes } : name === 'letter-tray' ? { children: spots } : null),
            querySelector: (sel) => { const m = /data-tile-id="([^"]+)"/.exec(sel); return m ? tiles[m[1]] || null : null; },
            querySelectorAll: () => [],
        };
        const F = await import('FEEDBACK');
        const D = await import('DRAG');
        // "horse" on easy: h given (locked in slot 1, no bench spot),
        // checked as "hosre" (o and e right, s and r wrong), one bulb out
        const tray = [{ id: 'h', letter: 'h', used: true, given: true }].concat(
            ['s', 'r', 'o', 'e'].map((t) => ({ id: t, letter: t, used: true })));
        const P = (letters, locked = 'h') => letters.split('').map((ch) => (ch === '_' ? null
            : { letter: ch, tileId: ch, ...(locked.includes(ch) ? { locked: true } : {}) }));
        const wrong = { screen: 'play', lives: 2, pressed: null, round: { index: 0 },
            current: { word: 'horse', status: 'wrong', tray, placed: P('hosre') } };
        // where the render put them: h, o, e in slots 1, 2, 5; s, r on the bench
        tiles.h = el('h', 23, 103, 40); tiles.o = el('o', 75, 103, 40); tiles.e = el('e', 231, 103, 40);
        tiles.s = el('s', 20, 200, 52); tiles.r = el('r', 80, 200, 52);
        tiles.h.parentNode = boxes[0]; tiles.o.parentNode = boxes[1]; tiles.e.parentNode = boxes[4];
        const mine = (e) => ['h', 'o', 'e'].includes(e[1]);
        const clunks = () => log.filter((e) => e[0] === 'to' && e[2].scale === 0.8).map((e) => e[1]);
    """

    def run_node(self, body):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (
            "const out = (v) => console.log(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x)));"
            + self.FAKE_DOM.replace('FEEDBACK', (self.JS / 'feedback.js').as_uri())
                           .replace('DRAG', (self.JS / 'drag.js').as_uri())
            + body
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

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)

    # --- which letters just locked (pure) ---

    def test_newly_locked_is_the_slots_locked_since_the_last_render(self):
        hinted = [{'letter': 'h', 'tileId': 'h'}, {'letter': 'o', 'tileId': 'o', 'locked': True, 'hint': True},
                  None, {'letter': 's', 'tileId': 's'}, {'letter': 'e', 'tileId': 'e'}]
        res = self.run_node(
            "const before = P('hosre'); const copy = JSON.stringify(before);"
            f"const hinted = {json.dumps(hinted)};"
            "out([F.newlyLocked([], []), F.newlyLocked(before, P('ho__e', 'hoe')), F.newlyLocked(P('ho__e', 'hoe'), P('ho__e', 'hoe')),"
            " F.newlyLocked(P('ho__e', 'hoe'), P('h____')), F.newlyLocked(P('hrose', ''), hinted),"
            " F.newlyLocked([{ letter: 'o', tileId: 'o1', locked: true }], [{ letter: 'o', tileId: 'o2', locked: true }]),"
            " F.newlyLocked(P('hosre', ''), P('hosre', '')), JSON.stringify(before) === copy]);")
        self.assertEqual(res, [
            [],
            [1, 4],     # the lever kept o and e (the given h was locked already)
            [],         # a re-render
            [],         # a start-over pull unlocks; nothing locks
            [1],        # the robot's letter
            [0],        # a slot locked with another block
            [],         # nothing locked
            True,       # inputs untouched
        ])

    # --- the clunk (feedback.js) ---

    def test_the_letters_the_lever_keeps_clunk_into_their_slots(self):
        placed, before, landing, landed, hit, laters, again = self.run_node(
            "const pulled = { ...wrong, pressed: 'lever', current: D.returnAll(wrong.current, 'easy') };"
            "F.renderFeedback(wrong); F.renderFeedback(pulled);"
            "const n = log.length; const landing = ['h', 'o', 'e'].map((k) => tiles[k].classList.contains('landing'));"
            "later.forEach((fn) => fn());"
            "const landed = ['h', 'o', 'e'].map((k) => tiles[k].classList.contains('landing'));"
            "const hit = log.slice(n).filter(mine); const m = log.length;"
            "F.renderFeedback(pulled);"
            "out([pulled.current.placed, log.slice(0, n).filter(mine), landing, landed, hit,"
            " log.slice(0, n).filter((e) => e[0] === 'later' && e[1] === 0.09).length, log.length - m]);")
        # easy, right after a wrong check: o and e stay and lock, s and r go
        self.assertEqual(placed, [{'letter': 'h', 'tileId': 'h', 'locked': True}, {'letter': 'o', 'tileId': 'o', 'locked': True},
                                  None, None, {'letter': 'e', 'tileId': 'e', 'locked': True}])
        # o and e are drawn as placed blocks and pressed in at once (90ms,
        # ease-in); the given h, locked from the start, does nothing
        press = {'scale': 0.8, 'duration': 0.09, 'ease': 'power2.in', 'delay': 0}
        self.assertEqual(before, [['to', 'o', press], ['to', 'e', press]])
        self.assertEqual(landing, [False, True, True])
        self.assertEqual(laters, 2)
        # at the hit their locked look comes on (40px) and they come up from
        # where the press left them (0.8 of 46px) to their locked size
        self.assertEqual(landed, [False, False, False])
        up = {'scale': 1, 'duration': 0.11, 'ease': 'power2.out', 'lazy': False}
        self.assertEqual(hit, [['fromTo', 'o', {'scale': 0.92}, up], ['fromTo', 'e', {'scale': 0.92}, up]])
        # a re-render in the same state starts nothing
        self.assertEqual(again, 0)

    def test_reduced_motion_dips_them_instead(self):
        mine, landing = self.run_node(
            "reduced = true; const pulled = { ...wrong, pressed: 'lever', current: D.returnAll(wrong.current, 'easy') };"
            "F.renderFeedback(wrong); F.renderFeedback(pulled);"
            "out([log.filter(mine), ['o', 'e'].map((k) => tiles[k].classList.contains('landing'))]);")
        dip = [{'opacity': 0.4}, {'opacity': 1, 'duration': 0.2, 'ease': 'power1.out'}]
        self.assertEqual(mine, [['fromTo', 'o', *dip], ['fromTo', 'e', *dip]])
        self.assertEqual(landing, [False, False])

    def test_nothing_clunks_when_nothing_locks(self):
        res = self.run_node(
            "const out1 = [];"
            # normal: the lever sends every letter but the given one back
            "F.renderFeedback(wrong); F.renderFeedback({ ...wrong, pressed: 'lever', current: D.returnAll(wrong.current, 'normal') });"
            "out1.push(clunks());"
            # a new word starts with its given letter locked: no clunk
            "const start = { ...wrong, round: { index: 1 }, current: { ...wrong.current, status: 'playing', placed: P('h____') } };"
            "F.renderFeedback({ ...start, screen: 'theme' }); F.renderFeedback(start); out1.push(clunks());"
            # a block placed, a correct check, a start-over pull on easy
            "F.renderFeedback({ ...start, current: { ...start.current, placed: P('ho___') } });"
            "F.renderFeedback({ ...start, current: { ...start.current, status: 'correct', placed: P('horse') } });"
            "F.renderFeedback({ ...start, pressed: 'lever', current: D.returnAll({ ...start.current, placed: P('horse') }, 'easy') });"
            "out1.push(clunks()); out(out1);")
        self.assertEqual(res, [[], [], []])

    # --- the motion spec ---

    def test_the_clunk_spec(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')
        script = (f"import {{ motionFor }} from '{(self.JS / 'motion.js').as_uri()}';"
                  "console.log(JSON.stringify([motionFor('clunk', false), motionFor('clunk', true)]));")
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        m, still = json.loads(result.stdout)
        # DESIGN "Motion": 120-300ms; a press in (ease-in to the hit), then
        # ease-out, no back.out overshoot
        self.assertEqual(m, {'duration': 0.2, 'ease': 'power2.out', 'scale': 0.8, 'press': 0.09, 'fade': 0.2})
        self.assertTrue(0.12 <= m['duration'] <= 0.3)
        self.assertLess(m['press'], m['duration'])
        self.assertNotIn('back', m['ease'])
        # reduced motion: no press, an opacity fade
        self.assertEqual(still, {'duration': 0, 'ease': 'none', 'scale': 1, 'fade': 0.2})

    # --- the look (game.css) ---

    def test_the_locked_look_is_a_riveted_brass_plate_sunk_into_the_slot(self):
        css = self.css()
        rule = re.search(r'\n\.letter-box\.locked > \.draggable-letter:not\(\.landing\)\s*{([^}]*)}', css).group(1)
        # material: a brass face, the letter in ink
        self.assertIn('linear-gradient(150deg, var(--brass-hi) 0%, var(--brass) 55%, var(--brass-dark) 100%);', rule)
        self.assertIn('color: var(--ink);', rule)
        # a rivet in each corner
        self.assertIn('--rivet: radial-gradient(', rule)
        self.assertEqual(rule.count('var(--rivet) '), 4)
        for corner in ('left 2px top 2px', 'right 2px top 2px', 'left 2px bottom 2px', 'right 2px bottom 2px'):
            self.assertIn(f'var(--rivet) {corner} / 6px 6px no-repeat', rule)
        # sunk: smaller than the slot, shaded from the rim, no shadow of its own
        self.assertIn('width: 86%;', rule)
        self.assertIn('height: 86%;', rule)
        shadow = re.search(r'box-shadow:([^;]*);', rule).group(1)
        layers = [s.strip() for s in shadow.split(',')]
        self.assertEqual(layers, ['inset 0 3px 3px var(--shadow-deep)', 'inset -1px -2px 0 var(--brass-dark-lo)'])
        # B-204's amber edge is gone; palette tokens only
        self.assertNotIn('amber)', rule.replace('var(--amber-hi)', ''))
        self.assertNotIn('#', rule)
        self.assertNotIn('rgb', rule)
        # only these two rules draw a locked letter: the look keys on the
        # slot's class alone
        self.assertEqual(re.findall(r'\n([^\n{]*\.letter-box\.locked[^\n{]*){', css),
                         ['.letter-box.locked > .draggable-letter ', '.letter-box.locked > .draggable-letter:not(.landing) '])
        html = (self.ROOT / 'templates' / 'spelling_game' / 'index.html').read_text()
        self.assertGreaterEqual(int(re.search(r"css/game\.css' %}\?v=(\d+)", html).group(1)), 23)

    # --- wiring ---

    def test_the_look_keys_on_the_flag_and_the_clunk_on_the_transition(self):
        # one look for every locked letter: card.js sets the class from the
        # slot's flag (drag.js isLocked), and nothing else sets it
        self.assertIn("boxes[i].classList.toggle('locked', isLocked(slot));", self.code('card.js'))
        self.assertIn('return !!(slot && slot.locked);', self.function('isLocked', 'drag.js'))
        for f in sorted(self.JS.glob('*.js')):
            if f.name in ('card.js', 'gallery.js'):
                continue
            self.assertNotRegex(self.code(f.name), r"classList\.(add|toggle)\('locked'", f.name)
        # feedback.js: the letters that locked since the last render clunk,
        # the robot's when it lands (after its travel, which stops its tweens)
        render = self.function('renderFeedback', 'feedback.js')
        self.assertIn('newlyLocked(prev.placed, now.placed)', render)
        self.assertIn('.filter((i) => !now.placed[i].hint)', render)
        self.assertIn('.forEach((i) => clunk(tileEl(now.placed[i].tileId), 0));', render)
        hint = self.function('hintIn', 'feedback.js')
        self.assertLess(hint.index("if (!reduced) el.classList.add('landing');"), hint.index('travel(el, from,'))
        self.assertLess(hint.index('travel(el, from,'), hint.index('if (!reduced) clunk(el, at + flyIn.duration);'))
        # pure, and the clunk never touches state
        for name in ('newlyLocked', 'clunk'):
            body = self.function(name, 'feedback.js')
            for word in ('state.', 'setState'):
                self.assertNotIn(word, body, (name, word))
        for word in ('document', 'window', 'gsap'):
            self.assertNotIn(word, self.function('newlyLocked', 'feedback.js'))


class NextDomeTests(TestCase):
    """Next-word dome you can't miss (BACKLOG B-212). After a correct
    answer or a reveal the check dome has a state of its own, `next`
    (controls.js domeState), which game.css draws as a blink: the lit dome
    on and off (1.2s a blink, holding lit and holding at an ember), its
    glass shining and an amber halo reaching past its rim while it is on.
    The `ready` pulse before a check stays as it was: slower, never dark,
    no light layers. Reduced motion: lit, shining and glowing, steadily.
    If the dome is not pressed, the robot nudges toward it (character.js
    domeNudge: pointing at it, a pop, the finger wagging) 4s after the
    answer and then every 8s (nudgeWait; main.js armNudge counts them in
    state.nudges); on an answered word the kid-idle beat no longer
    comes."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        # st(...) is a play-screen state on the word "cat", checked
        # correct (round 1, three lives, no nudge yet) with overrides
        script = (
            f"const c = await import('{(self.JS / 'character.js').as_uri()}');"
            f"const C = await import('{(self.JS / 'controls.js').as_uri()}');"
            "const out = (v) => console.log(JSON.stringify(v));"
            "const put = (s) => s.split('').map((ch, i) => (ch === '-' ? null : { letter: ch, tileId: 't' + i }));"
            "const cur = (status, placed = 'cat') => ({ word: 'cat', status, placed: put(placed) });"
            "const st = (o = {}) => ({ screen: 'play', roundsStarted: 1, idleBeat: null, lastInput: 0, lives: 3, lockedTaps: 0,"
            " nudges: 0, pressed: null, round: { index: 0, size: 5, results: [{ word: 'cat', correct: true }] },"
            " current: cur('correct'), ...o });"
            "const moments = (a, b) => c.momentsFor(c.snapshot(a), c.snapshot(b));"
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
        start = re.search(rf'\n(export )?(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    def css(self):
        return re.sub(r'/\*.*?\*/', '', (self.ROOT / 'static' / 'css' / 'game.css').read_text(), flags=re.S)

    def block(self, css, head):
        # the body of the first block opened by `head`, braces matched
        start = css.index(head)
        i = css.index('{', start) + 1
        depth = 1
        j = i
        while depth:
            depth += {'{': 1, '}': -1}.get(css[j], 0)
            j += 1
        return css[i:j - 1]

    def rule(self, css, selector):
        m = re.search(r'(?:^|})\s*' + re.escape(selector) + r'\s*{([^}]*)}', css)
        self.assertIsNotNone(m, selector)
        return m.group(1)

    def frames(self, css, name):
        # keyframe stops as [(percent, opacity)], sorted
        body = self.block(css, f'@keyframes {name} ')
        stops = []
        for sel, decl in re.findall(r'([^{}]+){([^}]*)}', body):
            value = float(re.search(r'opacity:\s*([\d.]+)', decl).group(1))
            for s in sel.split(','):
                s = s.strip()
                stops.append((0.0 if s == 'from' else 100.0 if s == 'to' else float(s.rstrip('%')), value))
        return sorted(stops)

    # --- the dome's state ---

    def test_the_dome_is_next_after_a_correct_answer_or_a_reveal(self):
        res = self.run_node(
            "out([['playing', '---'], ['playing', 'ca-'], ['playing', 'cat'], ['wrong', 'tac'], ['correct', 'cat'], ['revealed', 'cat']]"
            ".map(([s, p]) => [C.domeAction(cur(s, p)), C.domeState(cur(s, p), null), C.domeState(cur(s, p), 'dome')]));")
        self.assertEqual(res, [
            [None, 'off', 'pressed'], [None, 'off', 'pressed'], ['check', 'ready', 'pressed'],
            [None, 'off', 'pressed'], ['next', 'next', 'pressed'], ['next', 'next', 'pressed']])
        # the render shows it as class is-next (one state class at a time)
        controls = self.code('controls.js')
        self.assertIn("dome: ['off', 'ready', 'next', 'pressed'],", controls)
        self.assertIn("show(dome, 'dome', domeState(current, pressed));", controls)

    # --- the blink (game.css) ---

    def test_the_next_dome_blinks_on_and_off_in_a_light_past_its_rim(self):
        css = self.css()
        self.assertIn('animation: dome-next 1.2s ease-in-out infinite;', self.rule(css, '#check-btn.is-next .dome-ready'))
        self.assertIn('opacity: 1;', self.rule(css, '#check-btn.is-next .dome-ready'))
        # on and off with a hold at each: lit for 40% (480ms), out, dark
        # for 34% at an ember (0.2), back; each change 156ms, inside
        # DESIGN "Motion"'s 120-300ms; not `alternate` (a rhythm, not a
        # swing back and forth)
        dome = self.frames(css, 'dome-next')
        light = self.frames(css, 'dome-next-light')
        self.assertEqual(dome, [(0, 1), (40, 1), (53, 0.2), (87, 0.2), (100, 1)])
        self.assertEqual(light, [(0, 1), (40, 1), (53, 0), (87, 0), (100, 1)])
        for (a, _), (b, _) in zip(dome, dome[1:]):
            if b - a < 30:
                self.assertTrue(120 <= (b - a) / 100 * 1200 <= 300, (a, b))
        # the light, two layers: the shine over the glass (the button's
        # ::after) and the halo (the console's ::after); off at rest and on
        # no other state, no taps, shown and blinking in step with the dome
        # only while it is `next`
        shine = self.rule(css, '#check-btn::after')
        halo = self.rule(css, '#screen-play .console::after')
        for rule in (shine, halo):
            for decl in ("content: '';", 'position: absolute;', 'opacity: 0;', 'pointer-events: none;'):
                self.assertIn(decl, rule)
        on = self.rule(css, '#check-btn.is-next::after,\n#screen-play .console:has(#check-btn.is-next)::after')
        self.assertIn('opacity: 1;', on)
        self.assertIn('animation: dome-next-light 1.2s ease-in-out infinite;', on)
        shown = [sel for sel in re.findall(r'(?:^|})\s*([^{}]*::(?:before|after)[^{}]*){([^}]*)}', css)
                 if 'opacity: 1;' in sel[1] and ('check-btn' in sel[0] or '.console' in sel[0])]
        self.assertTrue(shown)
        for sel, _ in shown:
            for part in sel.split(','):
                self.assertIn('#check-btn.is-next', part, sel)
        self.assertNotIn('#check-btn::before', css)
        # the halo: centred on the dome's glass (the dome's centre, --cx /
        # --cy, moved up to 42% of its sprite), 2.4x its width, so it
        # reaches past the brass rim; in the console's z-order after the
        # console image (-1): under the rail, the bench blocks and the
        # controls, which are z auto. The shine: inside the glass.
        dome = self.rule(css, '#check-btn')
        for decl in ('--cx: 81.5%;', '--cy: 41%;', '--w: calc(var(--console-w) * 0.254);', '--ar: calc(169 / 240);'):
            self.assertIn(decl, dome)
        for decl in ('--rx: calc(var(--console-w) * 0.254 * 1.2);', '--ry: calc(var(--console-w) * 0.254 * 169 / 240 * 1.075);',
                     'z-index: -1;', 'left: calc(81.5% - var(--rx));',
                     'top: calc(41% - var(--console-w) * 0.254 * 169 / 240 * 0.08 - var(--ry));',
                     'radial-gradient(var(--rx) var(--ry) at var(--rx) var(--ry), var(--glow-next-core)'):
            self.assertIn(decl, halo)
        self.assertIn('z-index: -1;', self.rule(css, '.console-body'))
        self.assertLess(int(re.search(r'width: (\d+)%;', shine).group(1)), 100)
        self.assertIn('var(--shine-next)', shine)
        root = self.block(css, ':root')
        self.assertIn('--glow-next-core: var(--amber-hi);', root)
        for token in ('--glow-next:', '--glow-next-edge:', '--shine-next:', '--shine-next-edge:'):
            self.assertRegex(root, re.escape(token) + r' color-mix\(in srgb, var\(--amber(-deep)?\) \d+%, transparent\);')
        html = (self.ROOT / 'templates' / 'spelling_game' / 'index.html').read_text()
        self.assertGreaterEqual(int(re.search(r"css/game\.css' %}\?v=(\d+)", html).group(1)), 24)

    def test_the_halo_adds_no_scroll_area(self):
        # B-212 review fix: a positioned box adds scroll area even at
        # opacity 0, and nothing above the play screen clips overflow. The
        # light (radius rx, ry about the glass) would reach past the
        # screen's right and bottom edges, so the halo's box is not the
        # light's: it starts rx left of and ry above the glass and ends at
        # #screen-play's own right and bottom edges (the console is inset
        # (scene-w - console-w) / 2 from the sides, and #screen-play's
        # padding-bottom is below it); the gradient keeps its size and
        # centre with explicit radii and an `at` position. Measured in the
        # browser: scrollWidth / scrollHeight equal the window at 360x740,
        # 390x844, 412x915, 360x640 and 1024x740 (the screenshot runs
        # assert it).
        css = self.css()
        halo = self.rule(css, '#screen-play .console::after')
        self.assertIn('right: calc((var(--console-w) - var(--scene-w)) / 2);', halo)
        self.assertIn('bottom: -22px;', halo)
        for decl in ('width:', 'height:', 'transform:', 'closest-side'):
            self.assertNotIn(decl, halo)
        self.assertIn('--console-w: calc(var(--scene-w) - 36px);', self.rule(css, '#screen-play .console'))
        self.assertIn('align-self: center;', self.rule(css, '#screen-play .console'))
        screen = self.rule(css, '#screen-play')
        padding_bottom = int(re.search(r'padding: calc\(var\(--bg-h\) \* 0\.445\) 14px (\d+)px;', screen).group(1))
        self.assertNotIn('padding-bottom', screen)
        # the box's bottom is the screen's: as far below the console (the
        # last item, pinned to the bottom) as #screen-play's padding
        self.assertEqual(int(re.search(r'bottom: -(\d+)px;', halo).group(1)), padding_bottom)
        # in px, at the phone widths (the column is min(width, 480)): the
        # box starts inside the screen, right of the speaker, and ends at
        # the screen's right edge, though the light reaches past it
        for width in (360, 390, 412, 480, 1024):
            scene = min(width, 480)
            console = scene - 36                        # --console-w
            inset = (scene - console) / 2               # align-self: center
            dome = console * 0.254                      # #check-btn --w
            glass = inset + console * 0.815             # --cx
            rx = dome * 1.2                             # --rx
            box_left = glass - rx                       # left: calc(81.5% - var(--rx))
            box_right = inset + console - (console - scene) / 2   # right: calc((console-w - scene-w) / 2)
            self.assertGreater(box_left, inset + console * 0.361 + 24, width)   # right of the speaker's tap area
            self.assertEqual(box_right, scene, width)                           # the screen's right edge
            self.assertGreater(glass + rx, scene, width)                        # the light alone would overflow

    def test_the_ready_pulse_before_a_check_stays_calmer(self):
        css = self.css()
        # as B-114 made it: 0.45 <-> 1, 1.2s each way, never dark, no light
        self.assertIn('animation: dome-ready 1.2s ease-in-out infinite alternate;', self.rule(css, '#check-btn.is-ready .dome-ready'))
        ready = self.frames(css, 'dome-ready')
        self.assertEqual(ready, [(0, 0.45), (100, 1)])
        self.assertNotIn('is-ready::', css)
        # the blink is twice as quick (1.2s a blink against 2.4s there and
        # back), goes far lower, and only it has the light
        next_low = min(v for _, v in self.frames(css, 'dome-next'))
        self.assertLess(next_low, min(v for _, v in ready))

        def cycle(selector, name):
            m = re.search(rf'animation: {name} ([\d.]+)s ease-in-out infinite( alternate)?;', self.rule(css, selector))
            return float(m.group(1)) * (2 if m.group(2) else 1)
        self.assertEqual(cycle('#check-btn.is-ready .dome-ready', 'dome-ready'), 2.4)
        self.assertEqual(cycle('#check-btn.is-next .dome-ready', 'dome-next'), 1.2)

    def test_reduced_motion_glows_steadily(self):
        css = self.css()
        blocks = [self.block(css[m.start():], '@media (prefers-reduced-motion: reduce)')
                  for m in re.finditer(r'@media \(prefers-reduced-motion: reduce\)', css)]
        steady = [b for b in blocks if '#check-btn.is-next .dome-ready' in b]
        self.assertEqual(len(steady), 1)
        rule = steady[0]
        for sel in ('#check-btn.is-next .dome-ready', '#check-btn.is-next::after', '#screen-play .console:has(#check-btn.is-next)::after'):
            self.assertIn(sel, rule)
        self.assertIn('animation: none;', rule)
        # with no animation they stay at their lit values: dome lit, light on
        self.assertIn('opacity: 1;', self.rule(css, '#check-btn.is-next .dome-ready'))
        self.assertIn('opacity: 1;', self.rule(css, '#check-btn.is-next::after,\n#screen-play .console:has(#check-btn.is-next)::after'))

    # --- the robot's nudge (character.js) ---

    def test_nudge_wait_is_4s_after_the_answer_then_8s(self):
        self.assertEqual(self.run_node(
            "out([c.NUDGE_MS, c.nudgeWait(st()), c.nudgeWait(st({ nudges: 1 })), c.nudgeWait(st({ nudges: 6 })),"
            " c.nudgeWait(st({ current: cur('revealed'), lives: 0 })),"
            " c.nudgeWait(st({ current: cur('playing', 'cat') })), c.nudgeWait(st({ current: cur('playing', 'ca-') })),"
            " c.nudgeWait(st({ current: cur('wrong', 'tac'), lives: 2 })), c.nudgeWait(st({ pressed: 'dome' })),"
            " c.nudgeWait(st({ screen: 'round-end' })), c.nudgeWait(st({ screen: 'theme', current: { word: null, placed: [] } }))]);"),
            [{'first': 4000, 'every': 8000}, 4000, 8000, 8000, 4000, None, None, None, None, None, None])

    def test_nudges_come_at_4_12_20_and_28s_and_stop_with_the_word(self):
        # main.js armNudge's loop on a clock: wait nudgeWait, one more
        # nudge, again until it gives null (the dome pressed, the next word
        # or another screen)
        res = self.run_node(
            "const run = (s, stopAt, change) => { const times = []; let t = 0; let w = c.nudgeWait(s);"
            " while (w !== null && t + w <= 30000) { t += w; if (t >= stopAt) s = change(s); if (c.nudgeWait(s) === null) break;"
            " s = { ...s, nudges: s.nudges + 1 }; times.push(t); w = c.nudgeWait(s); } return times; };"
            "out([run(st(), Infinity, (s) => s), run(st(), 10000, (s) => ({ ...s, pressed: 'dome' })),"
            " run(st(), 15000, (s) => ({ ...s, screen: 'theme', current: { word: null, placed: [] } }))]);")
        self.assertEqual(res, [[4000, 12000, 20000, 28000], [4000], [4000, 12000]])

    def test_each_nudge_is_his_dome_nudge_moment(self):
        five = "{ index: 4, size: 5, results: [0, 1, 2, 3, 4].map(() => ({ correct: true })) }"
        self.assertEqual(self.run_node(
            "out([moments(st({ current: cur('playing', 'cat') }), st()), moments(st(), st({ nudges: 1 })),"
            " moments(st({ nudges: 1 }), st({ nudges: 2 })), moments(st({ nudges: 2 }), st({ nudges: 2 })),"
            " moments(st({ current: cur('revealed'), lives: 0 }), st({ current: cur('revealed'), lives: 0, nudges: 1 })),"
            " moments(st({ nudges: 3 }), st({ nudges: 0, round: { index: 1, size: 5, results: [{ word: 'cat', correct: true }] },"
            "  current: { ...cur('playing', '---'), word: 'dog' } })),"
            f" moments(st({{ nudges: 2, round: {five} }}), {{ ...st({{ round: {five} }}), screen: 'round-end' }}),"
            " c.snapshot(st({ nudges: 2 })).nudges, c.snapshot({ ...st({ nudges: 2 }), screen: 'theme', current: { word: null, placed: [] } }).nudges,"
            " c.snapshot({ ...st(), nudges: undefined }).nudges, c.NONE.nudges, c.soundsFor(['domeNudge'])]);"),
            [['correct'], ['domeNudge'], ['domeNudge'], [], ['domeNudge'], ['picture'], ['roundEndGood'], 2, 0, 0, 0, []])

    def test_he_points_at_the_dome_wags_and_comes_back_to_rest(self):
        steps, point, ends, wag, reduced = self.run_node(
            "out([c.stepsOf('domeNudge'), c.stepsOf('filledEarly', 'point')[0],"
            " ['correct', 'streak', 'thirdMiss'].map((m) => Math.max(...c.stepsOf(m).map((s) => s.at))),"
            " c.fxFor('wag', false), [c.reducedStep(c.stepsOf('domeNudge')[0]), c.fxFor('wag', true)]]);")
        # the pose CHARACTER.md names "point (at the dome)", as "All slots
        # filled" has it: eyes wide, eyebrows up, the head turned and the
        # eyes looking toward the dome; and a pop
        self.assertEqual(steps[0], {**point, 'pop': 1})
        self.assertEqual(steps[0]['hands'], 'point')
        # the pointing finger wags at it (the flourish of "All slots
        # filled" extra excited), then his rest pose, eyes ahead
        self.assertEqual(steps[1], {'at': 0.3, 'fx': 'wag'})
        self.assertEqual(wag[0]['part'], 'flipR')
        self.assertEqual(steps[-1], {'at': 2, 'hands': 'rest', 'eyes': 'idle', 'brows': 'calm', 'head': 0, 'look': [0, 0]})
        # over before the next nudge, and the moments that answer a word
        # are over before the first one
        self.assertLess(steps[-1]['at'] * 1000, 8000)
        self.assertTrue(all(t * 1000 < 4000 for t in ends), ends)
        # reduced motion: the pose only, no pop and no wag
        self.assertEqual(reduced, [{k: v for k, v in point.items()}, []])

    def test_no_idle_beat_on_an_answered_word(self):
        # the nudges are what a kid who does not go on gets; while the word
        # is open the idle beat comes as before
        self.assertEqual(self.run_node(
            "out([c.idleWait(st({ current: cur('playing', 'ca-'), lastInput: 1000 }), 1000),"
            " c.idleWait(st({ current: cur('wrong', 'tac'), lives: 2, lastInput: 1000 }), 5000),"
            " c.idleWait(st({ lastInput: 1000 }), 50000), c.idleWait(st({ current: cur('revealed'), lives: 0, lastInput: 1000 }), 50000)]);"),
            [10000, 6000, None, None])

    # --- wiring (main.js, state.js) ---

    def test_main_counts_the_nudges_and_nothing_else_does(self):
        self.assertRegex((self.JS / 'state.js').read_text(), r'\n    nudges: 0,')
        main = self.code('main.js')
        self.assertIn("import { renderRobot, renderTalk, idleWait, nudgeWait, wordKey, IDLE_MS } from './character.js';", main)
        arm = self.function('armNudge')
        self.assertIn('const word = wordKey(state);', arm)
        self.assertIn('if (wordKey(state) !== word || nudgeWait(state) === null) return;', arm)
        self.assertIn('setState({ nudges: state.nudges + 1 });', arm)
        self.assertIn('if (next !== null) setTimeout(tick, next);', arm)
        self.assertIn('if (wait !== null) setTimeout(tick, wait);', arm)
        # armed right after the setState that answers the word: correct or
        # revealed, not a miss with lives left
        check = self.function('onCheck')
        self.assertEqual(check.count('armNudge();'), 2)
        correct = check[check.index('if (correct) {'):check.index('} else if (lives - 1 <= 0) {')]
        reveal = check[check.index('} else if (lives - 1 <= 0) {'):check.index('} else {', check.index('} else if (lives - 1 <= 0) {') + 5)]
        for branch in (correct, reveal):
            self.assertLess(branch.index('setState('), branch.index('armNudge();'))
        miss = check[check.index('} else {', check.index('} else if (lives - 1 <= 0) {') + 5):]
        self.assertNotIn('armNudge', miss)
        # back to 0 on every new word, the round end and the theme screen
        for name, n in (('startRound', 1), ('onNext', 2), ('onThemes', 1)):
            self.assertEqual(self.function(name).count('nudges: 0,'), n, name)
        self.assertEqual(len(re.findall(r'\bnudges:', main)), 5)
        # only main.js writes it; character.js reads it and never sets state
        for f in sorted(self.JS.glob('*.js')):
            if f.name != 'main.js':
                self.assertNotRegex(self.code(f.name), r'setState\([^)]*nudges', f.name)
        self.assertNotIn('setState', self.code('character.js'))


class LongWordTests(TestCase):
    """Long words (BACKLOG B-213): 7-8 letters stay on one row of smaller
    slots, 9-10 letters break into two rows of 46px at the word's `break`
    with a brass joint at the break that glows once as the word appears.
    round.js makeWord carries the `break` (and warns when a 9-10 letter
    word has none), main.js reads it from the data, card.js lays the
    slots and the joint out from layout.js slotLayout (run here with a
    stand-in DOM), drag.js drops into a small slot's whole area,
    feedback.js glows the joint (stand-ins for GSAP and the DOM), and
    game.css draws it. The sizes themselves are SlotLayoutTests' and the
    fit at 360x740 TenLetterFitTests'."""

    ROOT = Path(__file__).resolve().parent.parent
    JS = ROOT / 'static' / 'js'
    CSS = ROOT / 'static' / 'css' / 'game.css'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body, prelude=''):
        script = (
            "const out = (v) => console.log(JSON.stringify(v));"
            f"{prelude}"
            f"const R = await import('{(self.JS / 'round.js').as_uri()}');"
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
        start = re.search(rf'\n(export )?(async )?function {name}\(', js).start()
        return js[start:js.index('\n}\n', start)]

    def css(self):
        return re.sub(r'/\*.*?\*/', '', self.CSS.read_text(), flags=re.S)

    def rule(self, selector):
        return re.search(r'(?<!,)\n' + re.escape(selector) + r'\s*{(.*?)}', self.css(), flags=re.S).group(1)

    # --- the data: round.js makeWord, main.js ---

    def test_make_word_carries_the_break_and_warns_without_one(self):
        res = self.run_node(
            "const warned = []; console.warn = (m) => warned.push(m);"
            "let seq = 0; const newId = () => `t${++seq}`;"
            "const make = (e) => { warned.length = 0; const cur = R.makeWord(e, 'normal', newId); return [cur.break, warned.length]; };"
            "out([make({ word: 'helicopter', break: 4 }), make({ word: 'submarine', break: 3 }), make({ word: 'motorbike', break: 5 }),"
            # 7-8 letters: the break is carried (the rail ignores it), nothing to warn about
            "     make({ word: 'scooter', break: 4 }), make({ word: 'airplane' }), make({ word: 'duck' }),"
            # 9-10 letters without a usable break: null, and one warning naming the word
            "     make({ word: 'helicopter' }), make({ word: 'submarine', break: 9 }), make({ word: 'motorbike', break: '5' }),"
            "     make({ word: 'helicopter', break: 0 }), make({ word: 'helicopter', break: 4.5 })]);")
        self.assertEqual(res, [[4, 0], [3, 0], [5, 0], [4, 0], [None, 0], [None, 0], [None, 1], [None, 1], [None, 1], [None, 1], [None, 1]])

    def test_make_word_warning_names_the_word(self):
        script = (
            f"const R = await import('{(self.JS / 'round.js').as_uri()}');"
            "R.makeWord({ word: 'submarine' }, 'hard', () => 'x');"
        )
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('flip: "submarine" has 9 letters and no break', result.stderr)

    def test_every_long_content_word_has_a_break_that_fits(self):
        # the theme data carries `break` for its 9-10 letter words (the
        # content batch), and each row of the split fits a 360 wide rail
        # (six 46px slots); `break` on a shorter word is allowed and unused
        long_words = 0
        for f in sorted((self.ROOT / 'static' / 'data').glob('*.json')):
            for word, entry in json.loads(f.read_text()).items():
                if len(word) > 8:
                    long_words += 1
                    brk = entry.get('break')
                    self.assertIsInstance(brk, int, (f.name, word))
                    self.assertTrue(1 <= brk < len(word), (f.name, word, brk))
                    self.assertLessEqual(max(brk, len(word) - brk), 6, (f.name, word, brk))
        self.assertGreaterEqual(long_words, 3)

    def test_main_reads_the_break_from_the_data(self):
        start = self.function('startRound', 'main.js')
        self.assertIn('.map((word) => ({ word, image: data[word].image, audio: data[word].audio, break: data[word].break }));', start)
        self.assertIn('current: makeWord(words[0], level, newTileId),', start)
        self.assertIn('        break: null,', (self.JS / 'state.js').read_text())
        self.assertIn('break: brk,', self.function('makeWord', 'round.js'))

    # --- card.js: the rail, with a stand-in DOM ---

    FAKE_DOM = """
        class El {
            constructor(tag) {
                this.tag = tag; this.children = []; this.parentNode = null; this.dataset = {}; this.attrs = {};
                this.cls = new Set(); this.clientWidth = 0; this.textContent = '';
                this.style = { setProperty(k, v) { this[k] = String(v); } };
                this.classList = {
                    toggle: (c, on) => { if (on === undefined ? !this.cls.has(c) : on) this.cls.add(c); else this.cls.delete(c); },
                    add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c),
                };
            }
            set className(v) { this.cls = new Set(v.split(' ').filter(Boolean)); }
            get className() { return [...this.cls].join(' '); }
            set innerHTML(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
            get firstChild() { return this.children[0] || null; }
            appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
            insertBefore(c, ref) {
                if (c.parentNode) c.remove(); c.parentNode = this;
                const i = ref ? this.children.indexOf(ref) : -1;
                if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
                return c;
            }
            remove() { const p = this.parentNode; if (!p) return; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; }
            setAttribute(k, v) { this.attrs[k] = String(v); }
            getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
            addEventListener() {}
            querySelectorAll(sel) { return sel === '.rail-joint' ? this.children.filter((c) => c.cls.has('rail-joint')) : []; }
            querySelector(sel) {
                const m = /^\\.rail-joint\\[data-side="(\\w+)"\\]$/.exec(sel);
                return m ? this.children.find((c) => c.cls.has('rail-joint') && c.dataset.side === m[1]) || null : null;
            }
        }
        const els = { 'play-image': new El('img'), 'word-counter': new El('p'), 'letter-boxes': new El('div'), 'letter-tray': new El('div') };
        els['letter-boxes'].clientWidth = 332;
        els['letter-tray'].clientWidth = 332;
        globalThis.document = { getElementById: (id) => els[id] || null, querySelectorAll: () => [], createElement: (t) => new El(t) };
        globalThis.gsap = { set() {} };
        globalThis.Draggable = { create() { return [{ on: true, enabled(v) { if (v === undefined) return this.on; this.on = v; return this; }, kill() {} }]; } };
    """

    def render(self, body):
        return self.run_node(
            f"const C = await import('{(self.JS / 'card.js').as_uri()}');"
            "let seq = 0; const newId = () => `t${++seq}`;"
            "const rail = els['letter-boxes'];"
            "const view = () => ({ vars: ['--slot-size', '--slot-gap', '--slot-font', '--hit-x', '--hit-y', '--cols'].map((k) => rail.style[k]),"
            "  boxes: rail.children.map((b) => [b.style.gridRow, b.style.gridColumn, b.children.map((c) => c.cls.has('rail-joint') ? c.className : 'tile')]) });"
            "const show = (entry, level = 'normal') => { const current = R.makeWord(entry, level, newId);"
            "  C.renderCard({ screen: 'play', lives: 3, round: { index: 0, size: 5 }, current }); return current; };"
            + body,
            prelude=self.FAKE_DOM,
        )

    def test_card_lays_a_broken_word_out_in_two_centred_rows_with_the_joint(self):
        heli, sub = self.render(
            "const cur = show({ word: 'helicopter', break: 4 }); const a = view();"
            "show({ word: 'submarine', break: 3 }); out([a, view()]);")
        self.assertEqual(heli['vars'], ['46px', '6px', '28px', '0px', '0px', '12'])
        # heli | copter: four slots on the first row (one slot in from the
        # left of the six-slot grid), six on the second
        self.assertEqual([b[:2] for b in heli['boxes']],
                         [['1', '3 / span 2'], ['1', '5 / span 2'], ['1', '7 / span 2'], ['1', '9 / span 2'],
                          ['2', '1 / span 2'], ['2', '3 / span 2'], ['2', '5 / span 2'], ['2', '7 / span 2'],
                          ['2', '9 / span 2'], ['2', '11 / span 2']])
        self.assertEqual([b[2] for b in heli['boxes']], [[], [], [], ['rail-joint end'], ['rail-joint start'], [], [], [], [], []])
        # sub | marine
        self.assertEqual([b[0] for b in sub['boxes']], ['1'] * 3 + ['2'] * 6)
        self.assertEqual([b[2] for b in sub['boxes']], [[], [], ['rail-joint end'], ['rail-joint start'], [], [], [], [], []])

    def test_card_moves_the_joint_when_the_next_word_breaks_elsewhere(self):
        # submarine then motorbike: nine slots both, so the slots are kept,
        # but the rows and the joint follow the new break (motor | bike);
        # then a word on one row has no joint at all
        moto, air, scooter = self.render(
            "show({ word: 'submarine', break: 3 }); const kept = rail.children[0];"
            "show({ word: 'motorbike', break: 5 }); const a = view(); a.kept = rail.children[0] === kept;"
            "show({ word: 'airplane' }); const b = view();"
            "show({ word: 'scooter', break: 4 }, 'easy'); out([a, b, view()]);")
        self.assertTrue(moto['kept'])
        self.assertEqual([b[:2] for b in moto['boxes']],
                         [['1', '1 / span 2'], ['1', '3 / span 2'], ['1', '5 / span 2'], ['1', '7 / span 2'], ['1', '9 / span 2'],
                          ['2', '2 / span 2'], ['2', '4 / span 2'], ['2', '6 / span 2'], ['2', '8 / span 2']])
        self.assertEqual([b[2] for b in moto['boxes']], [[], [], [], [], ['rail-joint end'], ['rail-joint start'], [], [], []])
        self.assertEqual(moto['vars'][-1], '10')
        # 8 letters: one row of 36px slots, 4px apart, a 21px letter, the
        # tap area 2px into each gap and 8px up and down to the rail's edges
        self.assertEqual(air['vars'], ['36px', '4px', '21px', '2px', '8px', '16'])
        self.assertEqual({b[0] for b in air['boxes']}, {'1'})
        self.assertEqual([b[2] for b in air['boxes']], [[]] * 8)
        # 7 letters, its break unused; on easy the given s is in its slot
        self.assertEqual(scooter['vars'], ['41px', '4px', '24px', '2px', '8px', '14'])
        self.assertEqual([b[2] for b in scooter['boxes']], [['tile']] + [[]] * 6)

    def test_card_keeps_a_placed_block_in_front_of_the_joint(self):
        # feedback.js reads a filled slot's block as its first child
        boxes = self.render(
            "const cur = show({ word: 'helicopter', break: 4 });"
            "const t = cur.tray.find((x) => x.letter === 'i');"
            "const placed = [...cur.placed]; placed[3] = { letter: 'i', tileId: t.id };"
            "const next = { ...cur, placed, tray: cur.tray.map((x) => (x.id === t.id ? { ...x, used: true } : x)) };"
            "C.renderCard({ screen: 'play', lives: 3, round: { index: 0, size: 5 }, current: next });"
            "out(view().boxes.map((b) => b[2]));")
        self.assertEqual(boxes[3], ['tile', 'rail-joint end'])
        self.assertEqual(boxes[4], ['rail-joint start'])

    # --- drag.js: a small slot's drop area ---

    def test_drag_drops_into_the_slots_whole_area(self):
        near = self.function('nearestHitBox', 'drag.js')
        self.assertIn("import { slotLayout, dropsIn } from './layout.js';", self.code('drag.js'))
        self.assertIn('const { hit } = slotLayout(state.current.placed.length, rail.clientWidth, state.current.break);', near)
        self.assertIn('if (!dropsIn(t, b, hit)) return;', near)
        self.assertNotIn('hitTest', near)

    # --- feedback.js: the joint glows once ---

    def glow(self, body):
        return self.run_node(
            "const log = []; let reduced = false;"
            "globalThis.window = { matchMedia: () => ({ matches: reduced }) };"
            "globalThis.gsap = { set() {}, to() {}, timeline() { const t = { to() { return t; }, set() { return t; } }; return t; },"
            " killTweensOf(t) { log.push(['kill', t.length]); }, delayedCall() {}, getProperty() { return 0; },"
            " fromTo(t, a, b) { log.push(['fromTo', t.map((j) => j.side), a, { ...b, onComplete: typeof b.onComplete }]); b.onComplete && b.onComplete(); } };"
            "const joint = (side) => { const props = { '--joint-glow': '1' }; return { side, props, style: { removeProperty: (k) => delete props[k] } }; };"
            "let joints = [];"
            "globalThis.document = { getElementById: () => ({ children: [] }), querySelector: () => null,"
            " querySelectorAll: (sel) => (sel === '#letter-boxes .rail-joint' ? joints : []) };"
            f"const F = await import('{(self.JS / 'feedback.js').as_uri()}');"
            "const at = (index, word) => ({ screen: 'play', lives: 3, pressed: null, round: { index },"
            " current: { word, status: 'playing', tray: [], placed: Array(word.length).fill(null) } });"
            + body)

    def test_the_joint_glows_once_when_a_broken_word_appears(self):
        log, left = self.glow(
            "joints = [joint('end'), joint('start')];"
            "F.renderFeedback(at(0, 'helicopter'));"
            # a re-render of the same word, then a move on it: no glow again
            "F.renderFeedback(at(0, 'helicopter')); F.renderFeedback(at(0, 'helicopter'));"
            "out([log, joints.map((j) => j.props)]);")
        self.assertEqual(log, [['kill', 2], ['fromTo', ['end', 'start'], {'--joint-glow': 0},
                                {'--joint-glow': 1, 'duration': 0.3, 'ease': 'power1.inOut', 'yoyo': True, 'repeat': 1,
                                 'onComplete': 'function'}]])
        # when it is over the inline value goes: the CSS rest look stays
        self.assertEqual(left, [{}, {}])

    def test_the_next_broken_word_glows_again_and_a_word_on_one_row_never(self):
        log = self.glow(
            "F.renderFeedback(at(0, 'duck')); F.renderFeedback(at(1, 'scooter'));"   # no joint in the DOM
            "joints = [joint('end'), joint('start')];"
            "F.renderFeedback(at(2, 'submarine')); F.renderFeedback(at(3, 'motorbike'));"
            "joints = [];"
            "F.renderFeedback({ screen: 'round-end', round: { index: 4 }, current: { word: 'motorbike' } });"
            "out(log.filter((e) => e[0] === 'fromTo').length);")
        self.assertEqual(log, 2)

    def test_reduced_motion_keeps_the_joint_steady(self):
        log = self.glow(
            "reduced = true; joints = [joint('end'), joint('start')];"
            "F.renderFeedback(at(0, 'helicopter')); out([log, joints.map((j) => j.props)]);")
        self.assertEqual(log, [[], [{'--joint-glow': '1'}, {'--joint-glow': '1'}]])
        m = json.loads(subprocess.run(
            ['node', '--input-type=module', '-e',
             f"import {{ motionFor }} from '{(self.JS / 'motion.js').as_uri()}';"
             "console.log(JSON.stringify([motionFor('jointGlow', false), motionFor('jointGlow', true)]));"],
            capture_output=True, text=True, timeout=20).stdout)
        self.assertEqual(m, [{'duration': 0.6, 'ease': 'power1.inOut', 'scale': 1}, {'duration': 0, 'ease': 'none', 'scale': 1}])

    # --- game.css ---

    def test_the_rail_grid_and_the_slot_letter(self):
        rail = self.rule('.letter-boxes')
        self.assertIn('grid-template-columns: repeat(var(--cols), calc((var(--slot-size) - var(--slot-gap)) / 2));', rail)
        self.assertIn('justify-content: center;', rail)
        for decl in ('--slot-font: 28px;', '--hit-x: 0px;', '--hit-y: 0px;'):
            self.assertIn(decl, rail)
        self.assertIn('position: relative;', self.rule('.letter-box'))
        placed = self.rule('.letter-box > .draggable-letter')
        self.assertIn('font-size: var(--slot-font);', placed)
        self.assertIn('position: relative;', placed)
        # a placed letter's tap area: the rail's full height in a small slot
        area = self.rule('.letter-box > .draggable-letter::before')
        for decl in ("content: '';", 'position: absolute;', 'top: calc(-1 * var(--hit-y));', 'bottom: calc(-1 * var(--hit-y));',
                     'left: calc(-1 * var(--hit-x));', 'right: calc(-1 * var(--hit-x));'):
            self.assertIn(decl, area)
        # a locked letter (B-211) as large as the letters round it in a small slot
        self.assertIn('font-size: min(25px, var(--slot-font));', self.rule('.letter-box.locked > .draggable-letter:not(.landing)'))
        html = (self.ROOT / 'templates' / 'spelling_game' / 'index.html').read_text()
        self.assertGreaterEqual(int(re.search(r"css/game\.css' %}\?v=(\d+)", html).group(1)), 26)

    def test_the_joint_is_one_small_rule_set_in_the_palette(self):
        css = self.css()
        sets = re.findall(r'\n([^\n{]*\.rail-joint[^\n{]*){', css)
        self.assertEqual([s.strip() for s in sets], ['.rail-joint', '.rail-joint.end', '.rail-joint.start', '.rail-joint::after'])
        body = ''.join(self.rule(s.strip()) for s in sets)
        for colour in ('var(--brass)', 'var(--brass-dark)', 'var(--cream)'):
            self.assertIn(colour, body)
        self.assertNotIn('#', body)
        self.assertNotIn('rgb', body)
        joint = self.rule('.rail-joint')
        self.assertIn('--joint-glow: 0;', joint)
        self.assertIn('pointer-events: none;', joint)
        self.assertIn('calc(var(--joint-glow) * 12px)', joint)
        self.assertIn('opacity: var(--joint-glow);', self.rule('.rail-joint::after'))
        # no other module draws or moves it
        for f in sorted(self.JS.glob('*.js')):
            if f.name not in ('card.js', 'feedback.js'):
                self.assertNotIn('rail-joint', self.code(f.name), f.name)
