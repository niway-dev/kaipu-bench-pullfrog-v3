// Diagnostic only. No production recorder or cursor-overlay integration.
import Foundation
import Darwin
import ScreenCaptureKit
import AVFoundation
import CoreGraphics

struct ProbeError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct Options {
    let output: URL
    let displayID: UInt32
    let audio: Bool
    let rect: CGRect?

    init(_ args: [String]) throws {
        guard args.first == "--cursor-sck-diagnostic", args.count >= 3,
              let display = UInt32(args[1]) else {
            throw ProbeError(message: "Usage: --cursor-sck-diagnostic DISPLAY_ID NEW_OUTPUT_DIRECTORY [--audio] [--rect x,y,width,height]")
        }
        displayID = display
        output = URL(fileURLWithPath: args[2], isDirectory: true)
        var audio = false
        var rect: CGRect?
        var index = 3
        while index < args.count {
            switch args[index] {
            case "--audio": audio = true
            case "--rect":
                index += 1
                guard index < args.count else { throw ProbeError(message: "Missing rect") }
                let tokens = args[index].split(separator: ",", omittingEmptySubsequences: false)
                let values = tokens.compactMap { Double($0) }
                guard tokens.count == 4, values.count == 4, values.allSatisfy({ $0.isFinite }),
                      values[0] >= 0, values[1] >= 0, values[2] > 0, values[3] > 0 else {
                    throw ProbeError(message: "Rect must be finite x,y,width,height in display points")
                }
                rect = CGRect(x: values[0], y: values[1], width: values[2], height: values[3])
            default: throw ProbeError(message: "Unknown option: \(args[index])")
            }
            index += 1
        }
        self.audio = audio
        self.rect = rect
    }
}

// One serial callback queue owns the writer and counters. Never enqueue an unbounded
// frame copy: AVAssetWriter readiness drops are counted, and SCK queueDepth is bounded.
final class Sink: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "kaipu.cursor-sck-diagnostic.samples")
    let writer: AVAssetWriter
    let video: AVAssetWriterInput
    let audio: AVAssetWriterInput?
    var epoch: CMTime?
    var lastFrame: CMSampleBuffer? // One retained frame, including on an idle desktop.
    var lastVideo: CMTime?
    var lastAudio: CMTime?
    var videoCount = 0
    var audioCount = 0
    var videoDropped = 0
    var audioDropped = 0
    var failure: String?
    var accepting = true

    init(url: URL, width: Int, height: Int, captureAudio: Bool) throws {
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        video = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAllowFrameReorderingKey: false],
        ])
        audio = captureAudio ? AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2,
        ]) : nil
        super.init()
        video.expectsMediaDataInRealTime = true
        guard writer.canAdd(video) else { throw ProbeError(message: "Cannot add video writer") }
        writer.add(video)
        if let audio {
            audio.expectsMediaDataInRealTime = true
            guard writer.canAdd(audio) else { throw ProbeError(message: "Cannot add audio writer") }
            writer.add(audio)
        }
        guard writer.startWriting() else { throw writer.error ?? ProbeError(message: "Writer did not start") }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async { self.failure = error.localizedDescription; self.accepting = false }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard accepting, sample.isValid else { return }
        let pts = sample.presentationTimeStamp
        guard pts.isNumeric else { return }
        if type == .screen {
            guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let status = attachments.first?[.status] as? Int,
                  status == SCFrameStatus.complete.rawValue else { return }
            if epoch == nil { epoch = pts; writer.startSession(atSourceTime: pts) }
            guard lastVideo == nil || CMTimeCompare(pts, lastVideo!) > 0 else { videoDropped += 1; return }
            guard video.isReadyForMoreMediaData else { videoDropped += 1; return }
            if video.append(sample) { videoCount += 1; lastVideo = pts; lastFrame = sample }
            else { failure = writer.error?.localizedDescription ?? "Video append failed"; accepting = false }
        } else if type == .audio, let audio {
            // Audio before the first complete frame cannot establish a different epoch.
            guard let epoch, CMTimeCompare(pts, epoch) >= 0,
                  lastAudio == nil || CMTimeCompare(pts, lastAudio!) > 0,
                  audio.isReadyForMoreMediaData else { audioDropped += 1; return }
            if audio.append(sample) { audioCount += 1; lastAudio = pts }
            else { failure = writer.error?.localizedDescription ?? "Audio append failed"; accepting = false }
        }
    }

    func cancel() async -> String? {
        await withCheckedContinuation { continuation in
            queue.async {
                self.accepting = false
                self.lastFrame = nil
                self.writer.cancelWriting()
                continuation.resume(returning: self.failure)
            }
        }
    }

    func finish() async throws -> [String: Any] {
        let stopPTS = CMClockGetTime(CMClockGetHostTimeClock())
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                self.accepting = false
                // SCK emits idle notifications instead of repeated complete frames.
                // Retain one image and give the movie a final frame at the host-clock
                // stop time, preserving the recording duration without an unbounded queue.
                if let frame = self.lastFrame, let last = self.lastVideo,
                   CMTimeCompare(CMTimeSubtract(stopPTS, CMTime(value: 1, timescale: 30)), last) > 0 {
                    var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 30), presentationTimeStamp: CMTimeSubtract(stopPTS, CMTime(value: 1, timescale: 30)), decodeTimeStamp: .invalid)
                    var finalFrame: CMSampleBuffer?
                    let status = CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: frame, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleBufferOut: &finalFrame)
                    if status != noErr || finalFrame == nil || !self.video.isReadyForMoreMediaData || !self.video.append(finalFrame!) {
                        self.failure = "Unable to append final duration frame"
                    }
                }
                if self.epoch != nil { self.writer.endSession(atSourceTime: stopPTS) }
                self.lastFrame = nil
                self.video.markAsFinished(); self.audio?.markAsFinished()
                continuation.resume()
            }
        }
        if epoch == nil { writer.cancelWriting(); throw ProbeError(message: failure ?? "No complete video frames received") }
        await writer.finishWriting()
        guard writer.status == .completed, failure == nil else {
            throw ProbeError(message: failure ?? writer.error?.localizedDescription ?? "Writer did not complete")
        }
        return ["videoSamples": videoCount, "audioSamples": audioCount,
                "videoBackpressureDrops": videoDropped, "audioPreEpochOrBackpressureDrops": audioDropped,
                "epoch": ["value": epoch!.value, "timescale": epoch!.timescale],
                "captureDurationSeconds": CMTimeGetSeconds(CMTimeSubtract(stopPTS, epoch!)),
                "lastLiveVideoSeconds": lastVideo.map { CMTimeGetSeconds(CMTimeSubtract($0, epoch!)) } ?? 0]
    }
}

