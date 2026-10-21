"""Make the robot's voice clips with the ElevenLabs API.

What it voices, one "set" at a time:
  words    the 130 target words, clean ("Cat!")         static/voice/words/<theme>/<word>.mp3
  letters  the 26 letter names ("Zee!")                 static/voice/letters/<letter>.mp3
  gags     approved gag lines (after a correct answer)  static/voice/gags/<theme>/<word>.mp3
           and a word's second gag, if it has one       static/voice/gags/<theme>/<word>-2.mp3
  hebrew   approved broken-Hebrew guesses               static/voice/hebrew/<theme>/<word>.mp3
  robot    approved shared robot lines                  static/voice/robot/<line id>.mp3

Only approved lines are voiced. Approvals are made on the Robot Line Review
page and synced into content/voice/*.json; this script never edits those
files. Clean words and letter names need no approval.

Every clip made is recorded in static/voice/manifest.json with the exact
text it was made from. A rerun skips a clip whose file exists and whose text
has not changed, so credits go only to new or changed lines.

usage (from the repo root, with the API key in .env as ELEVENLABS_API_KEY):
  python3 tools/voices.py check                      free: the key, voice, model and credits left
  python3 tools/voices.py plan --set words,letters   free: what would be made and about what it costs
  python3 tools/voices.py make --set words,letters   makes the clips; asks before spending
options for plan and make:
  --only cat,letter-z,greet-01   only these clip ids (see `plan` for the ids)
  --force                        remake clips even if they exist and the text is the same
  --yes                          make without asking (unattended runs)

Offline tool, not part of the app: the server never runs it. Standard
library only, Python 3.8+.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content', 'voice')
OUT = os.path.join(ROOT, 'static', 'voice')
API = 'https://api.elevenlabs.io/v1'

# The robot's voice, locked 2026-10-21: "FLIP ROBIT -FINAL" in ElevenLabs
# (saved as "flip robot character"), on Eleven v4. The voice's own saved
# settings are used; the script sends none of its own.
VOICE_ID = 'eLkzmL7sIxy7PLUgCfeT'
MODEL_ID = 'eleven_v4'
OUTPUT_FORMAT = 'mp3_44100_128'

SETS = ('words', 'letters', 'gags', 'hebrew', 'robot')
PAUSE = 0.3                # seconds between requests
RETRY_WAITS = (2, 5, 10, 20, 40)


# ---- what to make (pure, no network) -------------------------------------

def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def clean_text(word):
    """A target word or letter name as its own clip: capitalised, with '!'
    (chosen by ear on 2026-10-22 over a full stop)."""
    return word[:1].upper() + word[1:] + '!'


def plan_items(sets, content_dir=None):
    """Every clip the given sets ask for, in a stable order, plus how many
    lines each set left out because they are not approved yet.
    A clip is a dict: id, set, text, file (relative to static/voice)."""
    content_dir = content_dir or CONTENT
    words = load_json(os.path.join(content_dir, 'words.json'))['themes']
    word_lines = load_json(os.path.join(content_dir, 'word-lines.json'))['words']
    robot = load_json(os.path.join(content_dir, 'robot-lines.json'))
    items, waiting = [], {}

    def add(set_name, id_, text, file_):
        items.append({'id': id_, 'set': set_name, 'text': text, 'file': file_})

    if 'words' in sets:
        for theme, ws in words.items():
            for w in ws:
                add('words', w, clean_text(w), 'words/{}/{}.mp3'.format(theme, w))
    if 'letters' in sets:
        for letter, name in sorted(robot['letters'].items()):
            add('letters', 'letter-' + letter, clean_text(name), 'letters/{}.mp3'.format(letter))
    for theme, ws in words.items():
        for w in ws:
            d = word_lines.get(w)
            if not d:
                continue
            ok = d.get('status') == 'approved'
            if 'gags' in sets:
                for key, suffix in (('gag', ''), ('gag2', '-2')):
                    if key not in d:
                        continue
                    if ok:
                        add('gags', '{}-{}'.format(w, key), d[key],
                            'gags/{}/{}{}.mp3'.format(theme, w, suffix))
                    else:
                        waiting['gags'] = waiting.get('gags', 0) + 1
            if 'hebrew' in sets and 'he' in d:
                if d.get('he_status', d.get('status')) == 'approved':
                    add('hebrew', w + '-he', d['he'], 'hebrew/{}/{}.mp3'.format(theme, w))
                else:
                    waiting['hebrew'] = waiting.get('hebrew', 0) + 1
    if 'robot' in sets:
        for pool in robot['pools'].values():
            for line in pool['lines']:
                if line.get('status') == 'approved':
                    add('robot', line['id'], line['text'], 'robot/{}.mp3'.format(line['id']))
                else:
                    waiting['robot'] = waiting.get('robot', 0) + 1
    return items, waiting


def pick(items, only):
    """Keep the clips whose id is in `only` (a set); every clip when empty."""
    return [i for i in items if not only or i['id'] in only]


def needs_making(item, manifest, out_dir=None, force=False):
    """True unless the clip's file exists and was made from the same text."""
    out_dir = out_dir or OUT
    if force:
        return True
    made = manifest.get('clips', {}).get(item['file'])
    return not (made and made.get('text') == item['text']
                and os.path.exists(os.path.join(out_dir, item['file'])))


