/** A standalone page: no preload, app IPC, library writes or recorder state. */
export function cursorCapturePage(
  metadata: unknown,
  sources: { id: string; name: string }[],
): string {
  const json = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src blob:">
<title>Cursor capture diagnostic</title>
<style>body{font:16px system-ui;margin:32px;max-width:900px}video{width:100%;max-height:360px;background:#222}pre{white-space:pre-wrap}button,select,a{margin:8px}</style>
<h1>Cursor capture diagnostic</h1>
<p>Experimental measurement only. Move the pointer across text and buttons while playing system audio. Each take lasts 8 seconds. Inspect the saved video for cursor pixels and audible audio; track settings do not prove either.</p>
<label>Source <select id="source"></select></label>
<label>Path <select id="mode"><option value="legacy">Current legacy baseline</option><option value="always">getDisplayMedia: cursor always</option><option value="never">getDisplayMedia: cursor never</option></select></label>
<button id="start">Record 8 seconds</button><p id="downloads"></p>
<video id="video" controls muted></video><pre id="report"></pre>
<script>
const metadata = ${json(metadata)};
const sources = ${json(sources)};
const source = document.querySelector('#source'), mode = document.querySelector('#mode');
const start = document.querySelector('#start'), video = document.querySelector('#video');
const report = document.querySelector('#report'), downloads = document.querySelector('#downloads');
for (const item of sources) source.add(new Option(item.name, item.id));
report.textContent = JSON.stringify(metadata, null, 2);
start.disabled = sources.length === 0;
const urls = [];
function link(blob, name) {
  const url = URL.createObjectURL(blob); urls.push(url);
  const a = document.createElement('a'); a.href = url; a.download = name; a.textContent = 'Save ' + name; downloads.append(a);
  return url;
}
if (sources.length === 0) link(new Blob([report.textContent], { type: 'application/json' }), 'cursor-source-enumeration.json');
start.onclick = async () => {
  start.disabled = true; source.disabled = true; mode.disabled = true;
  video.pause(); video.srcObject = null; video.removeAttribute('src');
  urls.splice(0).forEach(url => URL.revokeObjectURL(url)); downloads.replaceChildren();
  const result = { ...metadata, startedAt: new Date().toISOString(), path: mode.value, sourceId: source.value,
    cursorPixels: 'not inspected', audibleSystemAudio: 'not inspected', cursorFree: 'unverified' };
  let stream, timer;
  const started = performance.now();
  try {
    location.hash = encodeURIComponent(source.value);
    if (mode.value === 'legacy') {
      const videoConstraints = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.value, maxFrameRate: 30 } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: videoConstraints });
      } catch (error) {
        result.legacyAudioFailure = { name: error.name, message: error.message };
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      }
    } else {
      result.supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { cursor: mode.value, frameRate: 30 } });
    }
    result.acquisitionMs = performance.now() - started;
    result.tracks = stream.getTracks().map(t => ({ kind: t.kind, settings: t.getSettings(), constraints: t.getConstraints() }));
    result.audioTrackCount = stream.getAudioTracks().length;
    video.srcObject = stream; await video.play();
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    await new Promise((resolve, reject) => {
      recorder.onstop = resolve; recorder.onerror = () => reject(new Error('MediaRecorder failed'));
      recorder.start(250);
      timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 8000);
    });
    result.durationMs = performance.now() - started - result.acquisitionMs;
    const blob = new Blob(chunks, { type: recorder.mimeType });
    result.mimeType = recorder.mimeType; result.bytes = blob.size;
    video.srcObject = null; video.src = link(blob, 'cursor-' + mode.value + '.webm');
  } catch (error) {
    result.error = { name: error.name, message: error.message };
  } finally {
    clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); video.srcObject = null;
    report.textContent = JSON.stringify(result, null, 2);
    link(new Blob([report.textContent], { type: 'application/json' }), 'cursor-' + mode.value + '.json');
    start.disabled = false; source.disabled = false; mode.disabled = false;
  }
};
</script>`;
}
