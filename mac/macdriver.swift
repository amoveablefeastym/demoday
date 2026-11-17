// macdriver: drive and record a native macOS app for demoforge.
//
//   macdriver check [--prompt]
//   macdriver probe --app <X.app> --out <dir> [-- <app args>]
//   macdriver run   --app <X.app> --out <dir> --script <actions.json> [-- <app args>]
//
// Finds controls through the Accessibility API, moves the real mouse/keyboard with
// CGEvents, and records ONLY the app's window with ScreenCaptureKit (no system cursor;
// demoforge redraws it). Writes <out>/raw.mp4 + <out>/events.json in the same shape as
// the Playwright recorder, so the edit + Remotion stages are shared.
//
// Needs (for the app that launches it, e.g. VS Code or Terminal):
//   System Settings → Privacy & Security → Accessibility, and → Screen & System Audio Recording.

import AppKit
import ApplicationServices
import ScreenCaptureKit
import UniformTypeIdentifiers

setvbuf(stdout, nil, _IONBF, 0)
_ = NSApplication.shared
NSApp.setActivationPolicy(.prohibited)

struct Fail: Error, CustomStringConvertible {
    let description: String
    init(_ s: String) { description = s }
}

// MARK: - Args

nonisolated(unsafe) var argv = Array(CommandLine.arguments.dropFirst())
nonisolated(unsafe) var appArgs: [String] = []
if let i = argv.firstIndex(of: "--") {
    appArgs = Array(argv[(i + 1)...])
    argv = Array(argv[..<i])
}
let command = argv.first ?? "help"
func opt(_ name: String) -> String? {
    guard let i = argv.firstIndex(of: name), i + 1 < argv.count else { return nil }
    return argv[i + 1]
}

// MARK: - Accessibility

func axString(_ e: AXUIElement, _ a: String) -> String {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, a as CFString, &v) == .success, let s = v as? String else { return "" }
    return s
}

func axValue(_ e: AXUIElement, _ a: String) -> AXValue? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, a as CFString, &v) == .success, let v,
          CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
    return (v as! AXValue)
}

func axChildren(_ e: AXUIElement, _ a: String = kAXChildrenAttribute) -> [AXUIElement] {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, a as CFString, &v) == .success, let arr = v as? [AXUIElement] else { return [] }
    return arr
}

func axFrame(_ e: AXUIElement) -> CGRect? {
    guard let pv = axValue(e, kAXPositionAttribute), let sv = axValue(e, kAXSizeAttribute) else { return nil }
    var p = CGPoint.zero, s = CGSize.zero
    AXValueGetValue(pv, .cgPoint, &p)
    AXValueGetValue(sv, .cgSize, &s)
    return CGRect(origin: p, size: s)
}

struct Node {
    let el: AXUIElement
    let role: String
    let title: String, desc: String, value: String, placeholder: String, id: String
    let frame: CGRect?
    let depth: Int
    var label: String { [title, desc, value].filter { !$0.isEmpty }.joined(separator: " ") }
}

func walk(_ root: AXUIElement, limit: Int = 3000) -> [Node] {
    var out: [Node] = []
    func visit(_ e: AXUIElement, _ d: Int) {
        guard out.count < limit, d < 40 else { return }
        out.append(Node(el: e, role: axString(e, kAXRoleAttribute),
                        title: axString(e, kAXTitleAttribute), desc: axString(e, kAXDescriptionAttribute),
                        value: String(axString(e, kAXValueAttribute).prefix(200)),
                        placeholder: axString(e, kAXPlaceholderValueAttribute), id: axString(e, "AXIdentifier"),
                        frame: axFrame(e), depth: d))
        for c in axChildren(e) { visit(c, d + 1) }
    }
    visit(root, 0)
    return out
}

let interactive: Set<String> = ["AXButton", "AXTextArea", "AXTextField", "AXCheckBox", "AXLink", "AXMenuButton",
                                "AXPopUpButton", "AXRadioButton", "AXSlider", "AXComboBox", "AXRow", "AXCell", "AXTab"]

/// Accessibility snapshot in roughly the shape of Playwright's aria snapshot, with window-relative frames.
func dump(_ window: AXUIElement, origin: CGPoint) -> String {
    walk(window).compactMap { n -> String? in
        let named = !n.label.isEmpty || !n.id.isEmpty || !n.placeholder.isEmpty
        guard named || interactive.contains(n.role) else { return nil }
        var s = String(repeating: "  ", count: min(n.depth, 14)) + "- \(n.role)"
        if !n.label.isEmpty { s += " \"\(n.label.replacingOccurrences(of: "\n", with: " ").prefix(90))\"" }
        if !n.id.isEmpty { s += " id=\(n.id)" }
        if !n.placeholder.isEmpty { s += " placeholder=\"\(n.placeholder)\"" }
        if let f = n.frame {
            s += " @\(Int(f.minX - origin.x)),\(Int(f.minY - origin.y)) \(Int(f.width))x\(Int(f.height))"
        }
        return s
    }.joined(separator: "\n")
}

