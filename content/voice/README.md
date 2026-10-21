# Voice content

The robot's voice lines, read by `tools/voices.py` to make the clips in `static/voice/`.

- `words.json`: the 130 target words by theme, in the order of the approved word list.
- `word-lines.json`: per word, the gag line after a correct answer and the broken-Hebrew guess (copy of `claude/flip-word-lines.json` in the claude.ai project).
- `robot-lines.json`: the shared robot lines by moment, and the letter names (copy of `claude/flip-robot-lines.json`).

Lines are approved on the Robot Line Review page; only `status: approved` lines are voiced. These files are synced from the project by Claude. Don't edit them by hand or in an agent run.

Make clips (on your own computer, with `ELEVENLABS_API_KEY` in `.env`):

    venv/bin/python tools/voices.py check
    venv/bin/python tools/voices.py plan --set words,letters
    venv/bin/python tools/voices.py make --set words,letters
