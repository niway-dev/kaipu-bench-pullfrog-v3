// Experimental prepared screen source (display, display area or one window); audio remains in Chromium.
import Foundation
import AppKit
import Darwin
import ScreenCaptureKit
import VideoToolbox
import CoreGraphics

struct CaptureError: Error { let message: String }
// Same clock as Node's process.hrtime (mach_continuous_time, counts sleep). Do not use
// CMClockGetHostTimeClock here: it is mach_absolute_time, which stops during sleep, so
// stamped commands from Node would differ by the total sleep time (NIW2-649). Every
// timestamp in this helper derives from this function, not from SCK sample PTS.
func hostUs() -> Int64 { Int64(clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW) / 1000) }
func check(_ status: OSStatus) throws { if status != noErr { throw CaptureError(message: "Native status \(status)") } }

final class Encoder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "kaipu.encoded-capture")
    var session: VTCompressionSession?
    var image: CVPixelBuffer?
    var timer: DispatchSourceTimer?
    var epoch: Int64?
    var pending: [(Data, Int64, Bool)] = []
    var emittedEnd: Int64 = 0
    var resumeTimestamp: Int64?
    var configured = false
    var accepting = true
    var ready = false
    var pausedAt: Int64?
    var removedUs: Int64 = 0
    var forceKeyframe = true
    let fps: Int
    // Window mode: geometry frames and a clean finish when the window closes.
    let windowMode: Bool
    let outWidth: Int
    let outHeight: Int
    var lastFrameUs: Int64 = 0
    var lastGeometry: [Double]?
    /// Terminal state: set once a take has been finished and its `end` frame written, by either
    /// a user `stop` or a window close. From then on late stream errors (-3815, "already
    /// stopped") are expected and ignored, and a second finish is a no-op.
    var saved = false
    let logGeometry = ProcessInfo.processInfo.environment["KAIPU_ENCODED_CAPTURE_LOG"] == "1"
    init(width: Int, height: Int, fps: Int, bitrate: Int, windowMode: Bool = false) throws {
        self.fps = fps
        self.windowMode = windowMode
        self.outWidth = width
        self.outHeight = height
        super.init()
        try check(VTCompressionSessionCreate(allocator: nil, width: Int32(width), height: Int32(height), codecType: kCMVideoCodecType_H264, encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: { ref, _, status, _, sample in
            let sink = Unmanaged<Encoder>.fromOpaque(ref!).takeUnretainedValue()
            do { try check(status); if let sample { try sink.encoded(sample) } }
            catch { sink.fail(error) }
        }, refcon: Unmanaged.passUnretained(self).toOpaque(), compressionSessionOut: &session))
        guard let session else { throw CaptureError(message: "Missing encoder") }
        let properties: [(CFString, CFTypeRef)] = [(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue!), (kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse!), (kVTCompressionPropertyKey_AverageBitRate, bitrate as CFNumber), (kVTCompressionPropertyKey_ExpectedFrameRate, fps as CFNumber), (kVTCompressionPropertyKey_MaxKeyFrameInterval, (fps * 2) as CFNumber)]
        for (key, value) in properties {
            try check(VTSessionSetProperty(session, key: key, value: value))
        }
        try check(VTCompressionSessionPrepareToEncodeFrames(session))
    }
    func fail(_ error: Error) {
        // Do not leave the reader waiting for its generic stall timeout.
        FileHandle.standardError.write(Data("encoded-capture: \(error)\n".utf8))
        exit(1)
    }
    func emit(_ header: [String: Any], _ payload: Data = Data()) throws {
        let json = try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys])
        guard json.count <= 16384, payload.count <= 8 * 1024 * 1024 else { throw CaptureError(message: "Frame exceeds transport limit") }
        var a = UInt32(json.count).bigEndian, b = UInt32(payload.count).bigEndian
        var prefix = Data(bytes: &a, count: 4); prefix.append(Data(bytes: &b, count: 4))
        // Blocking pipe writes apply backpressure on the serial sample queue. No packet array.
        try FileHandle.standardOutput.write(contentsOf: prefix)
        try FileHandle.standardOutput.write(contentsOf: json)
        try FileHandle.standardOutput.write(contentsOf: payload)
    }
    func encoded(_ sample: CMSampleBuffer) throws {
        guard let format = sample.formatDescription, let block = sample.dataBuffer, let epoch else { throw CaptureError(message: "Missing encoded format") }
        if !configured {
            guard let atoms = CMFormatDescriptionGetExtension(format, extensionKey: kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms) as? [String: Any], let avcc = atoms["avcC"] as? Data, avcc.count >= 4 else { throw CaptureError(message: "Missing avcC") }
            let dims = CMVideoFormatDescriptionGetDimensions(format)
            let codec = String(format: "avc1.%02x%02x%02x", avcc[1], avcc[2], avcc[3])
            try emit(["kind": "config", "version": 1, "codec": codec, "width": Int(dims.width), "height": Int(dims.height), "epochUs": epoch, "cursorPixels": "excluded"], avcc)
            configured = true
        }
        let pts = Int64((CMTimeGetSeconds(sample.presentationTimeStamp) * 1_000_000).rounded())
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let key = (attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) != true
        let size = CMBlockBufferGetDataLength(block)
        guard size > 0, size <= 8 * 1024 * 1024 else { throw CaptureError(message: "Oversize AVC packet") }
        var data = Data(count: size)
        try data.withUnsafeMutableBytes { try check(CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: size, destination: $0.baseAddress!)) }
        if let previous = pending.last, pts <= previous.1 { throw CaptureError(message: "Nonmonotonic encoder PTS") }
        pending.append((data, pts, key))
        // Hold 200 ms so stamped commands can trim frames encoded while IPC was in flight.
        // Bound both packet count and retained bytes; excessive latency fails the take.
        while pending.count > 1, pts - pending[0].1 >= 200_000 {
            let previous = pending.removeFirst()
            emittedEnd = pending[0].1
            try emit(["kind": "packet", "ptsUs": previous.1, "durationUs": emittedEnd - previous.1, "keyframe": previous.2], previous.0)
        }
        guard pending.count <= 16, pending.reduce(0, { $0 + $1.0.count }) <= 16 * 1024 * 1024 else { throw CaptureError(message: "Command lookbehind buffer exceeded") }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let ns = error as NSError
        queue.async { [self] in
            if saved { return } // the take is already saved; the stream dying after it is not a failure
            if windowMode, ns.domain == SCStreamErrorDomain, ns.code == -3815 { windowClosed() }
            else { fail(error) }
        }
        return
        // -3815: "Failed to find any displays or windows to capture". For a window source this
        // is how SCK reports that the window was closed (measured ~0.3 s after the close, after
        // a suspended and a stopped frame). That is the end of the take, not a failure.
    }
    /// The window closed: end the take at the last frame SCK delivered, save it, exit 0.
    func windowClosed() {
        guard accepting, !saved else { return }
        do {
            guard let epoch else { throw CaptureError(message: "Window closed before the take began") }
            // Closed after `go` but before anything was encoded: encode the retained image once.
            if !configured { tick() }
            accepting = false; timer?.cancel(); timer = nil
            // At least one frame long, so a close right after `go` still yields a packet.
            let edge = pausedAt ?? max(lastFrameUs, epoch + removedUs + Int64(1_000_000 / fps))
            // For an idle window the last frame SCK delivered can be older than video the hold
            // timer already emitted, so `end` is moved forward to cover it. That is expected here.
            let end = try flush(at: edge, quiet: true)
            guard configured else { throw CaptureError(message: "No video received") }
            try emit(["kind": "end", "endUs": end])
            saved = true
            if let session { VTCompressionSessionInvalidate(session) }
            session = nil
            FileHandle.standardError.write(Data("encoded-capture: window closed, take ended at \(end) us\n".utf8))
            exit(0)
        } catch { fail(error) }
    }
    static func rect(_ value: Any?) -> CGRect? {
        guard let dict = value as? NSDictionary else { return nil }
        return CGRect(dictionaryRepresentation: dict as CFDictionary)
    }
    /// Emits a geometry frame when the window's screen rect or its content placement changed.
    /// `screenRect` is per frame and current (the spike measured it follows a move on the next
    /// frame). The content rect is computed from it alone, mirrored by `windowContentRect` in
    /// src/main/recording/native/window-fit.ts (tested): scalesToFit scales the window uniformly
    /// until one axis fills the output and pins it top-left. The frame's own `contentRect` is
    /// not used (its units are unverified on Retina); it is only logged as a cross-check.
    func emitGeometry(_ info: [SCStreamFrameInfo: Any]) throws {
        guard let frame = Encoder.rect(info[.screenRect]), frame.width > 0, frame.height > 0 else { return }
        func r(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }
        let fit = min(Double(outWidth) / Double(frame.width), Double(outHeight) / Double(frame.height))
        let content = [0.0, 0.0, r(Double(frame.width) * fit), r(Double(frame.height) * fit)]
        let box = [r(Double(frame.minX)), r(Double(frame.minY)), r(Double(frame.width)), r(Double(frame.height))]
        let key = box + content
        if key == lastGeometry { return }
        lastGeometry = key
        let at = hostUs()
        try emit(["kind": "geometry", "atUs": at,
                  "frame": ["x": box[0], "y": box[1], "width": box[2], "height": box[3]],
                  "content": ["x": content[0], "y": content[1], "width": content[2], "height": content[3]]])
        if logGeometry {
            let reported = Encoder.rect(info[.contentRect]).map { "\($0)" } ?? "nil"
            FileHandle.standardError.write(Data("encoded-capture: geometry at=\(at) frame=\(box) content=\(content) reportedContentRect=\(reported) scaleFactor=\(String(describing: info[.scaleFactor]))\n".utf8))
        }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard accepting, type == .screen, sample.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]] else { return }
        let status = attachments.first?[.status] as? Int
        if logGeometry { FileHandle.standardError.write(Data("encoded-capture: sample status=\(status.map(String.init) ?? "nil") keys=\(attachments.first?.keys.map { $0.rawValue }.sorted() ?? [])\n".utf8)) }
        // A window that moved or resized without repainting can arrive as an idle sample that
        // carries no image but still reports its screen rect.
        if windowMode, ready, status == SCFrameStatus.idle.rawValue, let info = attachments.first {
            do { try emitGeometry(info) } catch { fail(error) }
        }
        guard status == SCFrameStatus.complete.rawValue, let buffer = sample.imageBuffer else { return }
        image = buffer // One retained surface; timer encodes it even while SCK is idle.
        lastFrameUs = hostUs()
        // A minimized or off-Space window delivers no frames and no error; the timer keeps
        // re-encoding this surface, so the video holds the last frame.
        do {
            if !ready {
                ready = true
                try emit(["kind": "ready", "version": 1])
            }
            if windowMode, let info = attachments.first { try emitGeometry(info) }
        } catch { fail(error) }
    }
    func control(_ name: String, at: Int64) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            queue.async { [self] in
                do {
                    guard self.ready else { throw CaptureError(message: "Capture not ready") }
                    if name == "go" {
                        guard self.epoch == nil else { throw CaptureError(message: "Already begun") }
                        self.epoch = at
                        let timer = DispatchSource.makeTimerSource(queue: self.queue)
                        timer.schedule(deadline: .now(), repeating: .nanoseconds(1_000_000_000 / self.fps))
                        timer.setEventHandler { [weak self] in self?.tick() }
                        self.timer = timer; timer.resume()
                    } else if name == "pause", self.pausedAt == nil {
                        let end = try self.flush(at: at)
                        self.pausedAt = self.epoch! + self.removedUs + end
                    } else if name == "resume", let paused = self.pausedAt {
                        // The pause may have been clamped forward to preserve emitted
                        // packets. A queued quick resume cannot precede that effective edge.
                        let at = max(at, paused)
                        self.removedUs += at - paused
                        self.pausedAt = nil; self.forceKeyframe = true
                        self.resumeTimestamp = at - self.epoch! - self.removedUs
                        self.tick()
                    } else { throw CaptureError(message: "Invalid command state") }
                    c.resume()
                } catch { c.resume(throwing: error) }
            }
        }
    }
    func flush(at: Int64, quiet: Bool = false) throws -> Int64 {
        guard let epoch else { throw CaptureError(message: "Not begun") }
        let requested = max(0, at - epoch - removedUs)
        let end = max(requested, emittedEnd)
        if end > requested, !quiet {
            FileHandle.standardError.write(Data("encoded-capture: late command clamped by \(end - requested) us to preserve emitted video\n".utf8))
        }
        let kept = pending.filter { $0.1 < end }
        for (index, packet) in kept.enumerated() {
            let next = index + 1 < kept.count ? kept[index + 1].1 : end
            try emit(["kind": "packet", "ptsUs": packet.1, "durationUs": next - packet.1, "keyframe": packet.2], packet.0)
        }
        if !kept.isEmpty { emittedEnd = end }
        pending.removeAll()
        return end
    }

    func tick() {
        guard accepting, pausedAt == nil, let image, let session, let epoch else { return }
        do {
            let pts = CMTime(value: hostUs() - epoch - removedUs, timescale: 1_000_000)
            // First frame is exactly zero on the shared epoch.
            let timestamp = resumeTimestamp.map { CMTime(value: $0, timescale: 1_000_000) } ?? (configured ? pts : CMTime.zero)
            resumeTimestamp = nil
            try check(VTCompressionSessionEncodeFrame(session, imageBuffer: image, presentationTimeStamp: timestamp, duration: .invalid, frameProperties: forceKeyframe ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil, sourceFrameRefcon: nil, infoFlagsOut: nil))
            forceKeyframe = false
            try check(VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid))
        } catch { fail(error) }
    }
    func finish(cancel: Bool, at: Int64 = hostUs()) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            queue.async {
                if self.saved { c.resume(); return } // a window close already finished this take
                if !cancel, !self.configured, self.epoch != nil { self.tick() }
                self.accepting = false; self.timer?.cancel(); self.timer = nil; self.image = nil
                defer { if let session = self.session { VTCompressionSessionInvalidate(session) }; self.session = nil }
                do {
                    if !cancel {
                        guard self.epoch != nil, self.configured else { throw CaptureError(message: "No video received") }
                        let edge = self.pausedAt ?? at
                        let end = try self.flush(at: edge)
                        try self.emit(["kind": "end", "endUs": end])
                        self.saved = true
                    }
                    self.pending.removeAll(); c.resume()
                } catch { c.resume(throwing: error) }
            }
        }
    }
}

