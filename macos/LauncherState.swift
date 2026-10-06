import Foundation

struct LauncherState {
    private(set) var backendExited = false
    private(set) var code = ""
    private(set) var message = ""

    mutating func receive(_ next: String) -> String? {
        // stdout delivery can be queued behind termination; never restore READY.
        guard !backendExited else { return nil }
        let text: String
        switch next {
        case "READY": text = "Setup is open in a dedicated Chrome window.\n\nFollow your selected provider’s setup instructions, then enter the NEAR account and original passkey website.\n\nKeep this app open until you finish."
        case "OFFLINE": text = "Public lookup has stopped.\n\nDisconnect Wi-Fi, Ethernet and tethering before using the existing passkey in Chrome. Save any matching key outside cloud-synced folders.\n\nQuit Recovery before reconnecting."
        case "PROVIDER_READY": text = "Public account lookup has stopped.\n\nUse the original passkey in Chrome. Your provider may use internet; the NEAR key is reconstructed and saved on this device.\n\nQuit Recovery when finished."
        case "BROWSER_CLOSED": text = "The dedicated Chrome process has closed and local servers are stopping.\n\nQuit this app. Reopen it to start a new recovery session."
        case "CHROME_MISSING": text = "Google Chrome is required. Install it in Applications, then quit and reopen this app."
        case "PORT_BUSY": text = "Another process is using setup port 8787. Close any other recovery setup session, then quit and reopen this app."
        case "RECOVERY_PORT_BUSY": text = "Recovery port 8443 is already in use.\n\nClose the other recovery session or application using it, then click Prepare recovery again in Chrome."
        case "PREPARE_FAILED": text = "The recovery page could not start.\n\nQuit and reopen Recovery, then try preparing the account again."
        case "START_FAILED": text = "Could not start local recovery. Check that Google Chrome is installed and no other recovery session is running, then reopen this app."
        case "CLEANUP_FAILED": text = "Automatic browser closure could not be confirmed.\n\nManually close every dedicated recovery Chrome window before reconnecting or reopening Recovery."
        default: return nil
        }
        code = next
        message = text
        return text
    }

    mutating func exited() -> String {
        backendExited = true
        if !["CHROME_MISSING", "PORT_BUSY", "START_FAILED", "CLEANUP_FAILED"].contains(code) {
            code = "BACKEND_FAILED"
            message = "Recovery stopped unexpectedly.\n\nThe browser supervisor will attempt to close its dedicated Chrome process. Verify every recovery window has closed; close any remaining windows manually before reconnecting.\n\nQuit and reopen Recovery to try again."
        }
        return message
    }
}
