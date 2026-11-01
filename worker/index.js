import assets from "./assets.js";

const DATA_SOURCES = Object.freeze({
  en: "2059e758-9a23-80c2-91d4-000b9b9fe0ba",
  fr: "2799e758-9a23-80a4-a889-000bc7eb3772",
  de: "2789e758-9a23-80b2-ab65-000b65d102a4",
  es: "2699e758-9a23-8080-a35f-000b91c6aa30",
  et: "40a9e758-9a23-80aa-ac41-000b22f0c0a5",
});

const schemaCache = new Map();
const responseCache = new Map();
const NOTION_VERSION = "2026-03-11";
const CACHE_MS = 30_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function normalized(value) {
  return value.normalize("NFC").trim().toLowerCase().replace(/[_\s-]+/g, " ");
}

function propertyKey(properties, name) {
  const target = normalized(name);
  return Object.keys(properties).find((key) => normalized(key) === target);
}

function richText(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => item.plain_text ?? item.text?.content ?? "").join("").trim();
}

function propertyText(property) {
  if (!property) return "";
  if (property.type === "title") return richText(property.title);
  if (property.type === "rich_text") return richText(property.rich_text);
  if (property.type === "select" || property.type === "status") return property[property.type]?.name ?? "";
  if (property.type === "multi_select") return (property.multi_select ?? []).map((item) => item.name).join(", ");
  if (property.type === "number") return property.number == null ? "" : String(property.number);
  return "";
}

function propertyTags(property) {
  if (!property) return [];
  if (property.type === "select" || property.type === "status") {
    const selected = property[property.type]?.name;
    return selected ? [selected] : [];
  }
  if (property.type === "multi_select") return (property.multi_select ?? []).map((item) => item.name);
  return [];
}

function partOfSpeech(value) {
  const key = normalized(value).replace(/\.$/, "");
  if (["noun", "n", "c"].includes(key)) return "noun";
  if (["verb", "v"].includes(key)) return "verb";
  if (["adj", "adjective", "a", "j"].includes(key)) return "adj";
  return "other";
}

function categoryOptions(schema, name) {
  const key = propertyKey(schema, name);
  if (!key) return [];
  const property = schema[key];
  if (property.type !== "select" && property.type !== "multi_select") return [];
  return (property[property.type]?.options ?? []).map((option) => option.name).filter(Boolean);
}

function categoryFilter(schema, name, selected) {
  if (!selected) return undefined;
  const key = propertyKey(schema, name);
  if (!key) throw new Error(`Add a ${name} property to this dictionary before using that filter.`);
  const property = schema[key];
  const options = categoryOptions(schema, name);
  if (!options.includes(selected)) throw new Error(`Unknown ${name} filter. Refresh the game and choose an available value.`);
  if (property.type === "select") return { property: key, select: { equals: selected } };
  if (property.type === "multi_select") return { property: key, multi_select: { contains: selected } };
  throw new Error(`${name} must be a Select or Multi-select property in Notion.`);
}

async function apiRequest(apiKey, path, method = "GET", body) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    console.error(`Notion API request failed: ${response.status}`);
    if (response.status === 404) {
      throw new Error("Notion cannot find or access this dictionary. Verify the data source ID and share the dictionary with the integration whose key is stored in this Site (Stories Feed). If it is already shared, confirm the Site key belongs to that same integration.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Notion rejected the Site key or its access. Confirm NOTION_API_KEY is the internal secret for Stories Feed and that it has read-content access.");
    }
    throw new Error(`Notion request failed (${response.status}).`);
  }
  return response.json();
}

async function getSchema(apiKey, dataSourceId) {
  const cached = schemaCache.get(dataSourceId);
  if (cached && cached.expiresAt > Date.now()) return cached.schema;
  const response = await apiRequest(apiKey, `/data_sources/${dataSourceId}`);
  const schema = response.properties ?? {};
  schemaCache.set(dataSourceId, { schema, expiresAt: Date.now() + 300_000 });
  return schema;
}

