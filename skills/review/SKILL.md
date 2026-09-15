---
description: Open a local pull-request-style page to review the current git diff. Use when the developer wants to read a diff as a PR, comment on specific lines, or hand a review back to Claude. Triggers: "/localpr:review", "review this diff", "open the review page", "let me comment on these changes".
argument-hint: "[repo path | nothing = current repo] [--base <ref>]"
disable-model-invocation: true
---

Launch the localpr review page on the target repository — `$ARGUMENTS` if given, otherwise the
current repository — then hand control straight back.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/localpr.py" <repo> --serve
```

The process holds the terminal: run it **in the background**, wait for the URL to be printed, then
give the developer two lines:

1. the **clickable URL exactly as printed** — it carries the token; without it the page answers 403;
2. a ready-to-paste open command: `! xdg-open "<url>"` (or `open` on macOS).

Do not open the browser for them.

State these two points, one line each, because neither is guessable:

- the page **does not refresh** — the diff is frozen; the `↻` button, top right, re-collects it;
- **Finish review** saves the comments, writes a `TODO.md` and **shuts the server down**. Without
  that click, the server stops on its own 5 minutes after the tab is closed, and in any case after
  an hour.

Then do **nothing**: do not wait, do not poll, do not relaunch the page. This is a human review and
it takes as long as it takes. When the developer comes back ("I'm done", "finished the review", or
a pasted JSON blob), read the `TODO.md` in the output directory: it carries the comments grouped by
file **and** the protocol for handling them. The directory is announced at launch, and `--list`
finds it again.

Options worth knowing, to be passed only when the request calls for them:

| | |
|---|---|
| `--base develop` | review a whole branch instead of the working tree alone |
| `--out <dir>` | defaults to `~/.claude/reviews/<project>/<timestamp>/` |
| `--findings f.json` | show findings from an automated review as a second reviewer |
| `--check` | verify the parser against `git diff --numstat`, serving nothing |
| `--list` / `--stop-all` | see or stop review servers still alive |

Before running against an unfamiliar repository, `--check` costs two seconds and avoids reviewing a
wrong diff.

localpr runs **no** git write command, and never writes inside the repository: every artefact goes to
its output directory.
