import { describe, expect, it } from "vitest";
import { CATALOGS } from "./index";
import { INSTRUCTIONS, NOT_CAPTURABLE_KINDS } from "./not-capturable";

describe("not-capturable reasons", () => {
  it("has an imperative instruction for every kind", () => {
    for (const kind of NOT_CAPTURABLE_KINDS) {
      const instruction = INSTRUCTIONS[kind];
      expect(instruction, kind).toBeDefined();
      expect(instruction.title.length, kind).toBeGreaterThan(0);
      expect(instruction.next.length, kind).toBeGreaterThan(0);
    }
    expect(Object.keys(INSTRUCTIONS).sort()).toEqual([...NOT_CAPTURABLE_KINDS].sort());
  });

  it("gives every declared not-capturable state a known kind and a reason", () => {
    for (const cat of CATALOGS) {
      for (const [claim, declared] of Object.entries(cat.notCapturable)) {
        const d = declared as { kind: string; why: string };
        expect(NOT_CAPTURABLE_KINDS as readonly string[], claim).toContain(d.kind);
        expect(d.why.length, claim).toBeGreaterThan(0);
      }
    }
  });
});