let roleMap: [String: [String]] = [
    "button": ["AXButton", "AXMenuButton", "AXPopUpButton"],
    "textbox": ["AXTextArea", "AXTextField", "AXComboBox"],
    "link": ["AXLink"], "checkbox": ["AXCheckBox"], "radio": ["AXRadioButton"], "tab": ["AXRadioButton", "AXTab"],
    "menuitem": ["AXMenuItem"], "img": ["AXImage"], "image": ["AXImage"], "text": ["AXStaticText"],
    "row": ["AXRow", "AXCell"], "slider": ["AXSlider"],
]

/// Same target vocabulary as the web recorder: id | role+name | label | placeholder | text.
func find(_ t: [String: String], in window: AXUIElement, bounds: CGRect) -> Node? {
    let lower = { (s: String) in s.lowercased() }
    let visible = walk(window).filter { n in
        guard let f = n.frame, f.width > 2, f.height > 2 else { return false }
        return f.intersects(bounds)
    }
    if let id = t["id"] { return visible.first { $0.id == id } }
    if let ph = t["placeholder"] { return visible.first { lower($0.placeholder).contains(lower(ph)) } }
    let name = t["name"] ?? t["label"] ?? t["text"]
    var pool = visible
    if let role = t["role"] {
        let roles = roleMap[role.lowercased()] ?? [role.hasPrefix("AX") ? role : "AX" + role.capitalized]
        pool = pool.filter { roles.contains($0.role) }
    }
    guard let name else { return pool.first }
    let n = lower(name)
    return pool.first { lower($0.label) == n } ?? pool.first { lower($0.label).contains(n) }
}

// MARK: - Launch

func launch(_ path: String) async throws -> NSRunningApplication {
    let cfg = NSWorkspace.OpenConfiguration()
    cfg.arguments = appArgs
    cfg.createsNewApplicationInstance = true
    cfg.activates = true
    return try await NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: path), configuration: cfg)
}

func mainWindow(_ app: AXUIElement) -> (AXUIElement, CGRect)? {
    axChildren(app, kAXWindowsAttribute)
        .compactMap { w in axFrame(w).map { (w, $0) } }
        .filter { $0.1.width > 300 && $0.1.height > 200 }
        .max { $0.1.width * $0.1.height < $1.1.width * $1.1.height }
}

func waitForWindow(_ app: NSRunningApplication) async throws -> (AXUIElement, CGRect) {
    let ax = AXUIElementCreateApplication(app.processIdentifier)
    for _ in 0..<100 {
        if let w = mainWindow(ax) {
            try await Task.sleep(nanoseconds: 900_000_000) // let first-paint animations settle
            return mainWindow(ax) ?? w
        }
        try await Task.sleep(nanoseconds: 150_000_000)
    }
    throw Fail("The app launched but never showed a window (waited 15s). Does it need a launch argument to open its window?")
}

func scWindow(pid: pid_t) async throws -> SCWindow {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    guard let w = content.windows
        .filter({ $0.owningApplication?.processID == pid && $0.frame.width > 300 })
        .max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height })
    else { throw Fail("ScreenCaptureKit can't see the app's window.") }
    return w
}

func writePNG(_ img: CGImage, _ url: URL) throws {
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        throw Fail("can't write \(url.path)")
    }
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
}

// MARK: - Input

nonisolated(unsafe) let src = CGEventSource(stateID: .hidSystemState)
nonisolated(unsafe) var mouse = CGPoint.zero // global, top-left origin (same space as AX and CGEvent)

func sleep(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }

func ease(_ k: Double) -> Double { k < 0.5 ? 4 * k * k * k : 1 - pow(-2 * k + 2, 3) / 2 }

let keyCodes: [String: CGKeyCode] = [
    "enter": 36, "return": 36, "tab": 48, "space": 49, "backspace": 51, "delete": 51, "escape": 53, "esc": 53,
    "arrowleft": 123, "arrowright": 124, "arrowdown": 125, "arrowup": 126, "home": 115, "end": 119,
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13,
    "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26,
    "8": 28, "0": 29, "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
]

