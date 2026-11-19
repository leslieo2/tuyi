import Darwin
import Foundation
import Security

#if IMAGE_TRANSLATOR_TEST
private let keyService = "com.local_image_translator.deepseek.test"
let testKeychainID = ProcessInfo.processInfo.environment["IMAGE_TRANSLATOR_TEST_KEYCHAIN_ID"]
    .flatMap { UUID(uuidString: $0) }
private let keyAccount = (testKeychainID ?? UUID()).uuidString
#else
private let keyService = "com.local_image_translator.deepseek"
private let keyAccount = "manual-api-key"
#endif

private func keyQuery(account: String = keyAccount) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: keyService,
     kSecAttrAccount as String: account]
}

func validKey(_ key: String) -> Bool {
    (1...512).contains(key.utf8.count) && key.utf8.allSatisfy { (33...126).contains($0) }
}

func deepSeekKey() throws -> String {
    var query = keyQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { throw HostError("missing_key") }
    guard status == errSecSuccess, let data = result as? Data,
          let key = String(data: data, encoding: .utf8), validKey(key) else {
        throw HostError("keychain")
    }
    return key
}

func hasDeepSeekKey() throws -> Bool {
    switch SecItemCopyMatching(keyQuery() as CFDictionary, nil) {
    case errSecSuccess: return true
    case errSecItemNotFound: return false
    default: throw HostError("keychain")
    }
}

func promptAndStoreDeepSeekKey() throws {
    // Reserve one extra byte beyond the accepted limit so truncated input is invalid.
    var input = [CChar](repeating: 0, count: 514)
    let capacity = input.count
    let result = readpassphrase("输入 DeepSeek API 密钥（输入不可见），再按回车：", &input, capacity, RPP_REQUIRE_TTY)
    guard result != nil else { throw HostError("key_input") }
    guard let key = String(validatingUTF8: input) else { throw HostError("invalid_key") }
    try storeDeepSeekKey(key)
}

func storeDeepSeekKey(_ key: String) throws {
    guard validKey(key) else { throw HostError("invalid_key") }
    let secret = Data(key.utf8)
    let query = keyQuery()
    var item = query
    item[kSecValueData as String] = secret
    item[kSecAttrLabel as String] = "Local Image Translator — DeepSeek (manual)"
    let status = SecItemAdd(item as CFDictionary, nil)
    if status == errSecSuccess { return }
    if status == errSecDuplicateItem {
        let update = [kSecValueData as String: secret]
        if SecItemUpdate(query as CFDictionary, update as CFDictionary) == errSecSuccess { return }
    }
    throw HostError("keychain")
}

func deleteDeepSeekKey() throws {
    for account in [keyAccount, "api-key"] {
        let status = SecItemDelete(keyQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw HostError("keychain")
        }
    }
}
