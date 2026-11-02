import type { Entry, Lang, Pos } from "./words";

const LANG_KEYS: Record<Lang, string[]> = {
  en: ["english", "inglise", "eng", "en"],
  fr: ["french", "français", "francais", "prantsuse", "fr"],
  de: ["german", "deutsch", "saksa", "de"],
  es: ["spanish", "español", "espanol", "hispaania", "es"],
  et: ["estonian", "eesti", "et", "est"],
};

type RichText = { plain_text?: string; text?: { content: string } }[];
export type NotionProperty = {
  type: string;
  title?: RichText;
  rich_text?: RichText;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  status?: { name: string } | null;
  number?: number | null;
  checkbox?: boolean;
  rollup?: { type: string; array?: NotionProperty[]; number?: number | null };
};
type Properties = Record<string, NotionProperty>;
type Source = { id: string; title?: RichText; properties?: Properties };
type Page = { properties?: Properties };
type Results<T> = { results: T[]; has_more: boolean; next_cursor: string | null };
export type NotionPost = (path: string, body: object) => Promise<Results<Source & Page>>;

const normalize = (value: string) => value.normalize("NFC").trim().toLowerCase().replace(/[_\s-]+/g, " ");
const richText = (value: RichText = []) => value.map((item) => item.plain_text ?? item.text?.content ?? "").join("").trim();
const propertyName = (props: Properties, name: string) => Object.keys(props).find((key) => normalize(key) === name);
const propertyText = (prop?: NotionProperty): string => {
  if (!prop) return "";
  if (prop.type === "select") return prop.select?.name.trim() ?? "";
  if (prop.type === "multi_select") return prop.multi_select?.map((item) => item.name.trim()).join(", ") ?? "";
  if (prop.type === "status") return prop.status?.name.trim() ?? "";
  if (prop.type === "number") return prop.number == null ? "" : String(prop.number);
  if (prop.type === "rollup") {
    if (prop.rollup?.type === "array") return (prop.rollup.array ?? []).map(propertyText).filter(Boolean).join(", ");
    if (prop.rollup?.type === "number") return prop.rollup.number == null ? "" : String(prop.rollup.number);
  }
  return richText(prop.title ?? prop.rich_text);
};

const propertyTextFor = (props: Properties, names: string[]) => {
  for (const name of names) {
    const key = propertyName(props, name);
    const value = key ? propertyText(props[key]) : "";
    if (value) return value;
  }
  return "";
};

export function isNotionLanguage(value: unknown): value is Lang {
  return typeof value === "string" && Object.hasOwn(LANG_KEYS, value);
}

export function matchesNotionLanguage(title: string, lang: Lang): boolean {
  return normalize(title).split(/[^\p{L}]+/u).some((word) => LANG_KEYS[lang].includes(word));
}

export function dictionaryFilter(props: Properties, lang?: Lang) {
  const filters: object[] = [];
  const inGame = propertyName(props, "in game");
  if (inGame && props[inGame]?.type === "checkbox") {
    filters.push({ property: inGame, checkbox: { equals: true } });
  }
  const definition = propertyName(props, "definition") ?? (lang === "fr" ? propertyName(props, "fr definition") : undefined);
  if (definition && props[definition]?.type === "rich_text") {
    filters.push({ property: definition, rich_text: { is_not_empty: true } });
  }
  if (filters.length === 0) return undefined;
  return filters.length === 1 ? filters[0] : { and: filters };
}

function partOfSpeech(value: string): Pos {
  const key = normalize(value).replace(/\.$/, "");
  if (["noun", "n"].includes(key)) return "noun";
  if (["verb", "v"].includes(key)) return "verb";
  if (["adj", "adjective", "a"].includes(key)) return "adj";
  return "other";
}

export function dictionaryEntry(props: Properties, schema: Properties, lang?: Lang): Entry | undefined {
  const inGame = propertyName(schema, "in game");
  if (inGame && schema[inGame]?.type === "checkbox" && props[inGame]?.checkbox !== true) return;
  const get = (name: string) => propertyText(props[propertyName(props, name) ?? ""]);
  const word = propertyText(Object.values(props).find((prop) => prop.type === "title"));
  const def = propertyTextFor(props, lang === "fr" ? ["definition", "fr definition"] : ["definition"]);
  if (!word || !def) return;
  const level = get("level");
  const hint = propertyTextFor(props, ["hint", "hint (for game)"]);
  return { word, def, hint: hint || def, pos: partOfSpeech(get("part of speech")), ...(level ? { level } : {}) };
}

export async function loadNotionDictionary(lang: Lang, post: NotionPost): Promise<{ entries: Entry[]; error?: string }> {
  const sources: Source[] = [];
  let cursor: string | undefined;
  do {
    const response = await post("/search", {
      filter: { property: "object", value: "data_source" }, page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    sources.push(...response.results.filter((source) => propertyName(source.properties ?? {}, "definition")));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
  const source = sources.find((candidate) => matchesNotionLanguage(richText(candidate.title), lang));
  if (!source) return { entries: [], error: "No Notion table found for this language" };
  const schema = source.properties ?? {};
  const filter = dictionaryFilter(schema, lang);
  const entries: Entry[] = [];
  cursor = undefined;
  do {
    const response = await post(`/data_sources/${source.id}/query`, {
      page_size: 100, ...(filter ? { filter } : {}), ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of response.results) {
      const entry = dictionaryEntry(page.properties ?? {}, schema, lang);
      if (entry) entries.push(entry);
    }
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor && entries.length < 5000);
  return { entries };
}
