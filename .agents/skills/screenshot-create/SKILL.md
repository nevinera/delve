---
name: screenshot-create
description: Sign in, open /create with a test world, place the builder and save a screenshot. Use to see a /create or rendering change working.
---

# Screenshot /create

The local stack has to be running on :8000 (`bin/dev`), or pass another with `--base`. A 500 on `/login` that can't load `config/routes.rb` means the checkout moved after the server started, so restart it. The local database needs at least one user. You need Python Playwright: `pipx install playwright`, then `playwright install chromium`.

```sh
~/.local/pipx/venvs/playwright/bin/python -I .agents/skills/screenshot-create/screenshot.py \
  --world tmp/worlds/northvale.zip --out shot.png --at -3200,-6272 --up 100
```

- `--at x,z` puts the builder there, in continent feet. Without it, the builder stays where the world opens.
- `--up` is feet above the ground there.
- `--eval` runs JavaScript in the page before the screenshot. `window.create` holds the builder, tools, ground and the rest, and `window.create.paused = true` stops the frames.

The script runs a new browser profile each time, so it doesn't touch a world kept in your browser. It uses software WebGL, which is slow, so raise `--settle` if the ground hasn't finished drawing. It stubs pointer lock, which headless Chromium refuses.
