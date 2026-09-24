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


class AudioTests(TestCase):
    """static/js/audio.js, DOM-free part: pools match the files on disk with
    spaces URL-encoded, clip picking never repeats, cues come from state
    changes, and the mute flag round-trips through storage (BACKLOG B-108)."""

    JS = Path(__file__).resolve().parent.parent / 'static' / 'js'
    MODULE = JS / 'audio.js'
    SOUNDS = Path(__file__).resolve().parent.parent / 'static' / 'sounds'

    def setUp(self):
        if shutil.which('node') is None:
            self.skipTest('node not installed')

    def run_node(self, body):
        script = f"import * as audio from '{self.MODULE.as_uri()}';{body}"
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_pools_list_exactly_the_files_on_disk(self):
        files = self.run_node("console.log(JSON.stringify(audio.FILES));")
        self.assertEqual(set(files), {'correct', 'error', 'tada', 'swipe'})
        for kind, pool in files.items():
            on_disk = sorted(p.name for p in (self.SOUNDS / pool['dir']).iterdir() if p.suffix == '.mp3')
            self.assertEqual(sorted(pool['names']), on_disk, kind)
        self.assertEqual(files['tada'], {'dir': 'celebration', 'names': ['tada.mp3']})

    def test_clip_urls_are_encoded(self):
        url = self.run_node("console.log(JSON.stringify(audio.clipUrl('correct', 'holy cow you got it right.mp3')));")
        self.assertEqual(url, '/static/sounds/correct/holy%20cow%20you%20got%20it%20right.mp3')
        urls = self.run_node("console.log(JSON.stringify(audio.poolUrls('error')));")
        self.assertEqual(len(urls), 10)
        self.assertTrue(all(' ' not in u and u.startswith('/static/sounds/error/') for u in urls))

    def test_pick_index_never_repeats_the_last_clip(self):
        picks = self.run_node(
            "const out = []; let last = -1;"
            "for (let i = 0; i < 200; i++) { last = audio.pickIndex(4, last); out.push(last); }"
            "console.log(JSON.stringify(out));"
        )
        self.assertTrue(all(0 <= p < 4 for p in picks))
        self.assertTrue(all(a != b for a, b in zip(picks, picks[1:])))
        self.assertEqual(self.run_node("console.log(audio.pickIndex(1, 0));"), 0)
        self.assertEqual(self.run_node("console.log(audio.pickIndex(3, -1, () => 0.999));"), 2)
        self.assertEqual(self.run_node("console.log(audio.pickIndex(3, 0, () => 0));"), 1)

    # Minimal states for cuesFor: screen, lives and current.{status, placed}.
    @staticmethod
    def _state(screen='play', lives=3, status='playing', placed=(None, None)):
        return {'screen': screen, 'lives': lives, 'current': {'status': status, 'placed': list(placed)}}

    def cues(self, prev, nxt):
        return self.run_node(f"console.log(JSON.stringify(audio.cuesFor({json.dumps(prev)}, {json.dumps(nxt)})));")

    def test_tada_fires_once_per_transition_into_round_end(self):
        end = self._state(screen='round-end')
        self.assertEqual(self.cues(self._state(), end), ['tada'])
        self.assertEqual(self.cues(end, {**end, 'lives': 3}), [])
        self.assertEqual(self.cues(end, self._state(screen='theme')), [])

    def test_correct_and_error_cues(self):
        self.assertEqual(self.cues(self._state(), self._state(status='correct')), ['correct'])
        self.assertEqual(self.cues(self._state(status='correct'), self._state(status='correct')), [])
        self.assertEqual(self.cues(self._state(lives=3), self._state(lives=2, status='wrong')), ['error'])
        self.assertEqual(self.cues(self._state(lives=2, status='wrong'), self._state(lives=1, status='wrong')), ['error'])
        # third miss: reveal fills every box but plays only the error clip
        revealed = self._state(lives=0, status='revealed', placed=({'tileId': 'a'}, {'tileId': 'b'}))
        self.assertEqual(self.cues(self._state(lives=1, status='wrong'), revealed), ['error'])
        # Next resets hearts: no sound
        self.assertEqual(self.cues(self._state(lives=1), self._state(lives=3)), [])

    def test_swipe_on_tile_landing_in_a_box_only(self):
        empty = self._state()
        one = self._state(placed=({'tileId': 'a'}, None))
        two = self._state(placed=({'tileId': 'a'}, {'tileId': 'b'}))
        swapped = self._state(placed=({'tileId': 'c'}, {'tileId': 'b'}))
        self.assertEqual(self.cues(empty, one), ['swipe'])
        self.assertEqual(self.cues(one, two), ['swipe'])
        self.assertEqual(self.cues(two, swapped), ['swipe'])
        self.assertEqual(self.cues(two, one), [])          # back to the tray
        self.assertEqual(self.cues(two, two), [])          # unrelated setState
        self.assertEqual(self.cues(two, empty), [])        # new word

    def test_muted_flag_round_trips_through_storage(self):
        out = self.run_node(
            "const store = new Map();"
            "const storage = { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v) };"
            "const a = audio.readMuted(storage);"
            "audio.writeMuted(storage, true); const b = audio.readMuted(storage);"
            "audio.writeMuted(storage, false); const c = audio.readMuted(storage);"
            "storage.setItem(audio.MUTED_KEY, 'garbage'); const d = audio.readMuted(storage);"
            "const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };"
            "audio.writeMuted(broken, true); const e = audio.readMuted(broken);"
            "console.log(JSON.stringify({ a, b, c, d, e, key: audio.MUTED_KEY, stored: store.get(audio.MUTED_KEY) }));"
        )
        self.assertEqual(out, {'a': False, 'b': True, 'c': False, 'd': False, 'e': False,
                               'key': 'flip.muted', 'stored': 'garbage'})

    def test_only_audio_js_constructs_audio(self):
        offenders = [
            p.name for p in self.JS.glob('*.js')
            if p.name != 'audio.js' and re.search(r'\bAudio\s*\(', p.read_text())
        ]
        self.assertEqual(offenders, [])
        self.assertIn('new Audio(', self.MODULE.read_text())
