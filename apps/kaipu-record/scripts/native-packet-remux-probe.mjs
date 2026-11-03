// Diagnostic packet contract only: no decoder, raw-frame IPC, or production wiring.
// node (or bun) scripts/native-packet-remux-probe.mjs INPUT.mov NEW_OUTPUT_DIRECTORY
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  Input,
  ALL_FORMATS,
  FilePathSource,
  FilePathTarget,
  Output,
  Mp4OutputFormat,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
} from "mediabunny";

const [sourcePath, directory, ...extra] = process.argv.slice(2);
assert(sourcePath && directory && !extra.length, "Usage: INPUT.mov NEW_OUTPUT_DIRECTORY");
await mkdir(directory); // Refuse overwrite; preserve failed-run artifacts.
const open = (path) => new Input({ source: new FilePathSource(path), formats: ALL_FORMATS });
const input = open(sourcePath);
const outputPath = join(directory, "remux.mp4");
const output = new Output({
  format: new Mp4OutputFormat(),
  target: new FilePathTarget(outputPath),
});
let result;
const fingerprint = (packet) => ({
  timestamp: packet.timestamp,
  duration: packet.duration,
  type: packet.type,
  bytes: packet.byteLength,
  sha256: createHash("sha256").update(packet.data).digest("hex"),
});
try {
  const tracks = await input.getTracks();
  assert.equal((await input.getVideoTracks()).length, 1, "Expected one native video track");
  assert((await input.getAudioTracks()).length <= 1, "Expected at most one audio track");
  const contracts = [];
  for (const track of tracks) {
    const codec = await track.getCodec();
    const config = await track.getDecoderConfig();
    assert(codec && config, "Missing codec configuration");
    const source =
      track.type === "video"
        ? new EncodedVideoPacketSource(codec)
        : new EncodedAudioPacketSource(codec);
    if (track.type === "video") output.addVideoTrack(source);
    else {
      assert.equal(track.type, "audio");
      output.addAudioTrack(source);
    }
    contracts.push({ track, source, config, packets: [] });
  }
  await output.start();
  // Independent consumers await every add: bounded packet pipeline, no sample arrays.
  await Promise.all(
    contracts.map(async (contract) => {
      for await (const packet of new EncodedPacketSink(contract.track).packets()) {
        assert(Number.isFinite(packet.timestamp) && packet.duration > 0, "Invalid packet timing");
        contract.packets.push(fingerprint(packet)); // Small diagnostic metadata only.
        await contract.source.add(
          packet,
          contract.packets.length === 1 ? { decoderConfig: contract.config } : undefined,
        );
      }
      assert(contract.packets.length > 0, "Empty track");
      contract.source.close();
    }),
  );
  await output.finalize();
  result = open(outputPath);
  const resultTracks = await result.getTracks();
  assert.equal(resultTracks.length, tracks.length, "Track count changed");
  const summaries = [];
  for (let i = 0; i < contracts.length; i++) {
    const original = contracts[i];
    const actualTrack = resultTracks[i];
    assert.equal(actualTrack.type, original.track.type);
    assert.equal(await actualTrack.getCodec(), await original.track.getCodec());
    const actual = [];
    for await (const packet of new EncodedPacketSink(actualTrack).packets())
      actual.push(fingerprint(packet));
    assert.equal(actual.length, original.packets.length, "Packet count changed");
    for (let j = 0; j < actual.length; j++) {
      const before = original.packets[j],
        after = actual[j];
      for (const key of ["sha256", "bytes", "type"])
        assert.equal(after[key], before[key], `Packet ${j} ${key}`);
      // Container timebases may quantize by one microsecond; do not normalize epochs.
      for (const key of ["timestamp", "duration"])
        assert(Math.abs(after[key] - before[key]) <= 0.000002, `Packet ${j} ${key} changed`);
    }
    const duration = await original.track.computeDuration();
    assert(
      Math.abs((await actualTrack.computeDuration()) - duration) <= 0.000002,
      "Track duration changed",
    );
    summaries.push({
      type: actualTrack.type,
      codec: await actualTrack.getCodec(),
      packets: actual.length,
      first: actual[0],
      last: actual.at(-1),
      duration,
      distinctPacketDurations: [...new Set(actual.map((p) => p.duration))],
    });
  }
  const duration = await input.computeDuration();
  assert(
    Math.abs((await result.computeDuration()) - duration) <= 0.000002,
    "Movie duration changed",
  );
  const report = {
    sourcePath,
    outputPath,
    duration,
    tracks: summaries,
    assertions:
      "packet bytes/type/count, per-packet PTS/duration, codecs, tracks and end duration preserved",
    audioAudibility: "not measured; an audio track does not establish audible loopback",
  };
  await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await output.cancel();
  } catch {
    /* Preserve the assertion or muxing error. */
  }
  throw error;
} finally {
  result?.dispose();
  input.dispose();
}
