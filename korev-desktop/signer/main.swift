import CryptoKit
import Foundation
import Security

let keyType = "ecdsa-sha2-nistp256"
let curveName = "nistp256"
let hashAlgorithm = "sha512"
let signatureMagic = Data("SSHSIG".utf8)
let signatureVersion: UInt32 = 1
let signatureLineLength = 70
let keyComment = "korev"
let keyFileMode = 0o600
let keyPathVariable = "KOREV_SIGNING_KEY"
let sshKeygen = "/usr/bin/ssh-keygen"
let softwareFlag = "--software"

enum KeyKind: UInt8 {
  case secureEnclave = 1
  case software = 2
}

enum SignerError: Error, CustomStringConvertible {
  case usage
  case keyExists(String)
  case missingKeyPath
  case unknownKeyKind
  case accessControl

  var description: String {
    switch self {
    case .usage: return "usage: korev-sign create <key-path> | -Y sign -n <namespace> -f <key> [-U] <file>"
    case .keyExists(let path): return "\(path) already exists"
    case .missingKeyPath: return "\(keyPathVariable) is not set"
    case .unknownKeyKind: return "the key file is not a Korev signing key"
    case .accessControl: return "could not create the Secure Enclave access control"
    }
  }
}

struct SigningKey {
  let publicKey: P256.Signing.PublicKey
  let sign: (Data) throws -> P256.Signing.ECDSASignature
}

extension Data {
  mutating func appendUInt32(_ value: UInt32) {
    Swift.withUnsafeBytes(of: value.bigEndian) { append(contentsOf: $0) }
  }

  mutating func appendString(_ bytes: Data) {
    appendUInt32(UInt32(bytes.count))
    append(bytes)
  }

  mutating func appendString(_ text: String) {
    appendString(Data(text.utf8))
  }

  mutating func appendMPInt(_ unsigned: Data) {
    var bytes = Data(unsigned.drop(while: { $0 == 0 }))
    if let first = bytes.first, first & 0x80 != 0 { bytes.insert(0, at: 0) }
    appendString(bytes)
  }
}

func publicKeyBlob(_ key: P256.Signing.PublicKey) -> Data {
  var blob = Data()
  blob.appendString(keyType)
  blob.appendString(curveName)
  blob.appendString(key.x963Representation)
  return blob
}

func publicKeyLine(_ key: P256.Signing.PublicKey) -> String {
  "\(keyType) \(publicKeyBlob(key).base64EncodedString()) \(keyComment)"
}

func enclaveAccessControl() throws -> SecAccessControl {
  guard let access = SecAccessControlCreateWithFlags(
    nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, .privateKeyUsage, nil
  ) else { throw SignerError.accessControl }
  return access
}

func newKey(software: Bool) throws -> (KeyKind, Data, P256.Signing.PublicKey) {
  if software {
    let key = P256.Signing.PrivateKey()
    return (.software, key.rawRepresentation, key.publicKey)
  }
  let key = try SecureEnclave.P256.Signing.PrivateKey(accessControl: enclaveAccessControl())
  return (.secureEnclave, key.dataRepresentation, key.publicKey)
}

func create(path: String, software: Bool) throws {
  guard !FileManager.default.fileExists(atPath: path) else { throw SignerError.keyExists(path) }
  let (kind, keyData, publicKey) = try newKey(software: software)
  let contents = Data([kind.rawValue]) + keyData
  FileManager.default.createFile(atPath: path, contents: contents, attributes: [.posixPermissions: keyFileMode])
  print(publicKeyLine(publicKey))
}

func loadKey() throws -> SigningKey {
  guard let path = ProcessInfo.processInfo.environment[keyPathVariable] else { throw SignerError.missingKeyPath }
  let contents = try Data(contentsOf: URL(fileURLWithPath: path))
  guard let tag = contents.first, let kind = KeyKind(rawValue: tag) else { throw SignerError.unknownKeyKind }
  let keyData = contents.dropFirst()
  switch kind {
  case .secureEnclave:
    let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: keyData)
    return SigningKey(publicKey: key.publicKey, sign: { try key.signature(for: $0) })
  case .software:
    let key = try P256.Signing.PrivateKey(rawRepresentation: keyData)
    return SigningKey(publicKey: key.publicKey, sign: { try key.signature(for: $0) })
  }
}

func signedData(namespace: String, message: Data) -> Data {
  var data = signatureMagic
  data.appendString(namespace)
  data.appendString("")
  data.appendString(hashAlgorithm)
  data.appendString(Data(SHA512.hash(data: message)))
  return data
}

func signatureBlob(_ signature: P256.Signing.ECDSASignature) -> Data {
  let raw = signature.rawRepresentation
  let half = raw.count / 2
  var numbers = Data()
  numbers.appendMPInt(raw.prefix(half))
  numbers.appendMPInt(raw.suffix(half))
  var blob = Data()
  blob.appendString(keyType)
  blob.appendString(numbers)
  return blob
}

func sshSignature(key: SigningKey, namespace: String, message: Data) throws -> Data {
  var blob = signatureMagic
  blob.appendUInt32(signatureVersion)
  blob.appendString(publicKeyBlob(key.publicKey))
  blob.appendString(namespace)
  blob.appendString("")
  blob.appendString(hashAlgorithm)
  blob.appendString(signatureBlob(try key.sign(signedData(namespace: namespace, message: message))))
  return blob
}

func armored(_ blob: Data) -> String {
  let encoded = blob.base64EncodedString()
  let lines = stride(from: 0, to: encoded.count, by: signatureLineLength).map { start -> Substring in
    let from = encoded.index(encoded.startIndex, offsetBy: start)
    let to = encoded.index(from, offsetBy: signatureLineLength, limitedBy: encoded.endIndex) ?? encoded.endIndex
    return encoded[from..<to]
  }
  return (["-----BEGIN SSH SIGNATURE-----"] + lines + ["-----END SSH SIGNATURE-----"]).joined(separator: "\n") + "\n"
}

func value(after flag: String, in arguments: [String]) -> String? {
  guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else { return nil }
  return arguments[index + 1]
}

func isSignRequest(_ arguments: [String]) -> Bool {
  value(after: "-Y", in: arguments) == "sign"
}

func sign(arguments: [String]) throws {
  guard let namespace = value(after: "-n", in: arguments), let file = arguments.last else { throw SignerError.usage }
  let message = try Data(contentsOf: URL(fileURLWithPath: file))
  let signature = try sshSignature(key: loadKey(), namespace: namespace, message: message)
  try Data(armored(signature).utf8).write(to: URL(fileURLWithPath: file + ".sig"))
}

func passToSshKeygen(_ arguments: [String]) -> Never {
  let argv = ([sshKeygen] + arguments).map { strdup($0) } + [nil]
  execv(sshKeygen, argv)
  perror(sshKeygen)
  exit(1)
}

func main() throws {
  let arguments = Array(CommandLine.arguments.dropFirst())
  if arguments.first == "create" {
    guard arguments.count >= 2 else { throw SignerError.usage }
    try create(path: arguments[1], software: arguments.contains(softwareFlag))
    return
  }
  guard isSignRequest(arguments) else { passToSshKeygen(arguments) }
  try sign(arguments: arguments)
}

do {
  try main()
} catch {
  FileHandle.standardError.write(Data("korev-sign: \(error)\n".utf8))
  exit(1)
}