@main struct CursorCaptureProbe {
    static func main() async {
        do {
            let options = try Options(Array(CommandLine.arguments.dropFirst()))
            // Do not trigger a new permission grant from a CLI probe. Identity is the
            // helper/launching host, not proof of the eventual signed app's permissions.
            guard CGPreflightScreenCaptureAccess() else {
                throw ProbeError(message: "Screen Recording permission unavailable for this helper/host; no permission requested")
            }
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first(where: { $0.displayID == options.displayID }) else {
                throw ProbeError(message: "Display ID unavailable; available IDs: \(content.displays.map { $0.displayID })")
            }
            let filter = SCContentFilter(display: display, excludingWindows: [])
            let bounds = CGRect(origin: .zero, size: filter.contentRect.size)
            let rect = options.rect ?? bounds
            guard bounds.contains(rect) else { throw ProbeError(message: "Rect exceeds selected display bounds") }
            let scale = Double(filter.pointPixelScale)
            // H.264 requires even output dimensions; crop stays in display points.
            let width = max(2, Int(rect.width * scale) / 2 * 2)
            let height = max(2, Int(rect.height * scale) / 2 * 2)
            let config = SCStreamConfiguration()
            config.showsCursor = false
            config.width = width; config.height = height
            config.sourceRect = rect
            config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
            config.queueDepth = 3
            config.pixelFormat = kCVPixelFormatType_32BGRA
            config.capturesAudio = options.audio
            config.sampleRate = 48000; config.channelCount = 2
            config.excludesCurrentProcessAudio = true
            // A fresh directory prevents overwriting an existing recording or report.
            guard mkdir(options.output.path, 0o700) == 0 else {
                throw ProbeError(message: "Cannot create fresh output directory: \(String(cString: strerror(errno)))")
            }
            let sink = try Sink(url: options.output.appendingPathComponent("capture.mov"), width: width, height: height, captureAudio: options.audio)
            let stream = SCStream(filter: filter, configuration: config, delegate: sink)
            try stream.addStreamOutput(sink, type: .screen, sampleHandlerQueue: sink.queue)
            if options.audio { try stream.addStreamOutput(sink, type: .audio, sampleHandlerQueue: sink.queue) }
            var report: [String: Any]
            do {
                try await stream.startCapture()
                try await Task.sleep(nanoseconds: 8_000_000_000)
                try await stream.stopCapture()
                report = try await sink.finish()
            } catch {
                let originalFailure = await sink.cancel()
                throw ProbeError(message: originalFailure ?? error.localizedDescription)
            }
            report["schemaVersion"] = 1
            report["captureBackend"] = "ScreenCaptureKit diagnostic / AVAssetWriter"
            report["showsCursorRequested"] = false
            report["cursorPixels"] = "not inspected"
            report["audioRequested"] = options.audio
            report["audibleSystemAudio"] = "not inspected"
            report["displayID"] = options.displayID
            report["sourceRectPoints"] = [rect.origin.x, rect.origin.y, rect.width, rect.height]
            report["outputPixels"] = [width, height]
            report["queueDepth"] = 3
            report["osVersion"] = ProcessInfo.processInfo.operatingSystemVersionString
            let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: options.output.appendingPathComponent("report.json"))
            print("Diagnostic written to \(options.output.path); inspect pixels and sound before assigning a verdict")
        } catch {
            FileHandle.standardError.write(Data("cursor-sck-diagnostic: \(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
}
