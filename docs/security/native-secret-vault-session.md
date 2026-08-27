# Native Environment Vault Session

## Boundary

Workduck persists the Environment vault only as an Argon2id and XChaCha20-Poly1305 envelope. The desktop WebView may read and write that encrypted envelope, but it cannot invoke bulk vault encryption or decryption.

Opening a vault sends the encrypted envelope and workspace password to the `open_environment_vault_session` Rust command. Rust authenticates and decrypts the payload, validates its workspace ownership and records, then stores the plaintext payload and password in a process-local session. Secret values and the session password are zeroized when records are replaced, the workspace is locked, or the app exits.

The command returns a metadata view containing names, kinds, tags, timestamps, value lengths, and opaque handles shaped as `workduck-secret-ref:v1:<base64url>`. The handle identifies a workspace and secret record. It does not encode the secret value.

## Native consumers

Git operations, Queue agent execution, direct LLM chat, and CLI environment application accept the opaque handle in the existing credential value field. Each native boundary resolves the handle immediately before use and keeps the resolved value in `Zeroizing<String>`. Raw values remain accepted for CLI and environment-variable fallback paths that do not originate from a desktop vault session.

A malformed handle, a locked session, or a missing secret fails closed. The prefix is never treated as a literal credential after resolution fails.

## WebView egress

The Environment screen may request one secret value at a time for an explicit reveal or clipboard action. There is no command that returns the complete decrypted vault. Editing a record leaves its existing value in Rust when the value field is empty, so ordinary metadata edits do not expose or retransmit the old value.

All other desktop consumers receive only metadata and opaque handles. Persisted project, agent, and workspace records continue to store secret IDs rather than plaintext credentials.

## Mutation transaction

Create, update, and remove commands clone the current native payload, apply validation, encrypt the candidate payload, and replace the live session only after encryption succeeds. The WebView then atomically persists the returned envelope through the existing workspace data-file boundary. If persistence fails, the UI closes the native session rather than continuing with memory state that differs from disk.

## Invariants

1. Bulk decrypted vault payloads never cross the Tauri invoke boundary.
2. Secret references resolve only while the matching native workspace session is open.
3. Unknown or stale references cannot fall back to literal credential values.
4. Prompt previews and agent metadata never resolve secret references.
5. Locking a workspace or exiting Workduck clears the corresponding native session.
6. Existing encrypted vault envelopes remain compatible with the native session loader.
