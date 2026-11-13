---
title: Build it with an AI agent
description: Prompts, llms.txt, per-page Markdown and an agent skill so Claude Code, Cursor, Codex or Copilot can add Instant Map correctly the first time.
sidebar:
  order: 3
---

Instant Map is written so that a coding agent can integrate it without guessing. Everything an agent needs is plain text at a stable URL.

| What | URL | Give it to an agent when |
| --- | --- | --- |
| Index of every page | [`/llms.txt`](/llms.txt) | The agent should find its own way. |
| All docs in one file | [`/llms-full.txt`](/llms-full.txt) | You want one paste with everything in it. |
| Shorter version | [`/llms-small.txt`](/llms-small.txt) | The agent's context is tight. |
| Any page as Markdown | add `.md` to the URL, e.g. [`/docs/frameworks/nextjs.md`](/docs/frameworks/nextjs.md) | You know which framework guide applies. |
| Agent skill | [`/SKILL.md`](/SKILL.md) | Your agent supports skills (Claude Code, Codex and others). |

Every docs page has **Copy page as Markdown** and **Copy prompt for your AI agent** buttons under its title.

## Prompts that work

Paste one of these into your agent. Replace the part in brackets.

**Add a map to an existing app**

```text
Add an Instant Map to [the listing detail page]. Read https://instantmap.org/llms.txt first, then the guide for this project's framework, and follow it exactly. Requirements:
- Show [each listing] as a marker with its price as the label, its photo, title and a link.
- Render the first image on the server so the map shows before JavaScript loads.
- Give the map a fixed height so the page does not jump.
When done, run the app, open the page, and confirm the map image loads and that clicking a marker opens its card.
```

**Map with a synced list (search results layout)**

```text
Build a search-results layout with a list on the left and an Instant Map on the right, following https://instantmap.org/docs/guides/list-and-map.md. Hovering a list item must highlight its marker (map.highlight), clicking a marker must scroll the list to that item, and the list must show only what is in view after the map moves (moveend + map.bounds). Use the framework guide for this project from https://instantmap.org/llms.txt.
```

**Match my brand**

```text
Style our Instant Map to match the app. Read https://instantmap.org/docs/reference/themes.md. Start from the theme closest to our UI (daylight, midnight, paper or mono) and override only the tokens that need to change: accent, marker, cluster and selected from our brand colours. Apply the same theme and colors to staticUrl() so the first image matches.
```

## Install the skill

Agents that support skills load [`SKILL.md`](/SKILL.md) on their own when a task mentions maps. In Claude Code:

```bash
mkdir -p .claude/skills/instantmap && curl -fsSL https://instantmap.org/SKILL.md -o .claude/skills/instantmap/SKILL.md
```

For other agents, save the file wherever they read instructions, or add one line to your `AGENTS.md`:

```md
- Maps: use Instant Map. Before writing map code, read https://instantmap.org/llms.txt and the guide for our framework.
```

## Rules the docs give agents

These are the mistakes agents make most often with maps. Every guide repeats the ones that apply to it.

1. **Give the element a height.** `<instant-map>` fills its box. A box with no height shows nothing.
2. **Longitude comes first** everywhere: `center="lng,lat"`, `[lng, lat]`, `{ lng, lat }`.
3. **Every marker needs a unique `id`.** Selection, highlight and popups use it.
4. **Render the poster on the server** in SSR frameworks with `staticUrl()` from `instantmap/server`. Don't import `instantmap` (the element) into server-only code.
5. **Don't wrap it in `dynamic(..., { ssr: false })`** or `client:only`. That throws away the instant first paint, which is the whole point.
6. **Use `instantmap/react` in React.** In other frameworks, use the element directly.
7. **Keep marker labels short.** Prices or counts, ten characters at most.
