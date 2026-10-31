import { describe, it, expect } from "vitest";
import { isCorrect, pointsFor, PHASE_SECONDS } from "./game";

describe("game rules", () => {
  it("each phase lasts 20 seconds", () => expect(PHASE_SECONDS).toBe(20));
  it("ignores case and accents", () => expect(isCorrect("Ecole", "école")).toBe(true));
  it("rejects wrong word", () => expect(isCorrect("cat", "dog")).toBe(false));
  it("scores 2 then 1", () => {
    expect(pointsFor(1)).toBe(2);
    expect(pointsFor(2)).toBe(1);
  });
});
