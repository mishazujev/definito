import type { Entry, Lang } from "./words";

async function requestNotion<T>(body: object): Promise<T> {
  const response = await fetch("/api/notion/words", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Notion request failed (${response.status})`);
  return result;
}

export function getNotionWords(lang: Lang): Promise<{ entries: Entry[] }> {
  return requestNotion({ lang });
}
