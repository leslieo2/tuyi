import ApplicationServices
import Foundation

let pid = pid_t(CommandLine.arguments[1])!
let application = AXUIElementCreateApplication(pid)
let label = "翻译图片中的内容"

func childElements(_ node: AXUIElement) -> [AXUIElement] {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(node, kAXChildrenAttribute as CFString, &value) == .success
    else { return [] }
    return value as? [AXUIElement] ?? []
}

func title(_ node: AXUIElement) -> String? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(node, kAXTitleAttribute as CFString, &value)
    return value as? String
}

func press(_ node: AXUIElement, depth: Int) -> Bool {
    if title(node) == label {
        let result = AXUIElementPerformAction(node, kAXPressAction as CFString)
        print("Menu item found. AXPress status: \(result.rawValue)")
        fflush(stdout)
        return result == .success || result == .cannotComplete
    }
    return depth > 0 && childElements(node).contains { press($0, depth: depth - 1) }
}

var observer: AXObserver?
let created = AXObserverCreate(pid, { _, element, _, _ in
    if press(element, depth: 4) { exit(0) }
}, &observer)
guard created == .success, let observer else { exit(1) }
let added = AXObserverAddNotification(observer, application, kAXMenuOpenedNotification as CFString, nil)
CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), .defaultMode)
print("Observer ready. Notification registration: \(added.rawValue)")
fflush(stdout)
for _ in 0..<45 {
    _ = CFRunLoopRunInMode(.defaultMode, 0.15, false)
    if press(application, depth: 4) { exit(0) }
}
exit(1)