/// "Enter", "Meta+K", "ControlOrMeta+A", "Shift+Tab", "Alt+ArrowUp".
func press(_ combo: String) async throws {
    var flags: CGEventFlags = []
    var key = ""
    for part in combo.split(separator: "+").map({ $0.lowercased() }) {
        switch part {
        case "meta", "cmd", "command", "controlormeta": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt", "option": flags.insert(.maskAlternate)
        case "control", "ctrl": flags.insert(.maskControl)
        default: key = part
        }
    }
    guard let code = keyCodes[key] else { throw Fail("unknown key '\(key)' in '\(combo)'") }
    for down in [true, false] {
        let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down)
        e?.flags = flags
        post(e)
        await sleep(0.02)
    }
}

func typeText(_ text: String) async throws {
    let delay = max(0.018, min(0.055, 2.6 / Double(max(1, text.count))))
    for ch in text {
        if ch == "\n" { try await press("Enter"); continue }
        let utf16 = Array(String(ch).utf16)
        for down in [true, false] {
            let e = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: down)
            e?.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
            post(e)
        }
        await sleep(delay)
    }
}

// MARK: - Recording session

final class Session: NSObject, SCRecordingOutputDelegate, SCStreamDelegate, @unchecked Sendable {
    var t0: Date?
    var finished = false
    var failure: Error?
    var stream: SCStream?
    var origin = CGPoint.zero
    var events: [[String: Any]] = []
    var cursor: [[String: Any]] = []
    var failures: [[String: Any]] = []

    func now() -> Double { t0.map { Date().timeIntervalSince($0) } ?? 0 }

    func start(_ w: SCWindow, scale: CGFloat, to url: URL) async throws {
        let cfg = SCStreamConfiguration()
        cfg.width = Int(w.frame.width * scale)
        cfg.height = Int(w.frame.height * scale)
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        cfg.showsCursor = false
        cfg.queueDepth = 8
        let rc = SCRecordingOutputConfiguration()
        rc.outputURL = url
        rc.outputFileType = .mp4
        rc.videoCodecType = .h264
        let s = SCStream(filter: SCContentFilter(desktopIndependentWindow: w), configuration: cfg, delegate: self)
        try s.addRecordingOutput(SCRecordingOutput(configuration: rc, delegate: self))
        try await s.startCapture()
        stream = s
        for _ in 0..<100 where t0 == nil && failure == nil { await sleep(0.05) }
        if let failure { throw failure }
        if t0 == nil { throw Fail("Recording never started.") }
    }

    func stop() async throws {
        try await stream?.stopCapture()
        for _ in 0..<100 where !finished && failure == nil { await sleep(0.05) }
    }

    func recordingOutputDidStartRecording(_ o: SCRecordingOutput) { t0 = Date() }
    func recordingOutputDidFinishRecording(_ o: SCRecordingOutput) { finished = true }
    func recordingOutput(_ o: SCRecordingOutput, didFailWithError e: Error) { failure = e }
    func stream(_ s: SCStream, didStopWithError e: Error) { failure = e }

    func mark(_ click: Bool = false) {
        var k: [String: Any] = ["t": now(), "x": mouse.x - origin.x, "y": mouse.y - origin.y]
        if click { k["click"] = true }
        cursor.append(k)
    }

    func glide(to p: CGPoint) async {
        let from = mouse
        let n = max(12, min(40, Int(hypot(p.x - from.x, p.y - from.y) / 22)))
        mark()
        for i in 1...n {
            let k = ease(Double(i) / Double(n))
            mouse = CGPoint(x: from.x + (p.x - from.x) * k, y: from.y + (p.y - from.y) * k)
            post(CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: mouse, mouseButton: .left))
            await sleep(0.014)
        }
        mark()
    }

    func click() async {
        mark(true)
        for type in [CGEventType.leftMouseDown, .leftMouseUp] {
            let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: mouse, mouseButton: .left)
            e?.setIntegerValueField(.mouseEventClickState, value: 1)
            post(e)
            await sleep(0.06)
        }
    }
}

// MARK: - Commands

