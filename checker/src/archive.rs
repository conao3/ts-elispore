use crate::{
    policy::PackageFacts,
    scanner,
    sexp::{self, Sexp},
};
use anyhow::{bail, Context, Result};
use flate2::read::GzDecoder;
use std::io::{Cursor, Read};

pub const MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Package {
    pub key: String,
    pub name: String,
    pub version: String,
    pub url: String,
    pub kind: String,
}

pub fn index(source: &str, base: &str, text: &str) -> Result<Vec<Package>> {
    let forms = sexp::parse(text)?;
    let root = forms
        .first()
        .and_then(Sexp::list)
        .context("archive is not a list")?;
    if root.first().and_then(Sexp::atom) != Some("1") {
        bail!("unsupported archive version");
    }
    root[1..]
        .iter()
        .map(|entry| {
            let fields = entry.list().context("invalid archive entry")?;
            let name = fields
                .first()
                .and_then(Sexp::atom)
                .context("missing package name")?;
            if !name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_+@".contains(c))
            {
                bail!("unsafe package name: {name}");
            }
            let desc = fields
                .last()
                .and_then(Sexp::list)
                .context("missing descriptor")?;
            let parts = desc
                .first()
                .and_then(Sexp::list)
                .context("missing version")?;
            let version = parts
                .iter()
                .map(|p| p.atom().context("invalid version"))
                .collect::<Result<Vec<_>>>()?
                .join(".");
            let kind = desc
                .get(3)
                .and_then(Sexp::atom)
                .context("missing package kind")?;
            if version.is_empty() || !version.chars().all(|c| c.is_ascii_digit() || c == '.') {
                bail!("invalid version: {version}");
            }
            if !matches!(kind, "tar" | "single") {
                bail!("unsupported package kind: {kind}");
            }
            Ok(Package {
                key: format!("{source}/{name}"),
                name: name.into(),
                version: version.clone(),
                url: format!(
                    "{base}/{name}-{version}.{}",
                    if kind == "single" { "el" } else { "tar" }
                ),
                kind: kind.into(),
            })
        })
        .collect()
}

pub fn github(repo: &str) -> Result<Package> {
    let parts: Vec<_> = repo.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|s| {
            s.is_empty()
                || *s == "."
                || *s == ".."
                || !s
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        })
    {
        bail!("invalid GitHub repository: {repo}");
    }
    let name = parts[1].strip_prefix("emacs-").unwrap_or(parts[1]);
    let name = name.strip_suffix(".el").unwrap_or(name);
    Ok(Package {
        key: format!("github/{repo}"),
        name: name.into(),
        version: String::new(),
        url: format!("https://codeload.github.com/{repo}/tar.gz/HEAD"),
        kind: "github".into(),
    })
}

pub fn unpack(package: &Package, bytes: &[u8]) -> Result<PackageFacts> {
    if bytes.len() > MAX_BYTES {
        bail!("download exceeds size limit");
    }
    let mut contents = Vec::new();
    let mut has_license_file = false;
    if package.kind == "single" && scanner::included(&format!("{}.el", package.name)) {
        contents.push((
            format!("{}.el", package.name),
            String::from_utf8_lossy(bytes).into_owned(),
        ));
    } else if package.kind != "single" {
        let input: Box<dyn Read + '_> = if package.kind == "github" {
            Box::new(GzDecoder::new(Cursor::new(bytes)))
        } else {
            Box::new(Cursor::new(bytes))
        };
        let mut archive = tar::Archive::new(input);
        let mut total = 0u64;
        for entry in archive.entries()? {
            let mut entry = entry?;
            if !entry.header().entry_type().is_file() {
                continue;
            }
            total = total
                .checked_add(entry.size())
                .context("archive size overflow")?;
            if total > MAX_BYTES as u64 {
                bail!("expanded archive exceeds size limit");
            }
            let path = entry.path()?.to_string_lossy().into_owned();
            let basename = path
                .rsplit('/')
                .next()
                .unwrap_or_default()
                .to_ascii_uppercase();
            has_license_file |= ["LICENSE", "COPYING"]
                .iter()
                .any(|n| basename == *n || basename.starts_with(&format!("{n}.")));
            if scanner::included(&path) {
                let mut data = Vec::new();
                entry.read_to_end(&mut data)?;
                contents.push((path, String::from_utf8_lossy(&data).into_owned()));
            }
        }
    }
    contents.sort_by(|a, b| a.0.cmp(&b.0));
    let mut name = package.name.clone();
    if package.kind == "github"
        && !contents
            .iter()
            .any(|(path, _)| path.rsplit('/').next() == Some(&format!("{name}.el")))
    {
        if let Some((path, _)) = contents
            .iter()
            .filter(|(path, _)| path.split('/').count() == 2)
            .min_by_key(|(path, _)| (path.rsplit('/').next().unwrap_or_default().len(), path))
        {
            name = path
                .rsplit('/')
                .next()
                .unwrap()
                .trim_end_matches(".el")
                .into();
        }
    }
    if contents.is_empty() {
        bail!("no checkable .el files");
    }
    let files = contents
        .iter()
        .map(|(path, text)| scanner::scan(path, text))
        .collect::<Result<Vec<_>>>()?;
    Ok(PackageFacts {
        name,
        files,
        has_license_file,
    })
}
