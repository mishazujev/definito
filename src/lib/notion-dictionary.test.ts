import { describe, expect, it, vi } from "vitest";
import { dictionaryEntry, dictionaryFilter, loadNotionDictionary, matchesNotionLanguage, type NotionPost, type NotionProperty } from "./notion-dictionary";

const rich = (value: string): NotionProperty => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const schema = { "In Game": { type: "checkbox" }, definition: { type: "rich_text" } };
const row = {
  Name: { type: "title", title: [{ plain_text: "bridge" }] },
  definition: rich("A structure crossing a river"),
  "In Game": { type: "checkbox", checkbox: true },
};

describe("Notion dictionary rules", () => {
  it.each(["In Game", "in_game"])("filters checked %s rows", (name) => {
    expect(dictionaryFilter({ [name]: { type: "checkbox" } })).toEqual({ property: name, checkbox: { equals: true } });
    expect(dictionaryEntry({ ...row, [name]: { type: "checkbox", checkbox: false } }, { [name]: { type: "checkbox" } })).toBeUndefined();
  });
  it("does not require a checkbox when the table has none", () => {
    expect(dictionaryEntry(row, { definition: { type: "rich_text" } })?.word).toBe("bridge");
    expect(dictionaryFilter({ "In Game": { type: "select" } })).toBeUndefined();
  });
  it("filters non-empty definitions and rejects empty or whitespace-only definitions", () => {
    expect(dictionaryFilter(schema)).toEqual({ and: [
      { property: "In Game", checkbox: { equals: true } },
      { property: "definition", rich_text: { is_not_empty: true } },
    ] });
    for (const definition of [rich(""), rich("   ")]) {
      expect(dictionaryEntry({ ...row, definition }, schema)).toBeUndefined();
    }
    const { definition: _definition, ...missing } = row;
    expect(dictionaryEntry(missing, schema)).toBeUndefined();
  });
  it("extracts hint and level from properties", () => {
    expect(dictionaryEntry({ ...row, Hint: rich("The Golden Gate is one"), Level: { type: "select", select: { name: "B1" } } }, schema)).toMatchObject({ hint: "The Golden Gate is one", level: "B1" });
    expect(dictionaryEntry({ ...row, level: { type: "number", number: 2 } }, schema)?.level).toBe("2");
    expect(dictionaryEntry({ ...row, level: rich("A2") }, schema)?.level).toBe("A2");
  });
  it.each([["noun", "noun"], ["verb", "verb"], ["adj", "adj"], ["Adjective", "adj"], ["unknown", "other"]])("maps part of speech %s to %s", (name, expected) => {
    expect(dictionaryEntry({ ...row, "Part of Speech": { type: "select", select: { name } } }, schema)?.pos).toBe(expected);
    expect(dictionaryEntry({ ...row, part_of_speech: rich(name) }, schema)?.pos).toBe(expected);
  });
  it("falls back to definition when hint is missing", () => {
    expect(dictionaryEntry(row, schema)?.hint).toBe("A structure crossing a river");
  });
  it.each([
    ["English", "en"], ["EN dictionary", "en"], ["Deutsch", "de"], ["de", "de"],
    ["Français", "fr"], ["fr", "fr"], ["Español", "es"], ["es", "es"], ["Eesti", "et"], ["et", "et"],
  ] as const)("finds %s as %s", (title, lang) => expect(matchesNotionLanguage(title, lang)).toBe(true));
  it("does not confuse partial language codes with other titles", () => {
    expect(matchesNotionLanguage("French", "en")).toBe(false);
    expect(matchesNotionLanguage("Design", "de")).toBe(false);
  });
  it("preserves eligibility filters across query pagination", async () => {
    const post = vi.fn<NotionPost>()
      .mockResolvedValueOnce({ results: [], has_more: true, next_cursor: "search-next" })
      .mockResolvedValueOnce({ results: [{ id: "english-table", title: [{ plain_text: "English" }], properties: schema }], has_more: false, next_cursor: null })
      .mockResolvedValueOnce({ results: [{ id: "disabled-word", properties: { ...row, "In Game": { type: "checkbox", checkbox: false } } }], has_more: true, next_cursor: "rows-next" })
      .mockResolvedValueOnce({ results: [{ id: "enabled-word", properties: { ...row, hint: rich("Golden Gate"), level: rich("B1"), "part of speech": rich("noun") } }], has_more: false, next_cursor: null });
    const result = await loadNotionDictionary("en", post);
    expect(result.entries).toEqual([{ word: "bridge", def: "A structure crossing a river", hint: "Golden Gate", pos: "noun", level: "B1" }]);
    expect(post).toHaveBeenNthCalledWith(2, "/search", expect.objectContaining({ start_cursor: "search-next" }));
    expect(post).toHaveBeenNthCalledWith(3, "/data_sources/english-table/query", { page_size: 100, filter: dictionaryFilter(schema) });
    expect(post).toHaveBeenNthCalledWith(4, "/data_sources/english-table/query", { page_size: 100, filter: dictionaryFilter(schema), start_cursor: "rows-next" });
  });
});