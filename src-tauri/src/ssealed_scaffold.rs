use std::collections::HashSet;
use std::sync::OnceLock;

use sha2::{Digest, Sha256};

use crate::ssealed_scaffold_generated::{
    SSEALED_SCAFFOLD_ARCHIVE_JSON, SSEALED_SCAFFOLD_ARCHIVE_SCHEMA_VERSION,
    SSEALED_SCAFFOLD_ARCHIVE_SHA256, SSEALED_SCAFFOLD_TOOL_VERSION,
};

#[derive(Debug)]
pub struct SsealedScaffoldFile {
    pub path: &'static str,
    pub kind: &'static str,
    pub content: &'static str,
}

#[derive(Debug)]
pub struct SsealedScaffold {
    pub scope: &'static str,
    pub profile: &'static str,
    pub density: &'static str,
    pub runner: &'static str,
    pub files: &'static [SsealedScaffoldFile],
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SsealedScaffoldArchive {
    schema_version: String,
    tool_version: String,
    density: String,
    runner: String,
    contents: Vec<String>,
    scaffolds: Vec<ArchivedScaffold>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ArchivedScaffold {
    scope: String,
    profile: String,
    files: Vec<ArchivedScaffoldFile>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ArchivedScaffoldFile {
    path: String,
    kind: String,
    content: usize,
}

static SSEALED_SCAFFOLDS: OnceLock<Result<&'static [SsealedScaffold], String>> = OnceLock::new();

pub fn ssealed_scaffolds() -> Result<&'static [SsealedScaffold], &'static str> {
    SSEALED_SCAFFOLDS
        .get_or_init(load_ssealed_scaffolds)
        .as_ref()
        .copied()
        .map_err(String::as_str)
}

fn load_ssealed_scaffolds() -> Result<&'static [SsealedScaffold], String> {
    let checksum = hex_sha256(SSEALED_SCAFFOLD_ARCHIVE_JSON.as_bytes());
    if checksum != SSEALED_SCAFFOLD_ARCHIVE_SHA256 {
        return Err("embedded ssealed scaffold archive checksum mismatch".to_owned());
    }

    let archive: SsealedScaffoldArchive = serde_json::from_str(SSEALED_SCAFFOLD_ARCHIVE_JSON)
        .map_err(|error| format!("invalid embedded ssealed scaffold archive: {error}"))?;
    if archive.schema_version != SSEALED_SCAFFOLD_ARCHIVE_SCHEMA_VERSION {
        return Err("unsupported embedded ssealed scaffold archive schema".to_owned());
    }
    if archive.tool_version != SSEALED_SCAFFOLD_TOOL_VERSION {
        return Err("embedded ssealed scaffold tool version mismatch".to_owned());
    }

    let density = leak_string(archive.density);
    let runner = leak_string(archive.runner);
    let contents = archive
        .contents
        .into_iter()
        .map(leak_string)
        .collect::<Vec<_>>();
    let mut identities = HashSet::new();
    let mut scaffolds = Vec::with_capacity(archive.scaffolds.len());
    for scaffold in archive.scaffolds {
        if !identities.insert((scaffold.scope.clone(), scaffold.profile.clone())) {
            return Err("duplicate embedded ssealed scaffold identity".to_owned());
        }

        let mut paths = HashSet::new();
        let mut files = Vec::with_capacity(scaffold.files.len());
        for file in scaffold.files {
            if !paths.insert(file.path.clone()) {
                return Err("duplicate embedded ssealed scaffold file path".to_owned());
            }
            let content = contents
                .get(file.content)
                .ok_or_else(|| "embedded ssealed scaffold content index is out of range".to_owned())?
                .to_owned();
            files.push(SsealedScaffoldFile {
                path: leak_string(file.path),
                kind: leak_string(file.kind),
                content,
            });
        }

        scaffolds.push(SsealedScaffold {
            scope: leak_string(scaffold.scope),
            profile: leak_string(scaffold.profile),
            density,
            runner,
            files: Box::leak(files.into_boxed_slice()),
        });
    }

    if scaffolds.is_empty() {
        return Err("embedded ssealed scaffold archive is empty".to_owned());
    }
    Ok(Box::leak(scaffolds.into_boxed_slice()))
}

fn leak_string(value: String) -> &'static str {
    Box::leak(value.into_boxed_str())
}

fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_archive_has_unique_scaffolds_and_resolvable_content() {
        let scaffolds = ssealed_scaffolds().expect("valid embedded scaffold archive");
        assert!(scaffolds.len() > 1);
        assert!(scaffolds.iter().all(|scaffold| !scaffold.files.is_empty()));
        assert!(scaffolds.iter().any(|scaffold| {
            scaffold.scope == "backend"
                && scaffold.profile == "generic"
                && scaffold.files.iter().any(|file| file.path == "AGENTS.md")
        }));
    }
}
