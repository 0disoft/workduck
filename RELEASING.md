# Releasing Workduck

Workduck releases are built by GitHub Actions when a semantic version tag is pushed.
The release workflow currently builds a Windows installer and uploads it to a draft
GitHub Release.

## Optional Signing Secrets

The workflow can publish unsigned Windows installers without paid signing setup. If
Windows signing secrets are configured, the same workflow signs the installer before
uploading it.

Add these repository secrets only when a Windows code-signing certificate is available:

- `WINDOWS_CERTIFICATE_BASE64`: Base64-encoded `.pfx` code-signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: Password for that `.pfx` certificate.
- `WINDOWS_TIMESTAMP_URL`: Optional timestamp server URL. If omitted, the workflow uses
  `http://timestamp.digicert.com`.

The private certificate file and password must never be committed to the repository.

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
GitHub Release is created as a draft so the installer can be checked before
publishing. Without signing secrets, Windows may show a SmartScreen warning when the
installer is downloaded from a browser.

## Current Scope

This workflow can build without a paid certificate. It does not yet configure the
in-app updater. Automatic updates require the Tauri updater plugin, updater signing
keys, `latest.json`, and an update-checking UI path.
