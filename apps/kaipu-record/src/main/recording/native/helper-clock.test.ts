import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { HELPER_VERSION } from "./session";

// NIW2-649. Node stamps go/pause/resume/stop from `process.hrtime`, which libuv reads
// from mach_continuous_time (it keeps counting while the Mac sleeps). The Swift helper
// validates every stamp against its own clock and rejects a gap of 10 s or more.
// CMClockGetHostTimeClock is mach_absolute_time, which stops during sleep, so on a Mac
// that has slept since boot the two clocks differ by the total sleep time and the first
// `go` fails with "Invalid stamped command". The helper must read the continuous clock.
const source = readFileSync(
  join(__dirname, "../../../../native/encoded-capture/main.swift"),
  "utf8",
);

it("reads the helper clock from the same continuous clock as Node hrtime", () => {
  const line = source.split("\n").find((l) => l.startsWith("func hostUs()"));
  expect(line).toBeDefined();
  expect(line).toContain("clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)");
});

it("never reads the sleep-excluding host time clock", () => {
  const code = source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  expect(code).not.toContain("CMClockGetHostTimeClock");
  expect(code).not.toContain("mach_absolute_time");
});

it("rejects a stale helper build that still uses the old clock", () => {
  expect(HELPER_VERSION).toBe("kaipu-encoded-capture/3 source-rect continuous-clock");
  expect(source).toContain(`print("${HELPER_VERSION}")`);
});
