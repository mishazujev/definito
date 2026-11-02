import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BANKS, LANGS, type Entry, type Lang } from "@/lib/words";
import { PHASE_SECONDS, isCorrect, pointsFor, shuffle } from "@/lib/game";
import { getNotionWords } from "@/lib/notion.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Definito — guess the word from its definition" },
      { name: "description", content: "A typed word-guessing game in 5 languages: read the definition, guess in 20 seconds, then get letter hints." },
      { property: "og:title", content: "Definito — word guessing game" },
      { property: "og:description", content: "Guess words from definitions in English, French, German, Spanish and Estonian." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Game,
});

type Mode = { kind: "timed"; seconds: 40 | 60 } | { kind: "fixed"; count: 10 | 12 | 15 };
const POS_STYLE = {
  noun: { label: "noun", text: "text-noun", border: "border-noun" },
  verb: { label: "verb", text: "text-verb", border: "border-verb" },
  adj: { label: "adjective", text: "text-adj", border: "border-adj" },
  other: { label: "my notion", text: "text-muted-foreground", border: "border-border" },
} as const;

type Result = { entry: Entry; points: number };

function Game() {
  const [lang, setLang] = useState<Lang>("en");
  const [mode, setMode] = useState<Mode>({ kind: "fixed", count: 10 });
  const [stage, setStage] = useState<"setup" | "play" | "done">("setup");
  const [queue, setQueue] = useState<Entry[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [phaseLeft, setPhaseLeft] = useState(PHASE_SECONDS);
  const [totalLeft, setTotalLeft] = useState(0);
  const [guess, setGuess] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; word: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  revealedRef.current = revealed;
  const inputRef = useRef<HTMLInputElement>(null);

  const current = queue[idx];

  const cache = useRef<Partial<Record<Lang, Entry[]>>>({});
  const notionCache = useRef<Partial<Record<Lang, Entry[]>>>({});
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState("Checking Notion connection…");
  const [notice, setNotice] = useState("");
  const [wordSource, setWordSource] = useState("");

  useEffect(() => {
    let current = true;
    setConnection("Checking Notion connection…");
    setNotice("");
    getNotionWords(lang).then(({ entries }) => {
      if (!current) return;
      notionCache.current[lang] = entries;
      setConnection(`Notion connected · ${entries.length} playable words`);
      if (!entries.length) setNotice("No playable Notion words found. Check In game and Definition in the database.");
    }).catch((error: unknown) => {
      if (!current) return;
      delete notionCache.current[lang];
      setConnection(error instanceof Error ? `Notion unavailable: ${error.message}` : "Notion unavailable.");
    });
    return () => { current = false; };
  }, [lang]);

  async function loadBank(l: Lang): Promise<Entry[]> {
    if (cache.current[l]) return cache.current[l]!;
    try {
      const res = await fetch(`/words/${l}.json`);
      if (!res.ok) throw new Error();
      const rows = (await res.json()) as [string, Entry["pos"], string, string][];
      const list = rows.map(([word, pos, def, hint]) => ({ word, pos, def, hint }));
      cache.current[l] = list.length ? list : BANKS[l];
    } catch {
      cache.current[l] = BANKS[l];
    }
    return cache.current[l]!;
  }

  async function start() {
    setLoading(true);
    setNotice("");
    let pool: Entry[];
    let source: string;
    try {
      const entries = notionCache.current[lang] ?? (await getNotionWords(lang)).entries;
      notionCache.current[lang] = entries;
      if (!entries.length) {
        setNotice("No playable Notion words found. Check In game and Definition in the database.");
        setLoading(false);
        return;
      }
      pool = entries;
      source = "Notion";
      setConnection(`Notion connected · ${pool.length} matching words`);
    } catch (error) {
      pool = await loadBank(lang);
      source = "built-in words (Notion unavailable)";
      setConnection(error instanceof Error ? `Notion unavailable: ${error.message}` : "Notion unavailable.");
    }
    const bank = shuffle(pool).slice(0, 300);
    setWordSource(source);
    setLoading(false);
    setQueue(mode.kind === "fixed" ? bank.slice(0, mode.count) : bank);
    setIdx(0);
    setPhase(1);
    setPhaseLeft(PHASE_SECONDS);
    setTotalLeft(mode.kind === "timed" ? mode.seconds : 0);
    setResults([]);
    setGuess("");
    setFlash(null);
    setRevealed(false);
    setStage("play");
  }

  function next(points: number) {
    if (!current) return;
    const res = [...results, { entry: current, points }];
    setResults(res);
    setFlash({ ok: points > 0, word: current.word });
    setGuess("");
    if (idx + 1 >= queue.length) {
      setStage("done");
      return;
    }
    setIdx(idx + 1);
    setPhase(1);
    setPhaseLeft(PHASE_SECONDS);
    setRevealed(false);
  }

  function skip() {
    setRevealed(true);
  }

  function hint() {
    setPhase(2);
    setPhaseLeft(PHASE_SECONDS);
    inputRef.current?.focus();
  }

  // per-word ticker
  useEffect(() => {
    if (stage !== "play") return;
    const t = setInterval(() => {
      if (!revealedRef.current) setPhaseLeft((s) => s - 1);
      if (mode.kind === "timed") setTotalLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(t);
  }, [stage, mode.kind]);

  useEffect(() => {
    if (stage !== "play") return;
    if (mode.kind === "timed" && totalLeft <= 0) {
      setStage("done");
      return;
    }
    if (phaseLeft <= 0 && !revealed) {
      if (phase === 1) {
        setPhase(2);
        setPhaseLeft(PHASE_SECONDS);
      } else next(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseLeft, totalLeft, stage]);

  useEffect(() => {
    if (stage === "play") inputRef.current?.focus();
  }, [stage, idx, revealed]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (revealed) return next(0);
    if (isCorrect(guess, current.word)) next(pointsFor(phase));
    else {
      setGuess("");
      inputRef.current?.animate(
        [{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "none" }],
        { duration: 200 },
      );
    }
  }

  const score = results.reduce((s, r) => s + r.points, 0);
  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"
    }`;

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10 flex items-baseline justify-between">
          <h1 className="font-display text-4xl tracking-tight">Definito</h1>
          {stage === "play" && (
            <span className="font-mono text-sm text-muted-foreground">
              score {score}
              {mode.kind === "timed" ? ` · ${Math.max(totalLeft, 0)}s left` : ` · ${idx + 1}/${queue.length}`}
            </span>
          )}
        </header>

        {stage === "setup" && (
          <section className="space-y-8 rounded-2xl border bg-card p-8 shadow-[var(--shadow-card)]">
            <p className="text-muted-foreground">
              Read the definition and type the word. You get {PHASE_SECONDS} seconds — then the letter count is revealed
              and a longer hint, and you get {PHASE_SECONDS} more. Press Hint to get it early. 2 points without hints, 1 with. Skip shows the answer.
            </p>
            {notice ? (
              <p className="text-sm text-destructive" role="alert">{notice}</p>
            ) : (
              <p className="text-sm text-muted-foreground" role="status">{connection}</p>
            )}
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Language</h2>
              <div className="flex flex-wrap gap-2">
                {LANGS.map((l) => (
                  <button key={l.id} className={chip(lang === l.id)} onClick={() => setLang(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fixed set</h2>
              <div className="flex flex-wrap gap-2">
                {([10, 12, 15] as const).map((c) => (
                  <button key={c} className={chip(mode.kind === "fixed" && mode.count === c)} onClick={() => setMode({ kind: "fixed", count: c })}>
                    {c} words
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Timed</h2>
              <div className="flex flex-wrap gap-2">
                {([40, 60] as const).map((s) => (
                  <button key={s} className={chip(mode.kind === "timed" && mode.seconds === s)} onClick={() => setMode({ kind: "timed", seconds: s })}>
                    {s} seconds
                  </button>
                ))}
              </div>
            </div>
            <button onClick={start} disabled={loading} className="w-full rounded-xl bg-primary py-4 text-lg font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {loading ? "Loading words…" : "Start"}
            </button>
          </section>
        )}

        {stage === "play" && current && (
          <section className="space-y-6">
            <p className="text-xs text-muted-foreground" role="status">Playing from {wordSource}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all duration-1000 ease-linear ${phase === 1 ? "bg-primary" : "bg-highlight"}`}
                style={{ width: `${(phaseLeft / PHASE_SECONDS) * 100}%` }}
              />
            </div>
            <div className={`rounded-2xl border-2 bg-card p-8 shadow-[var(--shadow-card)] ${POS_STYLE[current.pos].border}`}>
              <p className={`mb-3 inline-block rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-widest ${POS_STYLE[current.pos].text} ${POS_STYLE[current.pos].border}`}>
                {POS_STYLE[current.pos].label}{current.level ? ` · ${current.level}` : ""}
              </p>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {revealed ? "Answer" : phase === 1 ? `Definition · ${phaseLeft}s` : `Hint · letters revealed · ${phaseLeft}s`}
              </p>
              <p className="font-display text-2xl leading-snug">{current.def}</p>
              {phase === 2 && <p className="mt-3 text-lg text-muted-foreground">{current.hint}</p>}
              {revealed ? (
                <p className="mt-6 font-display text-4xl text-highlight">{current.word}</p>
              ) : phase === 2 && (
                <p className="mt-6 font-mono text-3xl tracking-[0.4em]">
                  {[...current.word].map((ch) => (ch === " " ? " " : "_")).join("")}
                  <span className="ml-3 text-base tracking-normal text-muted-foreground">({[...current.word].length})</span>
                </p>
              )}
            </div>
            <form onSubmit={submit} className="space-y-2">
              {revealed ? (
                <button autoFocus className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground">
                  Next word →
                </button>
              ) : (
                <>
                  <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="Type your guess…"
                    className="min-w-0 flex-1 rounded-xl border bg-card px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button className="rounded-xl bg-primary px-6 font-semibold text-primary-foreground">Guess</button>
                  </div>
                  <div className="flex gap-2">
                  {phase === 1 && (
                    <button type="button" onClick={hint} className="flex-1 rounded-xl border py-2 text-sm hover:bg-accent">
                      Hint
                    </button>
                  )}
                  <button type="button" onClick={skip} className="flex-1 rounded-xl border py-2 text-sm text-muted-foreground hover:bg-accent">
                    Skip
                  </button>
                  </div>
                </>
              )}
            </form>
            {flash && !revealed && (
              <p className={`text-sm ${flash.ok ? "text-primary" : "text-destructive"}`}>
                {flash.ok ? "Correct!" : "Missed —"} <strong>{flash.word}</strong>
              </p>
            )}
          </section>
        )}

        {stage === "done" && (
          <section className="space-y-6 rounded-2xl border bg-card p-8 shadow-[var(--shadow-card)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Final score</p>
              <p className="font-display text-6xl">{score}</p>
              <p className="text-muted-foreground">
                {results.filter((r) => r.points > 0).length} of {results.length} words guessed
              </p>
            </div>
            <ul className="divide-y">
              {results.map((r, i) => (
                <li key={i} className="flex justify-between gap-4 py-2 text-sm">
                  <span>
                    <strong className={POS_STYLE[r.entry.pos].text}>{r.entry.word}</strong> <span className="text-muted-foreground">— {r.entry.def}</span>
                  </span>
                  <span className={r.points ? "text-primary" : "text-muted-foreground"}>+{r.points}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={start} className="flex-1 rounded-xl bg-primary py-3 font-semibold text-primary-foreground">Play again</button>
              <button onClick={() => setStage("setup")} className="flex-1 rounded-xl border py-3 font-semibold hover:bg-accent">Settings</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