def estimate_credits(items):
    """About one credit per character on Eleven v4 (the 2026-10-21 test:
    'Cat.' cost 4, 'Toothbrush.' 11); audio tags count as characters."""
    return sum(len(i['text']) for i in items)


# ---- manifest -------------------------------------------------------------

def load_manifest(out_dir=None):
    out_dir = out_dir or OUT
    path = os.path.join(out_dir, 'manifest.json')
    if os.path.exists(path):
        return load_json(path)
    return {'voice_id': VOICE_ID, 'model_id': MODEL_ID, 'output_format': OUTPUT_FORMAT, 'clips': {}}


def save_manifest(manifest, out_dir=None):
    out_dir = out_dir or OUT
    os.makedirs(out_dir, exist_ok=True)
    manifest['clips'] = dict(sorted(manifest['clips'].items()))
    path = os.path.join(out_dir, 'manifest.json')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write('\n')
    os.replace(tmp, path)


# ---- ElevenLabs -----------------------------------------------------------

def api_key():
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    env = os.path.join(ROOT, '.env')
    if not key and os.path.exists(env):
        with open(env, encoding='utf-8') as f:
            for line in f:
                name, _, value = line.strip().partition('=')
                if name.strip() == 'ELEVENLABS_API_KEY':
                    key = value.strip().strip('"').strip("'")
    if not key:
        sys.exit('No API key. Add a line ELEVENLABS_API_KEY=... to .env at the repo root '
                 '(ElevenLabs: Developers > API keys).')
    return key


class ApiError(Exception):
    def __init__(self, status, body):
        Exception.__init__(self, 'HTTP {}: {}'.format(status, body[:300]))
        self.status = status


def request(key, method, path, body=None, query=''):
    url = API + path + (('?' + query) if query else '')
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('xi-api-key', key)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.read(), dict(res.headers)
    except urllib.error.HTTPError as e:
        err = ApiError(e.code, e.read().decode('utf-8', 'replace'))
        err.retry_after = e.headers.get('Retry-After')
        raise err


def speak(key, text):
    """One clip's MP3 bytes, retrying on rate limits and server errors."""
    body = {'text': text, 'model_id': MODEL_ID}
    for wait in RETRY_WAITS + (None,):
        try:
            audio, _ = request(key, 'POST', '/text-to-speech/' + VOICE_ID, body,
                               'output_format=' + OUTPUT_FORMAT)
            return audio
        except ApiError as e:
            if wait is None or not (e.status == 429 or e.status >= 500):
                raise
            delay = wait
            if getattr(e, 'retry_after', None):
                try:
                    delay = max(delay, int(e.retry_after))
                except ValueError:
                    pass
            print('  busy (HTTP {}), trying again in {}s'.format(e.status, delay))
            time.sleep(delay)
        except urllib.error.URLError as e:
            if wait is None:
                raise
            print('  network error ({}), trying again in {}s'.format(e.reason, wait))
            time.sleep(wait)


# ---- commands -------------------------------------------------------------

def cmd_check(args):
    key = api_key()
    ok = True
    try:
        raw, _ = request(key, 'GET', '/voices/' + VOICE_ID)
        print('Voice: {} ({})'.format(json.loads(raw).get('name'), VOICE_ID))
    except ApiError as e:
        ok = False
        print('Voice {}: not reachable with this key ({}).'.format(VOICE_ID, e))
    try:
        raw, _ = request(key, 'GET', '/models')
        ids = [m.get('model_id') for m in json.loads(raw)]
        print('Model {}: {}'.format(MODEL_ID, 'available' if MODEL_ID in ids else 'NOT in this account\'s model list'))
        ok = ok and MODEL_ID in ids
    except ApiError as e:
        print('Models: could not list them ({}).'.format(e))
    try:
        raw, _ = request(key, 'GET', '/user/subscription')
        s = json.loads(raw)
        left = s.get('character_limit', 0) - s.get('character_count', 0)
        print('Credits: {} left of {} this period (plan: {}).'.format(left, s.get('character_limit'), s.get('tier')))
    except ApiError as e:
        print('Credits: this key cannot read the subscription ({}). That is fine for making clips.'.format(e.status))
    print('Ready.' if ok else 'Not ready: fix the lines above first.')
    return 0 if ok else 1


