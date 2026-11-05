import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { windowCapturedSpace } from "../captured-display";
import { CursorTrackRegistry, type CursorTrackerDeps } from "../cursor-tracker";
import { feedWindowLog, WindowGeometryLog } from "../window-geometry-log";
import { pumpFrames } from "./frame-pump";
import { spawnNativeVideo } from "./session";

// Real session parser -> frame pump -> geometry log -> cursor tracker, with a scripted
// helper that speaks the real framing on stdout (illustrative window of 400x300 points in an
// 800x600 output).

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const request = { windowId: 42, width: 800, height: 600, frameRate: 30, videoBitrate: 1_000_000 };

/** Sends ready + one geometry at once, then waits for `go` and sends the rest. */
function scriptedWindowHelper(quietMs: number) {
  return `
const frame=(h,p=[])=>{const j=Buffer.from(JSON.stringify(h));const pre=Buffer.alloc(8);pre.writeUInt32BE(j.length);pre.writeUInt32BE(p.length,4);return Buffer.concat([pre,j,Buffer.from(p)]);};
const nowUs=()=>Number(process.hrtime.bigint()/1000n);
const t0=nowUs();
const content={x:0,y:0,width:800,height:600};
process.stdout.write(frame({kind:'ready',version:1}));
process.stdout.write(frame({kind:'geometry',atUs:t0,frame:{x:100,y:50,width:400,height:300},content}));
let started=false,buf='';
process.stdin.on('data',(d)=>{
  buf+=d;
  if(started||!buf.includes('go '))return;
  started=true;
  setTimeout(()=>{
    process.stdout.write(frame({kind:'geometry',atUs:t0+1000000,frame:{x:200,y:50,width:400,height:300},content}));
    process.stdout.write(frame({kind:'config',version:1,codec:'avc1.64001f',width:800,height:600,epochUs:t0,cursorPixels:'excluded'},[1,100,0,31,255,225,0,1,103,1,0,1,104]));
    process.stdout.write(frame({kind:'packet',ptsUs:0,durationUs:500000,keyframe:true},[0,0,0,1,5]));
    process.stdout.write(frame({kind:'end',endUs:500000}),()=>process.exit(0));
  },${quietMs});
});
setTimeout(()=>{},60000);
`;
}

async function helper(body: string) {
  const directory = await mkdtemp(join(tmpdir(), "kaipu-window-pipeline-"));
  directories.push(directory);
  const path = join(directory, "helper");
  await writeFile(path, `#!/usr/bin/env node\n${body}`, { mode: 0o700 });
  return path;
}

async function drain(reader: { next(): Promise<unknown> }) {
  while (await reader.next());
}

it("the stall timer is armed again once go is sent (B2)", async () => {
  const path = await helper(scriptedWindowHelper(1000));
  // Stall timeout 700 ms. Before `go` the 900 ms of silence is fine; after `go` the helper
  // stays silent for 1000 ms, which is a real stall and must still be reported.
  const reader = spawnNativeVideo(path, request, false, 700);
  await reader.ready!();
  const pumped = pumpFrames(reader, () => {});
  await new Promise((r) => setTimeout(r, 900)); // prepare + countdown: nothing arrives
  await pumped.begin!(performance.now());
  // After `go` the helper needs 1000 ms, longer than the 700 ms timeout: a real stall.
  await expect(drain(pumped)).rejects.toThrow("Native capture stalled");
});

it("a quiet gap before go is fine, then frames flow after go (B2)", async () => {
  const path = await helper(scriptedWindowHelper(0));
  const reader = spawnNativeVideo(path, request, false, 700);
  await reader.ready!();
  const pumped = pumpFrames(reader, () => {});
  await new Promise((r) => setTimeout(r, 900)); // longer than the stall timeout, before go
  await pumped.begin!(performance.now());
  const kinds: string[] = [];
  for (let f = await pumped.next(); f; f = await pumped.next()) kinds.push(f.header.kind);
  expect(kinds).toEqual(["geometry", "geometry", "config", "packet", "end"]);
});

it("session parser -> pump -> log -> tracker maps each sample with the geometry in force (S3)", async () => {
  const path = await helper(scriptedWindowHelper(0));
  const log = new WindowGeometryLog();
  const reader = spawnNativeVideo(path, request, false, 2000);
  await reader.ready!();
  const pumped = pumpFrames(reader, (frame) => {
    if (frame) feedWindowLog(log, frame);
  });
  await pumped.begin!(performance.now());
  await drain(pumped);

  expect(log.size).toBe(2);
  expect(log.output()).toEqual({ width: 800, height: 600 });
  const second = log.latest()!;
  const first = log.at(second.atMs - 1)!;
  expect(second.atMs - first.atMs).toBeCloseTo(1000, 3);

  // A pointer that never moves, sampled once in each geometry.
  let clock = first.atMs + 10;
  let tick: (() => void) | null = null;
  const deps: CursorTrackerDeps = {
    now: () => clock,
    cursorPoint: () => ({ x: 300, y: 200 }),
    every: (_ms, fn) => {
      tick = fn;
      return () => {};
    },
  };
  const reg = new CursorTrackRegistry(deps);
  const tracker = reg.start("s", windowCapturedSpace("window:42:0", 2, log)!);
  tracker.setAnchor(first.atMs, "exact");
  clock = second.atMs + 10;
  tick!();
  const track = reg.finish("s", false)!;

  expect(track.display).toEqual({ id: "window:42", width: 400, height: 300, scaleFactor: 2 });
  expect(track.t).toEqual([10, 1000, 1010]);
  // (300 - 100) * 2 / 800 = 0.5 in the first geometry; (300 - 200) * 2 / 800 = 0.25 after the move.
  expect(track.x.map((v) => Number(v.toFixed(6)))).toEqual([0.5, 0.25, 0.25]);
  expect(track.y.map((v) => Number(v.toFixed(6)))).toEqual([0.5, 0.5, 0.5]);
});
