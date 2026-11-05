// Pure, no node or `import.meta`: readme.ts imports it and Playwright loads readme.ts as
// CommonJS inside the run.
/** Plain semver order on the numeric part; a pre-release sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: boolean } => ({
    nums: v.split("-")[0]!.split(".").map(Number),
    pre: v.includes("-"),
  });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return Number(pb.pre) - Number(pa.pre);
}
