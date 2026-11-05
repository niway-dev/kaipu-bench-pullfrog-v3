// Pure, no node or `import.meta`: readme.ts imports it and Playwright loads readme.ts as
// CommonJS inside the run.

/** Semver pre-release identifiers: numeric ones numerically, numeric below alphanumeric. */
function comparePre(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i]!;
    const y = b[i]!;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  // Equal so far: the shorter set is lower.
  return a.length - b.length;
}

/** Semver order: the numeric part, then a pre-release below its release, then by identifier. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string[] } => {
    const dash = v.indexOf("-");
    const core = dash === -1 ? v : v.slice(0, dash);
    return {
      nums: core.split(".").map(Number),
      pre: dash === -1 ? [] : v.slice(dash + 1).split("."),
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length;
  return comparePre(pa.pre, pb.pre);
}
