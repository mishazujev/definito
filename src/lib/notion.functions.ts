import { createServerFn } from "@tanstack/react-start";
import type { Entry, Lang } from "./words";
import { isNotionLanguage, loadNotionDictionary, type NotionPost } from "./notion-dictionary";

const GATEWAY = "https://connector-gateway.lovable.dev/notion/v1";

export const getNotionWords = createServerFn({ method: "POST" })
  .inputValidator((d: { lang: Lang }) => {
    if (!d || !isNotionLanguage(d.lang)) throw new Error("bad lang");
    return d;
  })
  .handler(async ({ data }): Promise<{ entries: Entry[]; error?: string }> => {
    const lk = process.env['LOVABLE_API_KEY'];
    const nk = process.env['NOTION_API_KEY'];
    if (!lk || !nk) return { entries: [], error: "Notion is not connected" };
    const headers = {
      Authorization: `Bearer ${lk}`,
      "X-Connection-Api-Key": nk,
      "Notion-Version": "2025-09-03",
      "Content-Type": "application/json",
    };
    const post: NotionPost = async (path, body) => {
      const r = await fetch(`${GATEWAY}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const t = await r.text();
        console.error(`Notion ${path} [${r.status}]: ${t}`);
        throw new Error(`Notion error ${r.status}: ${t}`);
      }
      return r.json();
    };
    try {
      return await loadNotionDictionary(data.lang, post);
    } catch (e) {
      return { entries: [], error: e instanceof Error ? e.message : "Notion unavailable" };
    }
  });