def chosen(args):
    sets = [s.strip() for s in (args.set or '').split(',') if s.strip()]
    bad = [s for s in sets if s not in SETS]
    if not sets or bad:
        sys.exit('Pick sets with --set, from: {}'.format(', '.join(SETS)))
    only = set(s.strip() for s in (args.only or '').split(',') if s.strip())
    items, waiting = plan_items(sets)
    items = pick(items, only)
    if only:
        missing = only - set(i['id'] for i in items)
        if missing:
            print('Not found (or not approved): ' + ', '.join(sorted(missing)))
    manifest = load_manifest()
    todo = [i for i in items if needs_making(i, manifest, force=args.force)]
    return items, todo, waiting, manifest


def report(items, todo, waiting):
    for s in SETS:
        n = sum(1 for i in items if i['set'] == s)
        if n or s in waiting:
            t = sum(1 for i in todo if i['set'] == s)
            line = '  {:8} {:3} clips, {:3} to make'.format(s, n, t)
            if waiting.get(s):
                line += ', {} more waiting for approval'.format(waiting[s])
            print(line)
    print('To make: {} clips, about {} credits.'.format(len(todo), estimate_credits(todo)))


def cmd_plan(args):
    items, todo, waiting, _ = chosen(args)
    report(items, todo, waiting)
    for i in todo:
        print('  {:24} {:40} {}'.format(i['id'], i['file'], i['text']))
    return 0


def cmd_make(args):
    items, todo, waiting, manifest = chosen(args)
    report(items, todo, waiting)
    if not todo:
        print('Nothing to make.')
        return 0
    if not args.yes:
        if not sys.stdin.isatty():
            sys.exit('Add --yes to make clips without being asked.')
        if input('Make them? [y/N] ').strip().lower() not in ('y', 'yes'):
            print('Nothing made.')
            return 0
    key = api_key()
    failed = []
    for n, item in enumerate(todo, 1):
        path = os.path.join(OUT, item['file'])
        print('{}/{} {}'.format(n, len(todo), item['file']))
        try:
            audio = speak(key, item['text'])
        except ApiError as e:
            if e.status in (401, 403):
                print('The key was refused ({}). Stopping; nothing more is spent.'.format(e))
                failed.extend(todo[n - 1:])
                break
            print('  failed: {}'.format(e))
            failed.append(item)
            continue
        except urllib.error.URLError as e:
            print('  failed: network ({})'.format(e.reason))
            failed.append(item)
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path + '.tmp', 'wb') as f:
            f.write(audio)
        os.replace(path + '.tmp', path)
        manifest['clips'][item['file']] = {'id': item['id'], 'text': item['text'],
                                           'made': date.today().isoformat()}
        save_manifest(manifest)   # after every clip, so a stopped run keeps its progress
        time.sleep(PAUSE)
    print('Made {} of {} clips.'.format(len(todo) - len(failed), len(todo)))
    if failed:
        print('Not made (run the same command again to retry only these): '
              + ', '.join(i['id'] for i in failed))
        return 1
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description='Make the robot voice clips with ElevenLabs.')
    sub = p.add_subparsers(dest='cmd')
    sub.add_parser('check', help='free: check the key, voice, model and credits')
    for name, help_ in (('plan', 'free: list what would be made'), ('make', 'make the clips')):
        s = sub.add_parser(name, help=help_)
        s.add_argument('--set', help='comma-separated: ' + ', '.join(SETS))
        s.add_argument('--only', help='comma-separated clip ids')
        s.add_argument('--force', action='store_true', help='remake clips that already exist')
        if name == 'make':
            s.add_argument('--yes', action='store_true', help='do not ask before spending credits')
    args = p.parse_args(argv)
    if args.cmd == 'check':
        return cmd_check(args)
    if args.cmd == 'plan':
        return cmd_plan(args)
    if args.cmd == 'make':
        return cmd_make(args)
    p.print_help()
    return 2


if __name__ == '__main__':
    sys.exit(main())
