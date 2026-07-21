<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git workflow

Once a set of changes for a task is complete and verified (type-checks, builds, and — for UI changes — checked in the browser), commit and push to the current branch on `origin` without asking for confirmation first. This is a standing authorization from the repo owner.

Still apply normal git judgment:
- Write a real commit message describing the change, not a generic one.
- Never commit `.env.local` or any other file containing real secrets — check `git status` before staging.
- Don't push obviously broken or half-finished work; commit at logical completion points, not mid-edit.
- Never force-push, never skip hooks, never rewrite history on `main`.
- If a change is destructive, irreversible, or affects something other than this repo's own source (e.g. deleting data, modifying external services), that still requires asking first — this standing authorization only covers ordinary commit-and-push of code changes made in this repo.
