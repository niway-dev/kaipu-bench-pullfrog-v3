import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  spawnNativeVideo,
  validateNativeHelper,
  validateNativeRequest,
  nativeHelperPath,
  HELPER_VERSION,
} from "./session";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const request = { displayId: 3, width: 320, height: 180, frameRate: 30, videoBitrate: 1_000_000 };
async function helper(body: string) {
  const directory = await mkdtemp(join(tmpdir(), "kaipu-native-session-"));
  directories.push(directory);
  const path = join(directory, "helper");
  await writeFile(path, `#!/usr/bin/env node\n${body}`, { mode: 0o700 });
  return path;
}
it("cancels an in-flight blocked read and refuses concurrent pulls", async () => {
  const path = await helper("process.stdin.resume(); setInterval(() => {}, 1000);");
  const reader = spawnNativeVideo(path, request);
  const pending = reader.next();
  const rejected = expect(pending).rejects.toThrow();
  await expect(reader.next()).rejects.toThrow("Concurrent");
  await reader.cancel();
  await rejected;
  await reader.cancel();
});
it("rejects process failure and EOF without end rather than finalizing a partial take", async () => {
  for (const [body, message] of [
    // A failed helper reports its own reason (e.g. a missing permission), not the
    // generic "no final duration" of an unfinished sequence.
    [
      'process.stderr.write("encoder failed");process.exit(2);',
      /Native helper failed \(2\): encoder failed/,
    ],
    ["process.exit(0);", /without final duration/],
  ] as const) {
    const reader = spawnNativeVideo(await helper(body), request);
    await expect(reader.next()).rejects.toThrow(message);
    await reader.cancel();
  }
});
it("gates helper version and refuses invalid quality dimensions before spawning", async () => {
  await expect(validateNativeHelper(await helper('console.log("old-helper/0")'))).rejects.toThrow(
    "version",
  );
  expect(() => validateNativeRequest({ ...request, width: 321 })).toThrow();
  expect(() => validateNativeRequest({ ...request, videoBitrate: Infinity })).toThrow();
  expect(nativeHelperPath("/package/Contents/Resources")).toBe(
    "/package/Contents/Resources/app.asar.unpacked/resources/native/kaipu-encoded-capture",
  );
});
it("accepts an optional sourceRect and refuses a malformed one or extra keys", () => {
  const rect = { x: 0, y: 0, width: 400, height: 300 };
  expect(() => validateNativeRequest({ ...request, sourceRect: rect })).not.toThrow();
  expect(() => validateNativeRequest(request)).not.toThrow();
  for (const bad of [
    { ...rect, x: -1 },
    { ...rect, y: 1.5 },
    { ...rect, width: 1 },
    { ...rect, height: 0 },
    { ...rect, extra: 1 },
    { x: 0, y: 0, width: 400 },
  ])
    expect(() => validateNativeRequest({ ...request, sourceRect: bad } as never)).toThrow();
  expect(() => validateNativeRequest({ ...request, extra: 1 } as never)).toThrow();
});
it("pins the helper to protocol 3 and passes sourceRect as argv", async () => {
  await expect(
    validateNativeHelper(await helper(`console.log("${HELPER_VERSION}")`)),
  ).resolves.toBeUndefined();
  await expect(
    validateNativeHelper(
      await helper('console.log("kaipu-encoded-capture/2 prepared pause-clock")'),
    ),
  ).rejects.toThrow("version");
  expect(HELPER_VERSION).toBe(
    "kaipu-encoded-capture/4 source-rect window-geometry continuous-clock",
  );
  for (const stale of [
    "kaipu-encoded-capture/3 source-rect continuous-clock",
    "kaipu-encoded-capture/3 source-rect",
    "kaipu-encoded-capture/2 prepared continuous-clock",
  ])
    await expect(validateNativeHelper(await helper(`console.log("${stale}")`))).rejects.toThrow(
      "version",
    );
  const path = await helper(
    "process.stderr.write(process.argv.slice(2).join(' '));process.exit(2);",
  );
  const withRect = spawnNativeVideo(path, {
    ...request,
    sourceRect: { x: 10, y: 20, width: 400, height: 300 },
  });
  await expect(withRect.next()).rejects.toThrow(
    "--encoded-capture-v1 3 320 180 30 1000000 --source-rect 10 20 400 300",
  );
  const without = spawnNativeVideo(path, request);
  await expect(without.next()).rejects.toThrow(/1000000$/);
});
const windowRequest = {
  windowId: 4242,
  width: 580,
  height: 384,
  frameRate: 30,
  videoBitrate: 1_000_000,
};
it("accepts a window request and refuses a mix with a display or a source rect", () => {
  expect(() => validateNativeRequest(windowRequest)).not.toThrow();
  const rect = { x: 0, y: 0, width: 400, height: 300 };
  for (const mixed of [
    { ...windowRequest, displayId: 3 },
    { ...windowRequest, sourceRect: rect },
    { ...request, windowId: 4242 },
    { ...windowRequest, extra: 1 },
  ])
    expect(() => validateNativeRequest(mixed as never)).toThrow(
      "Unsupported native capture options",
    );
  for (const windowId of [0, -1, 1.5, Number.NaN, 2 ** 32])
    expect(() => validateNativeRequest({ ...windowRequest, windowId })).toThrow();
  for (const bad of [{ width: 581 }, { height: 1 }, { frameRate: 61 }, { videoBitrate: 1 }])
    expect(() => validateNativeRequest({ ...windowRequest, ...bad })).toThrow();
});
it("passes a window as --window argv without a display", async () => {
  const path = await helper(
    "process.stderr.write(process.argv.slice(2).join(' '));process.exit(2);",
  );
  const reader = spawnNativeVideo(path, windowRequest);
  await expect(reader.next()).rejects.toThrow(
    /--encoded-capture-v1 --window 4242 580 384 30 1000000$/,
  );
});
it("reads geometry before config and between packets, then a clean end", async () => {
  const frame = (header: object, payload: number[] = []) => {
    const json = Buffer.from(JSON.stringify(header));
    const prefix = Buffer.alloc(8);
    prefix.writeUInt32BE(json.length);
    prefix.writeUInt32BE(payload.length, 4);
    return Buffer.concat([prefix, json, Buffer.from(payload)]);
  };
  const rect = { x: 100, y: 100, width: 580, height: 385 };
  const content = { x: 0, y: 0, width: 578.5, height: 384 };
  const bytes = Buffer.concat([
    frame({ kind: "ready", version: 1 }),
    frame({ kind: "geometry", atUs: 5, frame: rect, content }),
    frame(
      {
        kind: "config",
        cursorPixels: "excluded",
        version: 1,
        codec: "avc1.64001f",
        width: 580,
        height: 384,
        epochUs: 9,
      },
      [1, 100, 0, 31, 255, 225, 0, 1, 103, 1, 0, 1, 104],
    ),
    frame({ kind: "geometry", atUs: 12, frame: { ...rect, x: 140 }, content }),
    frame({ kind: "packet", ptsUs: 0, durationUs: 500000, keyframe: true }, [0, 0, 0, 1, 5]),
    frame({ kind: "end", endUs: 500000 }),
  ]);
  const path = await helper(
    `process.stdout.end(Buffer.from("${bytes.toString("base64")}", "base64")); process.exit(0);`,
  );
  const reader = spawnNativeVideo(path, windowRequest);
  const kinds: string[] = [];
  await reader.ready!();
  for (let f = await reader.next(); f; f = await reader.next()) kinds.push(f.header.kind);
  expect(kinds).toEqual(["geometry", "config", "geometry", "packet", "end"]);
});
it("times out a helper that closes stdout after end but never exits", async () => {
  const frame = (header: object, payload: number[] = []) => {
    const json = Buffer.from(JSON.stringify(header));
    const prefix = Buffer.alloc(8);
    prefix.writeUInt32BE(json.length);
    prefix.writeUInt32BE(payload.length, 4);
    return Buffer.concat([prefix, json, Buffer.from(payload)]);
  };
  const bytes = Buffer.concat([
    frame(
      {
        kind: "config",
        cursorPixels: "excluded",
        version: 1,
        codec: "avc1.64001f",
        width: 320,
        height: 180,
        epochUs: 123,
      },
      [1, 100, 0, 31, 255, 225, 0, 1, 103, 1, 0, 1, 104],
    ),
    frame({ kind: "packet", ptsUs: 0, durationUs: 500000, keyframe: true }, [0, 0, 0, 1, 5]),
    frame({ kind: "end", endUs: 500000 }),
  ]);
  const path = await helper(
    `process.stdout.end(Buffer.from("${bytes.toString("base64")}", "base64")); process.stdin.resume(); setInterval(() => {}, 1000);`,
  );
  const reader = spawnNativeVideo(path, request);
  try {
    await reader.next();
    await reader.next();
    await reader.next();
    await expect(reader.next()).rejects.toThrow("stalled");
  } finally {
    await reader.cancel();
  }
}, 8000);

