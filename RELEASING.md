# Releasing Workduck

Workduck releases are built by GitHub Actions when a semantic version tag is pushed.
The release workflow builds one Windows setup executable, signed updater artifacts,
and `latest.json`, then uploads them to a draft GitHub Release.

## Optional Signing Secrets

Updater signing is required for in-app updates and is separate from paid Windows
code signing. Keep the Tauri updater private key only in GitHub Secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: Private updater signing key content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Optional updater key password.

The workflow can still publish an unsigned Windows setup executable without paid
Windows signing. If Windows signing secrets are configured, the same workflow
signs the installer before uploading it.

Add these repository secrets only when a Windows code-signing certificate is available:

- `WINDOWS_CERTIFICATE_BASE64`: Base64-encoded `.pfx` code-signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: Password for that `.pfx` certificate.
- `WINDOWS_TIMESTAMP_URL`: Optional timestamp server URL. If omitted, the workflow uses
  `http://timestamp.digicert.com`.

Private keys, certificate files, and passwords must never be committed to the
repository.

## Preparing The Certificate Secret

On Windows, encode the certificate with:

```powershell
certutil -encode .\workduck-signing.pfx .\workduck-signing.base64.txt
```

Copy the contents of `workduck-signing.base64.txt` into the
`WINDOWS_CERTIFICATE_BASE64` GitHub secret.

## Publishing A Release

1. Update `package.json` and `src-tauri/Cargo.toml` to the same version.
2. Commit and push the version change.
3. Create and push a matching tag:

```powershell
git tag v1.3.9
git push origin v1.3.9
```

The workflow rejects a release if the tag does not match both version files. The
GitHub Release is created as a draft so the installer and updater metadata can be
checked before publishing. Use the `Workduck_<version>_x64-setup.exe` asset as the
primary download. The in-app updater reads `latest.json` from the latest GitHub
Release and installs the signed updater bundle for future versions.

Without Windows signing secrets, Windows may show a SmartScreen warning when the
installer is downloaded from a browser. Updater signing does not replace Windows
code signing.

## Current Scope

This workflow can build without a paid Windows certificate. Auto-update support
starts with the first release built from the updater-enabled app. Users already on
older installers must manually install that release once before later releases can
be installed in-app.