/// A small window of the helper's own, only for the live integration test (`--test-window`).
@MainActor func makeTestWindow() -> NSWindow {
    NSApplication.shared.setActivationPolicy(.accessory)
    let window = NSWindow(contentRect: NSRect(x: 120, y: 160, width: 320, height: 240), styleMask: [.titled], backing: .buffered, defer: false)
    window.title = "kaipu-encoded-capture-test"
    window.isReleasedWhenClosed = false
    window.orderFrontRegardless()
    var hue: CGFloat = 0
    // Changing colour keeps SCK delivering frames.
    Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
        hue = (hue + 0.05).truncatingRemainder(dividingBy: 1)
        window.backgroundColor = NSColor(hue: hue, saturation: 0.8, brightness: 0.9, alpha: 1)
    }
    return window
}

@main struct EncodedCapture {
    static let usage = "Usage: --encoded-capture-v1 (DISPLAY | --window CGWINDOWID) WIDTH HEIGHT FPS BITRATE [--source-rect X Y W H (display only)] (video only; stdin commands: go|pause|resume|stop HOST_US)"
    /// Stdin commands until `stop` or EOF, then the cooperative teardown shared by every source.
    static func runSession(stream: SCStream, encoder: Encoder) async throws {
        // EOF/cancel terminates the session. Signals terminate without finalizing; main
        // escalates to SIGKILL if a blocked pipe/OS stop prevents cooperative teardown.
        try await stream.startCapture()
        var stopAt = hostUs()
        var cancel = true
        while let line = await Task.detached(operation: { readLine() }).value {
            let parts = line.split(separator: " ")
            guard parts.count == 2, let at = Int64(parts[1]), abs(hostUs() - at) < 10_000_000 else { throw CaptureError(message: "Invalid stamped command") }
            let command = String(parts[0])
            if command == "stop" { stopAt = at; cancel = false; break }
            try await encoder.control(command, at: at)
        }
        do { try await encoder.finish(cancel: cancel, at: stopAt) }
        catch { try? await encoder.finish(cancel: true); throw error }
        // The take is saved (or cancelled). A stream that is already gone (window closed at the
        // same moment, -3808) must not turn that into a failure.
        try? await stream.stopCapture()
    }
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            if args == ["--version"] { print("kaipu-encoded-capture/4 source-rect window-geometry continuous-clock"); return }
            // A plain CLI aborts (CGS_REQUIRE_INIT) on the first window-server call otherwise.
            _ = CGMainDisplayID()
            if args.count >= 2, args[0] == "--encoded-capture-v1", args[1] == "--window" {
                try await runWindow(Array(args.dropFirst(2)))
                return
            }
            // DISPLAY WIDTH HEIGHT FPS BITRATE [--source-rect X Y W H] [--test-allow-unmatched-parent]
            var rest = Array(args.dropFirst(6))
            var sourceRect: CGRect?
            if rest.first == "--source-rect" {
                guard rest.count >= 5, let x = Double(rest[1]), let y = Double(rest[2]), let w = Double(rest[3]), let h = Double(rest[4]),
                      x >= 0, y >= 0, w >= 2, h >= 2, x.isFinite, y.isFinite, w.isFinite, h.isFinite else { throw CaptureError(message: "Invalid --source-rect X Y W H (points, X Y >= 0, W H >= 2)") }
                sourceRect = CGRect(x: x, y: y, width: w, height: h)
                rest.removeFirst(5)
            }
            let allowUnmatchedParent = rest == ["--test-allow-unmatched-parent"]
            guard args.count >= 6, rest.isEmpty || allowUnmatchedParent, args[0] == "--encoded-capture-v1", let displayID = UInt32(args[1]),
                  let width = Int(args[2]), let height = Int(args[3]), let fps = Int(args[4]), let bitrate = Int(args[5]),
                  width >= 2, width <= 7680, width % 2 == 0, height >= 2, height <= 7680, height % 2 == 0,
                  fps >= 1, fps <= 60, bitrate >= 100_000, bitrate <= 100_000_000 else { throw CaptureError(message: usage) }
            guard CGPreflightScreenCaptureAccess() else { throw CaptureError(message: "Screen Recording permission unavailable; no permission requested") }
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first(where: { $0.displayID == displayID }) else { throw CaptureError(message: "Display unavailable") }
            // Exclude this helper's parent Electron application, including floating controls.
            let excluded = content.applications.filter { $0.processID == getppid() }
            guard !excluded.isEmpty || allowUnmatchedParent else { throw CaptureError(message: "Cannot identify recording application for exclusion") }
            let filter = SCContentFilter(display: display, excludingApplications: excluded, exceptingWindows: [])
            let scale = Double(filter.pointPixelScale)
            if let rect = sourceRect {
                guard rect.maxX <= Double(filter.contentRect.width), rect.maxY <= Double(filter.contentRect.height) else { throw CaptureError(message: "Source rect must lie inside the display") }
            }
            let sourcePointsW = sourceRect.map { Double($0.width) } ?? Double(filter.contentRect.width)
            let sourcePointsH = sourceRect.map { Double($0.height) } ?? Double(filter.contentRect.height)
            let nativeW = sourcePointsW * scale
            let nativeH = sourcePointsH * scale
            if sourceRect == nil {
                // Whole display: the original rules, unchanged.
                guard Double(width) <= nativeW, Double(height) <= nativeH, abs(Double(width) / Double(height) - nativeW / nativeH) < 0.01 else { throw CaptureError(message: "Dimensions must preserve display aspect and cannot upscale") }
            } else {
                // Cropped: the planner rounds each side to an even number (odd sides go UP by 1 px),
                // so allow 2 px of slack and check the aspect on the smaller-error axis.
                // Mirrored by sourceRectFit in src/main/recording/native/source-rect-fit.ts (tested).
                let ratio = nativeW / nativeH
                let aspectError = ratio >= 1 ? abs(Double(height) - Double(width) / ratio) : abs(Double(width) - Double(height) * ratio)
                guard aspectError <= 2 else { throw CaptureError(message: "Dimensions must preserve source aspect") }
                guard Double(width) <= nativeW + 2, Double(height) <= nativeH + 2 else { throw CaptureError(message: "Dimensions cannot upscale the source") }
            }
            let config = SCStreamConfiguration()
            if let sourceRect { config.sourceRect = sourceRect }
            config.showsCursor = false; config.width = width; config.height = height
            config.queueDepth = 3; config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
            config.pixelFormat = kCVPixelFormatType_32BGRA; config.capturesAudio = false
            let encoder = try Encoder(width: width, height: height, fps: fps, bitrate: bitrate)
            let stream = SCStream(filter: filter, configuration: config, delegate: encoder)
            try stream.addStreamOutput(encoder, type: .screen, sampleHandlerQueue: encoder.queue)
            try await runSession(stream: stream, encoder: encoder)
        } catch {
            FileHandle.standardError.write(Data("encoded-capture: \(error)\n".utf8)); exit(1)
        }
    }
    /// WINDOWID WIDTH HEIGHT FPS BITRATE [--test-window]
    static func runWindow(_ args: [String]) async throws {
        let rest = Array(args.dropFirst(5))
        let testWindow = rest.contains("--test-window")
        guard args.count >= 5, !rest.contains("--source-rect"), rest.allSatisfy({ $0 == "--test-window" }),
              let windowID = UInt32(args[0]), let width = Int(args[1]), let height = Int(args[2]), let fps = Int(args[3]), let bitrate = Int(args[4]),
              windowID >= 1 || testWindow,
              width >= 2, width <= 7680, width % 2 == 0, height >= 2, height <= 7680, height % 2 == 0,
              fps >= 1, fps <= 60, bitrate >= 100_000, bitrate <= 100_000_000 else { throw CaptureError(message: usage + " (--window excludes DISPLAY, --source-rect and --test-allow-unmatched-parent)") }
        guard CGPreflightScreenCaptureAccess() else { throw CaptureError(message: "Screen Recording permission unavailable; no permission requested") }
        var targetID = windowID
        var keepAlive: NSWindow?
        if testWindow {
            let made = await MainActor.run { makeTestWindow() }
            targetID = UInt32(await MainActor.run { made.windowNumber })
            keepAlive = made
        }
        // Off-screen windows (minimized, other Space) are still capturable targets, so do not filter.
        var found: SCWindow?
        for _ in 0..<20 {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            found = content.windows.first(where: { $0.windowID == targetID })
            if found != nil || !testWindow { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        guard let window = found else { throw CaptureError(message: "Window unavailable") }
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        config.showsCursor = false; config.width = width; config.height = height
        config.scalesToFit = true; config.ignoreShadowsSingleWindow = true
        config.queueDepth = 3; config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
        config.pixelFormat = kCVPixelFormatType_32BGRA; config.capturesAudio = false
        let encoder = try Encoder(width: width, height: height, fps: fps, bitrate: bitrate, windowMode: true)
        let stream = SCStream(filter: filter, configuration: config, delegate: encoder)
        try stream.addStreamOutput(encoder, type: .screen, sampleHandlerQueue: encoder.queue)
        try await runSession(stream: stream, encoder: encoder)
        withExtendedLifetime(keepAlive) {}
    }
}
