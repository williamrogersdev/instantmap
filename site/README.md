# site

The instantmap.org landing pages and docs, built with Astro and Starlight.

Run `bun run build` in `packages/instantmap` first. The site copies the script-tag build into itself with `scripts/copy-cdn.ts`.

## Commands

Run these in this folder.

| Command | Does |
| --- | --- |
| `bun run dev` | Local dev server |
| `bun run build` | Build to `dist/` |

## Where things live

- Pages: `src/pages`
- Docs: `src/content/docs/docs`

Each docs page is also served as Markdown at its address plus `.md`, and all of them are summarised in `/llms.txt`.