enum Permission: String {
    case accessibility = "Accessibility"
    case screen = "Screen & System Audio Recording"
    var pane: String {
        self == .accessibility
            ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            : "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    }
}

/// Which permissions are missing. With `open`, fire macOS's own prompt and open the exact Settings pane for each.
@discardableResult
func checkPermissions(needScreen: Bool, open: Bool) -> [Permission] {
    let ax = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): open] as CFDictionary)
    let sr = CGPreflightScreenCaptureAccess()
    var missing: [Permission] = []
    if !ax { missing.append(.accessibility) }
    if needScreen && !sr { missing.append(.screen) }
    guard open, !missing.isEmpty else { return missing }
    if missing.contains(.screen) { CGRequestScreenCaptureAccess() } // registers us in the list + shows the system prompt
    for (i, p) in missing.enumerated() {
        // Stagger so the second pane doesn't replace the first before it's seen.
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 1.5) {
            NSWorkspace.shared.open(URL(string: p.pane)!)
        }
    }
    RunLoop.main.run(until: Date().addingTimeInterval(Double(missing.count) * 1.5 + 0.3))
    let host = hostAppName() ?? "the app you run demoforge from (VS Code, Terminal…)"
    print("""

      ⚙︎  Opened System Settings → Privacy & Security → \(missing.map(\.rawValue).joined(separator: " and ")).
         Turn ON “\(host)” there (use the + button if it isn't listed),
         then QUIT and reopen \(host) — macOS only applies this after a restart.

    """)
    return missing
}

/// macOS grants these permissions to the GUI app at the top of our process tree (VS Code, Terminal, iTerm…).
func hostAppName() -> String? {
    var pid = getppid()
    for _ in 0..<30 where pid > 1 {
        if let app = NSRunningApplication(processIdentifier: pid), let url = app.bundleURL, app.activationPolicy == .regular {
            return url.deletingPathExtension().lastPathComponent // the name System Settings lists, e.g. "Visual Studio Code"
        }
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0 else { return nil }
        pid = info.kp_eproc.e_ppid
    }
    return nil
}

func requireTrust(screen: Bool = true) throws {
    let missing = checkPermissions(needScreen: screen, open: true)
    if !missing.isEmpty {
        throw Fail("Missing macOS permission: \(missing.map(\.rawValue).joined(separator: " + ")). Settings has been opened for you; grant it, restart the host app, and re-run.")
    }
}

