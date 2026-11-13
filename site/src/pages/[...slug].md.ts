import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";

export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection("docs");
  return entries.map((entry) => ({ params: { slug: entry.id.replace(/\/index$/, "") }, props: { entry } }));
};

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: Awaited<ReturnType<typeof getCollection<"docs">>>[number] };
  const header = `# ${entry.data.title}\n\n${entry.data.description ? `> ${entry.data.description}\n\n` : ""}`;
  const body = (entry.body ?? "")
    .replace(/^import .*$/gm, "")
    .replace(/^\{\/\*[\s\S]*?\*\/\}$/gm, "")
    .replace(/^<\/?Tabs[^>]*>$/gm, "")
    .replace(/^<TabItem label="([^"]+)">$/gm, "**$1**")
    .replace(/^<\/TabItem>$/gm, "")
    .replace(/^<instant-map[^>]*><\/instant-map>$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return new Response(`${header}${body}\n\nSource: https://instantmap.org/${entry.id}\nFull docs for agents: https://instantmap.org/llms-full.txt\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