function toEntry(page, schema) {
  const properties = page.properties ?? {};
  const titleKey = Object.keys(properties).find((key) => properties[key]?.type === "title");
  const name = propertyText(properties[titleKey]);
  const definitionKey = propertyKey(schema, "definition");
  const definition = propertyText(properties[definitionKey]);
  if (!name || !definition) return undefined;

  const hintKey = propertyKey(schema, "hint");
  const posKey = propertyKey(schema, "part of speech") ?? propertyKey(schema, "pos");
  const levelKey = propertyKey(schema, "level");
  const level = propertyText(properties[levelKey]);
  const tradeKey = propertyKey(schema, "trade");
  const occasionKey = propertyKey(schema, "occasion");

  return {
    word: name,
    def: definition,
    hint: propertyText(properties[hintKey]) || definition,
    pos: partOfSpeech(propertyText(properties[posKey])),
    ...(level ? { level } : {}),
    ...(tradeKey ? { trade: propertyTags(properties[tradeKey]) } : {}),
    ...(occasionKey ? { occasion: propertyTags(properties[occasionKey]) } : {}),
  };
}

async function handleNotion(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const secret = env?.SECRET_NOTION_API_KEY;
  const apiKey = secret && typeof secret.get === "function" ? await secret.get() : undefined;
  if (!apiKey) return json({ error: "Notion is not connected on this Site yet." }, 503);

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 8_192) return json({ error: "Request is too large." }, 413);
    input = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const { lang, optionsOnly = false, trade = "", occasion = "" } = input ?? {};
  const dataSourceId = DATA_SOURCES[lang];
  if (!dataSourceId) return json({ error: "Unsupported language." }, 400);

  const cacheKey = JSON.stringify({ lang, optionsOnly, trade, occasion });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return json(cached.body);

  try {
    const schema = await getSchema(apiKey, dataSourceId);
    const filters = {
      trade: categoryOptions(schema, "trade"),
      occasion: categoryOptions(schema, "occasion"),
    };
    if (optionsOnly) {
      const result = { filters };
      responseCache.set(cacheKey, { body: result, expiresAt: Date.now() + CACHE_MS });
      return json(result);
    }

    const conditions = [];
    const inGameKey = propertyKey(schema, "in game");
    const definitionKey = propertyKey(schema, "definition");
    if (inGameKey && schema[inGameKey]?.type === "checkbox") {
      conditions.push({ property: inGameKey, checkbox: { equals: true } });
    }
    if (definitionKey && schema[definitionKey]?.type === "rich_text") {
      conditions.push({ property: definitionKey, rich_text: { is_not_empty: true } });
    }
    const tradeCondition = categoryFilter(schema, "trade", trade);
    const occasionCondition = categoryFilter(schema, "occasion", occasion);
    if (tradeCondition) conditions.push(tradeCondition);
    if (occasionCondition) conditions.push(occasionCondition);

    const entries = [];
    let cursor;
    do {
      const page = await apiRequest(apiKey, `/data_sources/${dataSourceId}/query`, "POST", {
        page_size: 100,
        ...(conditions.length ? { filter: { and: conditions } } : {}),
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      for (const row of page.results ?? []) {
        const entry = toEntry(row, schema);
        if (entry) entries.push(entry);
      }
      cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
    } while (cursor && entries.length < 5_000);

    const result = { entries, filters };
    responseCache.set(cacheKey, { body: result, expiresAt: Date.now() + CACHE_MS });
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Notion request failed." }, 502);
  }
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function serveAsset(pathname, headOnly = false) {
  const file = assets[pathname];
  if (!file) return undefined;
  return new Response(headOnly ? null : decodeBase64(file.body), {
    headers: {
      "content-type": file.type,
      "cache-control": pathname === "/index.html" ? "no-cache" : "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/notion/words") return handleNotion(request, env);

    const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const asset = serveAsset(path, request.method === "HEAD");
    if (asset && (request.method === "GET" || request.method === "HEAD")) return asset;

    if (request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html")) {
      return serveAsset("/index.html") ?? new Response("Not found", { status: 404 });
    }
    return new Response("Not found", { status: 404 });
  },
};
