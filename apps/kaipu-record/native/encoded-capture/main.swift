// Experimental live video-only transport. Never selected by the recorder UI.
import Foundation
import Darwin
import ScreenCaptureKit
import VideoToolbox
import CoreGraphics

struct CaptureError: Error { let message: String }
func hostUs() -> Int64 { Int64(CMTimeGetSeconds(CMClockGetTime(CMClockGetHostTimeClock())) * 1_000_000) }
func check(_ status: OSStatus) throws { if status != noErr { throw CaptureError(message: "Native status \(status)") } }

final class Encoder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "kaipu.encoded-capture")
    var session: VTCompressionSession?
    var image: CVPixelBuffer?
    var timer: DispatchSourceTimer?
    var epoch: Int64?
    var pending: (Data, Int64, Bool)?
    var configured = false
    var failure: Error?
    var accepting = true
    let fps: Int
    init(width: Int, height: Int, fps: Int, bitrate: Int) throws {
        self.fps = fps
        super.init()
        try check(VTCompressionSessionCreate(allocator: nil, width: Int32(width), height: Int32(height), codecType: kCMVideoCodecType_H264, encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: { ref, _, status, _, sample in
            let sink = Unmanaged<Encoder>.fromOpaque(ref!).takeUnretainedValue()
            do { try check(status); if let sample { try sink.encoded(sample) } }
            catch { sink.failure = error }
        }, refcon: Unmanaged.passUnretained(self).toOpaque(), compressionSessionOut: &session))
        guard let session else { throw CaptureError(message: "Missing encoder") }
        let properties: [(CFString, CFTypeRef)] = [(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue!), (kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse!), (kVTCompressionPropertyKey_AverageBitRate, bitrate as CFNumber), (kVTCompressionPropertyKey_ExpectedFrameRate, fps as CFNumber), (kVTCompressionPropertyKey_MaxKeyFrameInterval, (fps * 2) as CFNumber)]
        for (key, value) in properties {
            try check(VTSessionSetProperty(session, key: key, value: value))
        }
        try check(VTCompressionSessionPrepareToEncodeFrames(session))
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
            try emit(["kind": "config", "version": 1, "codec": codec, "width": Int(dims.width), "height": Int(dims.height), "epochUs": epoch], avcc)
            configured = true
        }
        let pts = Int64((CMTimeGetSeconds(sample.presentationTimeStamp) * 1_000_000).rounded())
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let key = (attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) != true
        let size = CMBlockBufferGetDataLength(block)
        guard size > 0, size <= 8 * 1024 * 1024 else { throw CaptureError(message: "Oversize AVC packet") }
        var data = Data(count: size)
        try data.withUnsafeMutableBytes { try check(CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: size, destination: $0.baseAddress!)) }
        if let previous = pending {
            guard pts > previous.1 else { throw CaptureError(message: "Nonmonotonic encoder PTS") }
            try emit(["kind": "packet", "ptsUs": previous.1, "durationUs": pts - previous.1, "keyframe": previous.2], previous.0)
        }
        pending = (data, pts, key)
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) { queue.async { self.failure = error } }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard accepting, type == .screen, sample.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              attachments.first?[.status] as? Int == SCFrameStatus.complete.rawValue,
              let buffer = sample.imageBuffer else { return }
        image = buffer // One retained surface; timer encodes it even while SCK is idle.
        if timer == nil {
            epoch = hostUs()
            let timer = DispatchSource.makeTimerSource(queue: queue)
            timer.schedule(deadline: .now(), repeating: .nanoseconds(1_000_000_000 / fps))
            timer.setEventHandler { [weak self] in self?.tick() }
            self.timer = timer; timer.resume()
        }
    }
    func tick() {
        guard accepting, failure == nil, let image, let session, let epoch else { return }
        do {
            let pts = CMTime(value: hostUs() - epoch, timescale: 1_000_000)
            // First frame is exactly zero on the shared epoch.
            let timestamp = configured ? pts : CMTime.zero
            try check(VTCompressionSessionEncodeFrame(session, imageBuffer: image, presentationTimeStamp: timestamp, duration: .invalid, frameProperties: nil, sourceFrameRefcon: nil, infoFlagsOut: nil))
            try check(VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid))
        } catch { failure = error }
    }
    func finish(cancel: Bool) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            queue.async {
                self.accepting = false; self.timer?.cancel(); self.timer = nil; self.image = nil
                defer { if let session = self.session { VTCompressionSessionInvalidate(session) }; self.session = nil }
                do {
                    if !cancel {
                        if let failure = self.failure { throw failure }
                        guard let epoch = self.epoch, let last = self.pending else { throw CaptureError(message: "No video received") }
                        let end = max(last.1 + 1, hostUs() - epoch)
                        try self.emit(["kind": "packet", "ptsUs": last.1, "durationUs": end - last.1, "keyframe": last.2], last.0)
                        try self.emit(["kind": "end", "endUs": end])
                    }
                    self.pending = nil; c.resume()
                } catch { c.resume(throwing: error) }
            }
        }
    }
}

@main struct EncodedCapture {
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            if args == ["--version"] { print("kaipu-encoded-capture/1 video-only no-pause"); return }
            guard args.count == 6, args[0] == "--encoded-capture-v1", let displayID = UInt32(args[1]),
                  let width = Int(args[2]), let height = Int(args[3]), let fps = Int(args[4]), let bitrate = Int(args[5]),
                  width >= 2, width <= 7680, width % 2 == 0, height >= 2, height <= 7680, height % 2 == 0,
                  fps >= 1, fps <= 60, bitrate >= 100_000, bitrate <= 100_000_000 else { throw CaptureError(message: "Usage: --encoded-capture-v1 DISPLAY WIDTH HEIGHT FPS BITRATE (video only, no pause)") }
            guard CGPreflightScreenCaptureAccess() else { throw CaptureError(message: "Screen Recording permission unavailable; no permission requested") }
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first(where: { $0.displayID == displayID }) else { throw CaptureError(message: "Display unavailable") }
            let filter = SCContentFilter(display: display, excludingWindows: [])
            let nativeW = Double(filter.contentRect.width) * Double(filter.pointPixelScale)
            let nativeH = Double(filter.contentRect.height) * Double(filter.pointPixelScale)
            guard Double(width) <= nativeW, Double(height) <= nativeH, abs(Double(width) / Double(height) - nativeW / nativeH) < 0.01 else { throw CaptureError(message: "Dimensions must preserve display aspect and cannot upscale") }
            let config = SCStreamConfiguration()
            config.showsCursor = false; config.width = width; config.height = height
            config.queueDepth = 3; config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
            config.pixelFormat = kCVPixelFormatType_32BGRA; config.capturesAudio = false
            let encoder = try Encoder(width: width, height: height, fps: fps, bitrate: bitrate)
            let stream = SCStream(filter: filter, configuration: config, delegate: encoder)
            try stream.addStreamOutput(encoder, type: .screen, sampleHandlerQueue: encoder.queue)
            // EOF/cancel terminates the session. Signals terminate without finalizing; main
            // escalates to SIGKILL if a blocked pipe/OS stop prevents cooperative teardown.
            try await stream.startCapture()
            let cancel = await Task.detached { () -> Bool in
                let command = readLine()
                return command != "stop"
            }.value
            do { try await stream.stopCapture(); try await encoder.finish(cancel: cancel) }
            catch { try? await encoder.finish(cancel: true); throw error }
        } catch {
            FileHandle.standardError.write(Data("encoded-capture: \(error)\n".utf8)); exit(1)
        }
    }
}
