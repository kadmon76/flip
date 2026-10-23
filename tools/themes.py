"""Write the game's theme files from the word list.

Reads content/word-list.json and writes:
  static/data/<theme>.json     one entry per word, by stage, then in the
                               word list's (teaching) order
  static/config/themes.json    the themes that have at least one word

A word goes in only when its files exist (claude/flip-word-data-format.md
"Rules for the batch"):
  voice    static/voice/words/<theme>/<word>.mp3       (tools/voices.py)
  picture  static/images/words/<theme>/<word>.webp, with -subject and
           -plate for its motion
A word with a voice but no new picture keeps the picture it has in the
current theme file, still, with no motion (duck, until its picture is made);
a word with neither waits.

usage (from the repo root):
  python3 tools/themes.py check    free: what would change, writes nothing
  python3 tools/themes.py write    writes the files

Offline tool, not part of the app: the server never runs it. Standard
library only, Python 3.8+.
"""
import argparse
import json
import os
import sys
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_LIST = os.path.join(ROOT, 'content', 'word-list.json')
STAGES = [1, 2, 3, 4, 5, 'long']
DIFFICULTY = {1: 'easy', 2: 'easy', 3: 'medium', 4: 'medium', 5: 'hard', 'long': 'hard'}


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f, object_pairs_hook=OrderedDict)


def break_at(word, mark):
    """'heli|copter' -> 4, the letters on the first row."""
    first, _, rest = mark.partition('|')
    if not rest or first + rest != word:
        raise ValueError('bad break {!r} for {!r}'.format(mark, word))
    return len(first)


def entry_for(theme, item, root, current):
    """The word's entry, or (None, reason) when it has to wait."""
    word = item['word']
    url = '/static/{}'.format
    audio = 'voice/words/{}/{}.mp3'.format(theme, word)
    image = 'images/words/{}/{}.webp'.format(theme, word)
    subject = 'images/words/{}/{}-subject.webp'.format(theme, word)
    plate = 'images/words/{}/{}-plate.webp'.format(theme, word)

    def has(path):
        return os.path.exists(os.path.join(root, 'static', path))

    if not has(audio):
        return None, 'no voice'
    entry = OrderedDict()
    entry['stage'] = item['stage']
    entry['difficulty'] = DIFFICULTY[item['stage']]
    if 'break' in item:
        entry['break'] = break_at(word, item['break'])
    if has(image) and has(subject) and has(plate):
        entry['image'] = url(image)
    else:
        old = current.get(word, {}).get('image')
        if not (old and has(old[len('/static/'):])):
            return None, 'no picture'
        entry['image'] = old
    entry['audio'] = url(audio)
    entry['hebrew'] = item['hebrew']
    if entry['image'] == url(image):
        entry['motion'] = OrderedDict([
            ('subject', url(subject)), ('plate', url(plate)),
            ('idle', item['idle']), ('pivot', item['pivot']), ('win', item['win'])])
    return entry, None


def build(root=None):
    """(files, waiting): files maps a path under root to its new content
    (a dict), waiting lists (theme, word, reason) for words held back."""
    root = root or ROOT
    themes = load_json(os.path.join(root, 'content', 'word-list.json'))['themes']
    index_path = os.path.join(root, 'static', 'config', 'themes.json')
    index = load_json(index_path) if os.path.exists(index_path) else OrderedDict()
    files, waiting = OrderedDict(), []
    for theme, info in themes.items():
        data_path = os.path.join(root, 'static', 'data', theme + '.json')
        current = load_json(data_path) if os.path.exists(data_path) else {}
        data = OrderedDict()
        for stage in STAGES:
            for item in info['words']:
                if item['stage'] != stage:
                    continue
                entry, why = entry_for(theme, item, root, current)
                if entry is None:
                    waiting.append((theme, item['word'], why))
                else:
                    data[item['word']] = entry
        if data:
            files[os.path.join('static', 'data', theme + '.json')] = data
            if theme not in index:
                index[theme] = '/static/data/{}.json'.format(theme)
    files[os.path.join('static', 'config', 'themes.json')] = index
    return files, waiting


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=4) + '\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description='Write the theme files from the word list.')
    parser.add_argument('command', choices=['check', 'write'])
    args = parser.parse_args(argv)
    files, waiting = build()
    changed = 0
    for rel, obj in files.items():
        path = os.path.join(ROOT, rel)
        text = dump(obj)
        old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
        words = len(obj) if rel.startswith(os.path.join('static', 'data')) else None
        label = '{} words'.format(words) if words is not None else ', '.join(obj)
        if old == text:
            print('  same     {}  ({})'.format(rel, label))
            continue
        changed += 1
        print('  {}  {}  ({})'.format('new    ' if old is None else 'changed', rel, label))
        if args.command == 'write':
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text)
    for theme, word, why in waiting:
        print('  waiting  {}/{}: {}'.format(theme, word, why))
    if args.command == 'check':
        print('{} file(s) would change. Run `write` to write them.'.format(changed))
    else:
        print('{} file(s) written.'.format(changed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