it("waits ready then sends go/pause/resume/stop on one Node host clock", async () => {
  const path = await helper(`
const readline = require('node:readline');
function frame(header,payload=[]) {
 const json=Buffer.from(JSON.stringify(header)), prefix=Buffer.alloc(8);
 prefix.writeUInt32BE(json.length);prefix.writeUInt32BE(payload.length,4);
 process.stdout.write(Buffer.concat([prefix,json,Buffer.from(payload)]));
}
frame({kind:'ready',version:1});
const commands=[];
readline.createInterface({input:process.stdin}).on('line',line=>{
 const [name,value]=line.split(' '); commands.push([name,Number(value)]);
 if(name==='stop') {
  const [go,pause,resume,stop]=commands;
  if(commands.map(x=>x[0]).join(',')!=='go,pause,resume,stop') process.exit(2);
  if(resume[1]-pause[1]!==100000) process.exit(3);
  frame({kind:'config',version:1,codec:'avc1.64001f',width:320,height:180,epochUs:go[1],cursorPixels:'excluded'},[1,100,0,31,255,225,0,1,103,1,0,1,104]);
  const end=stop[1]-go[1]-(resume[1]-pause[1]);
  frame({kind:'packet',ptsUs:0,durationUs:end,keyframe:true},[0,0,0,1,5]);
  frame({kind:'end',endUs:end});process.stdout.end();
 }
});`);
  const reader = spawnNativeVideo(path, request);
  try {
    await reader.ready!();
    const at = performance.now();
    await reader.begin!(at);
    await reader.pause!(at + 100);
    await reader.resume!(at + 200);
    await reader.stop(at + 300);
    const config = await reader.next();
    expect(config?.header.kind).toBe("config");
    if (config?.header.kind === "config") expect(config.header.epochMainMs).toBeCloseTo(at, 2);
    expect((await reader.next())?.header).toMatchObject({ kind: "packet", durationUs: 200000 });
    expect((await reader.next())?.header).toEqual({ kind: "end", endUs: 200000 });
    expect(await reader.next()).toBeNull();
  } finally {
    await reader.cancel();
  }
});

it("suspends an already pending read timeout throughout pause and rearms on resume", async () => {
  const path = await helper("process.stdin.resume(); setInterval(() => {}, 1000);");
  const reader = spawnNativeVideo(path, request, false, 60);
  const pending = reader.next();
  const rejected = expect(pending).rejects.toThrow("stalled");
  try {
    await reader.pause!(performance.now());
    // Longer than the injected stall limit: the pending pull must remain alive.
    await new Promise((resolve) => setTimeout(resolve, 180));
    await reader.resume!(performance.now());
    await rejected;
  } finally {
    await reader.cancel();
  }
});
