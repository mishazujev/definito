export const PHASE_SECONDS = 20;

export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

export function isCorrect(guess: string, answer: string): boolean {
  return normalize(guess) !== "" && normalize(guess) === normalize(answer);
}

/** 2 points if guessed from the definition alone, 1 after letters are revealed. */
export function pointsFor(phase: 1 | 2): number {
  return phase === 1 ? 2 : 1;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
