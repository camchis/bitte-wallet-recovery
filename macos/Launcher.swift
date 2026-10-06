import AppKit

struct Provider: Decodable { let id: String; let label: String }

final class Launcher: NSObject, NSApplicationDelegate {
    var process: Process?
    let control = Pipe()
    var providers: [Provider] = []
    var providerMenu: NSPopUpButton!
    var startButton: NSButton!
    var selectedProvider = "apple"
    var window: NSWindow!
    var message: NSTextField!
    var quitting = false
    var pending = ""
    var state = LauncherState()
    var outputClosed = false
    var backendTermination: (Int32, Process.TerminationReason)?
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 540, height: 370), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Bitte Local Recovery"
        window.center()
        let title = NSTextField(labelWithString: "Recover your historical NEAR wallet")
        title.font = .boldSystemFont(ofSize: 20)
        title.frame = NSRect(x: 24, y: 310, width: 490, height: 28)
        window.contentView!.addSubview(title)
        message = NSTextField(wrappingLabelWithString: "Choose where your original wallet passkey is stored. Provider sign-in happens in the dedicated browser. The reconstructed NEAR key stays on this device.")
        message.frame = NSRect(x: 24, y: 154, width: 490, height: 132)
        message.font = .systemFont(ofSize: 14)
        window.contentView!.addSubview(message)
        let providerLabel = NSTextField(labelWithString: "Passkey provider")
        providerLabel.frame = NSRect(x: 24, y: 124, width: 490, height: 22)
        window.contentView!.addSubview(providerLabel)
        providerMenu = NSPopUpButton(frame: NSRect(x: 24, y: 87, width: 490, height: 28), pullsDown: false)
        if let url = Bundle.main.resourceURL?.appendingPathComponent("providers.json"), let bytes = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode([Provider].self, from: bytes) {
            providers = catalog
            providerMenu.addItems(withTitles: providers.map { $0.label })
        }
        window.contentView!.addSubview(providerMenu)
        startButton = NSButton(title: "Open Recovery", target: self, action: #selector(startRecovery))
        startButton.frame = NSRect(x: 24, y: 25, width: 160, height: 34)
        startButton.bezelStyle = .rounded
        startButton.isEnabled = !providers.isEmpty
        window.contentView!.addSubview(startButton)
        let quit = NSButton(title: "Quit Recovery", target: self, action: #selector(quitApp))
        quit.frame = NSRect(x: 355, y: 25, width: 160, height: 34)
        quit.bezelStyle = .rounded
        window.contentView!.addSubview(quit)
        let menu = NSMenu()
        let item = NSMenuItem()
        menu.addItem(item)
        let submenu = NSMenu()
        submenu.addItem(withTitle: "Quit Bitte Local Recovery", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = submenu
        NSApp.mainMenu = menu
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func startRecovery() {
        let index = providerMenu.indexOfSelectedItem
        guard process == nil, providers.indices.contains(index) else { return }
        selectedProvider = providers[index].id
        providerMenu.isEnabled = false
        startButton.isEnabled = false
        message.stringValue = "Starting the local recovery interface…"
        start()
    }
    func start() {
        guard let resources = Bundle.main.resourceURL else { show("START_FAILED"); return }
        #if arch(arm64)
        let architecture = "arm64"
        #else
        let architecture = "x64"
        #endif
        let child = Process()
        child.executableURL = resources.appendingPathComponent("runtime/\(architecture)/node")
        child.arguments = [resources.appendingPathComponent("backend.mjs").path, "--provider=\(selectedProvider)"]
        // Do not inherit NODE_OPTIONS, preload paths, or dynamic-library injection settings.
        child.environment = ["HOME": NSHomeDirectory(), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "TMPDIR": NSTemporaryDirectory()]
        let pipe = Pipe()
        child.standardInput = control
        child.standardOutput = pipe
        child.standardError = FileHandle.nullDevice
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes = handle.availableData
            if bytes.isEmpty {
                handle.readabilityHandler = nil
                DispatchQueue.main.async {
                    self?.outputClosed = true
                    self?.finishTermination()
                }
                return
            }
            guard let text = String(data: bytes, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.pending += text
                while let end = self.pending.firstIndex(of: "\n") {
                    let code = String(self.pending[..<end])
                    self.pending.removeSubrange(...end)
                    self.show(code)
                }
            }
        }
        child.terminationHandler = { [weak self] child in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.backendTermination = (child.terminationStatus, child.terminationReason)
                self.finishTermination()
            }
        }
        do {
            try child.run()
            process = child
            pipe.fileHandleForWriting.closeFile()
        } catch { show("START_FAILED") }
    }
    func finishTermination() {
        // Drain fixed status codes before handling exit so startup/cleanup errors
        // cannot be lost to stdout/termination callback ordering.
        guard outputClosed, let (status, reason) = backendTermination else { return }
        backendTermination = nil
        if quitting && reason == .exit && status == 0 {
            NSApp.reply(toApplicationShouldTerminate: true)
        } else {
            message.stringValue = state.exited()
            if quitting {
                quitting = false
                NSApp.reply(toApplicationShouldTerminate: false)
            }
        }
    }
    func show(_ code: String) {
        if let text = state.receive(code) { message.stringValue = text }
    }
    @objc func quitApp() { NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let child = process, child.isRunning else { return .terminateNow }
        if !quitting {
            quitting = true
            message.stringValue = "Closing the dedicated browser and stopping local servers…"
            child.terminate()
        }
        return .terminateLater
    }
}
@main
struct RecoveryApp {
    static func main() {
        let delegate = Launcher()
        let app = NSApplication.shared
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