func run() async throws {
    switch command {
    case "check":
        let missing = checkPermissions(needScreen: true, open: argv.contains("--open") || argv.contains("--prompt"))
        print("{\"accessibility\": \(!missing.contains(.accessibility)), \"screenRecording\": \(!missing.contains(.screen))}")
        exit(missing.isEmpty ? 0 : 3)

    case "probe":
        try requireTrust(screen: false)
        // Screen Recording is only needed later for recording; ask for it now so it's sorted before then.
        checkPermissions(needScreen: true, open: true)
        guard let app = opt("--app"), let out = opt("--out") else { throw Fail("probe needs --app and --out") }
        let running = try await launch(app)
        defer { running.terminate() }
        let (win, frame) = try await waitForWindow(running)
        if CGPreflightScreenCaptureAccess() {
            let scw = try await scWindow(pid: running.processIdentifier)
            let cfg = SCStreamConfiguration()
            cfg.width = Int(scw.frame.width * 2)
            cfg.height = Int(scw.frame.height * 2)
            cfg.showsCursor = false
            let img = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: scw), configuration: cfg)
            try writePNG(img, URL(fileURLWithPath: out).appendingPathComponent("probe.png"))
        } else {
            print("  ! No Screen Recording permission: skipped the screenshot (the control tree still works).")
        }
        let tree = dump(win, origin: frame.origin)
        try tree.write(toFile: out + "/probe.aria.yml", atomically: true, encoding: .utf8)
        let meta: [String: Any] = ["title": running.localizedName ?? "", "width": frame.width, "height": frame.height]
        try JSONSerialization.data(withJSONObject: meta).write(to: URL(fileURLWithPath: out + "/probe.window.json"))
        print("  probed \(running.localizedName ?? app): window \(Int(frame.width))x\(Int(frame.height))")

    case "run":
        try requireTrust()
        guard let app = opt("--app"), let out = opt("--out"), let scriptPath = opt("--script") else {
            throw Fail("run needs --app, --out and --script")
        }
        let script = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: scriptPath))) as! [String: Any]
        let actions = script["actions"] as! [[String: Any]]
        let pasteboard = NSPasteboard.general
        let savedClipboard = pasteboard.string(forType: .string)

        let running = try await launch(app)
        defer {
            running.terminate()
            if let savedClipboard { pasteboard.clearContents(); pasteboard.setString(savedClipboard, forType: .string) }
        }
        var (win, frame) = try await waitForWindow(running)
        running.activate()
        AXUIElementPerformAction(win, kAXRaiseAction as CFString)

        let s = Session()
        s.origin = frame.origin
        mouse = CGPoint(x: frame.minX + frame.width * 0.62, y: frame.minY + frame.height * 0.7)
        CGWarpMouseCursorPosition(mouse)
        print("  ⚠︎ Recording in 3s. Hands off the mouse and keyboard until it says done.")
        await sleep(3)
        running.activate()
        try await s.start(try await scWindow(pid: running.processIdentifier),
                          scale: NSScreen.main?.backingScaleFactor ?? 2,
                          to: URL(fileURLWithPath: out + "/raw.mp4"))
        s.mark()
        await sleep(0.6)

        for (i, a) in actions.enumerated() {
            let kind = a["kind"] as? String ?? ""
            let caption = a["caption"] as? String ?? ""
            let emphasis = a["emphasis"] as? Bool ?? false
            let value = a["value"] as? String ?? ""
            let target = (a["target"] as? [String: Any])?.compactMapValues { $0 as? String }
            var ev: [String: Any] = ["index": i, "kind": kind, "caption": caption, "emphasis": emphasis, "t": s.now()]
            do {
                if let f = axFrame(win) { frame = f; s.origin = f.origin }
                var box: CGRect?
                if let target, ["click", "fill", "hover"].contains(kind) {
                    var node: Node?
                    for _ in 0..<50 where node == nil {
                        node = find(target, in: win, bounds: frame)
                        if node == nil { await sleep(0.15) }
                    }
                    guard let node, let f = node.frame else { throw Fail("no element matches \(target)") }
                    let tall = f.height > 120
                    let p = tall ? CGPoint(x: f.minX + min(f.width * 0.3, 220), y: f.minY + min(f.height * 0.15, 90))
                                 : CGPoint(x: f.midX, y: f.midY)
                    await s.glide(to: p)
                    await sleep(0.16)
                    box = CGRect(x: f.minX - frame.minX, y: f.minY - frame.minY, width: f.width, height: tall ? min(f.height, 260) : f.height)
                }
                switch kind {
                case "goto": break // the app is already open
                case "click": await s.click()
                case "fill":
                    if box != nil { await s.click() }
                    if box != nil { try await press("Meta+A") }
                    if value.count > 80 {
                        pasteboard.clearContents()
                        pasteboard.setString(value, forType: .string)
                        try await press("Meta+V")
                    } else {
                        try await typeText(value)
                    }
                case "press": try await press(value.isEmpty ? "Enter" : value)
                case "hover": break
                case "scroll":
                    let total = Double(value) ?? 600
                    for _ in 0..<20 {
                        post(CGEvent(scrollWheelEvent2Source: src, units: .pixel, wheelCount: 1, wheel1: Int32(-total / 20), wheel2: 0, wheel3: 0))
                        await sleep(0.025)
                    }
                case "wait": await sleep((Double(value) ?? 1000) / 1000)
                default: throw Fail("unknown action kind '\(kind)'")
                }
                // Untargeted typing/keys act on the focused field: aim the camera there, not at the last click.
                // Asked *after* the keys are sent: an AX query mid-typing can make SwiftUI re-render and drop keystrokes.
                if box == nil, kind == "fill" || kind == "press" {
                    let app = AXUIElementCreateApplication(running.processIdentifier)
                    var focused: CFTypeRef?
                    if AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
                       let el = focused, CFGetTypeID(el) == AXUIElementGetTypeID(),
                       let f = axFrame(el as! AXUIElement), frame.intersects(f) {
                        let c = f.intersection(frame)
                        box = CGRect(x: c.minX - frame.minX, y: c.minY - frame.minY, width: c.width, height: min(c.height, 260))
                    }
                }
                if kind != "wait" && kind != "goto" { await sleep(emphasis ? 2.6 : 1.1) }
                if let box { ev["box"] = ["x": box.minX, "y": box.minY, "w": box.width, "h": box.height] }
                ev["end"] = s.now()
                s.events.append(ev)
                print("  ✓ \(i) \(kind) \(caption)")
            } catch {
                s.failures.append(["index": i, "error": "\(error)", "aria": dump(win, origin: frame.origin)])
                print("  ✗ \(i) \(kind): \(error)")
            }
        }
        await sleep(0.8)
        let end = s.now()
        try await s.stop()
        print("  done — you can use the mouse again.")
        let result: [String: Any] = [
            "width": frame.width, "height": frame.height, "end": end, "video": "raw.mp4", "chrome": "window",
            "events": s.events, "cursor": s.cursor, "failures": s.failures,
        ]
        try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted])
            .write(to: URL(fileURLWithPath: out + "/events.json"))
        print("  recorded \(s.events.count) actions, \(s.failures.count) failed")

    default:
        print("usage: macdriver check [--open] | probe --app X.app --out DIR [-- args] | run --app X.app --out DIR --script actions.json [-- args]")
    }
}

do {
    try await run()
    exit(0)
} catch {
    FileHandle.standardError.write("macdriver: \(error)\n".data(using: .utf8)!)
    exit(1)
}
