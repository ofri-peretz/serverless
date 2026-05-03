#!/usr/bin/env sh
# Git GUIs (Cursor, Tower, etc.) often run hooks with a minimal PATH, so `npm` /
# `npx` from Homebrew or standard installs are missing. Prepend common locations
# while keeping the rest of PATH (nvm, fnm, CI, mise, etc.).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec "$@"
