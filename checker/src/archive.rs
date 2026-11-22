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
                .and_then(Sexp::vector)
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

fn github_default(path: &str) -> bool {
    let parts: Vec<&str> = path.split('/').collect();
    parts.len() == 2 || (parts.len() == 3 && parts[1] == "lisp")
}

pub fn unpack(package: &Package, bytes: &[u8]) -> Result<PackageFacts> {
    if bytes.len() > MAX_BYTES {
        bail!("download exceeds size limit");
    }
    let source = package.key.split('/').next().unwrap_or_default().to_owned();
    let mut contents = Vec::new();
    let mut pkg_file = None;
    let mut has_license_file = false;
    let mut repo_clean = true;
    let mut packaged_docs = false;
    if package.kind == "single" && scanner::included(&format!("{}.el", package.name), &package.name)
    {
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
            let parts: Vec<&str> = path.split('/').collect();
            let basename = parts.last().copied().unwrap_or_default();
            let top = parts
                .get(1)
                .copied()
                .unwrap_or_default()
                .to_ascii_lowercase();
            if package.kind == "github" {
                has_license_file |= parts.len() >= 2
                    && ["copying", "license", "unlicense"]
                        .iter()
                        .any(|n| top.starts_with(n));
                repo_clean &= !(basename.ends_with(".elc")
                    || basename.ends_with('~')
                    || basename == ".DS_Store");
            } else {
                let stem = basename.rsplit_once('.').map_or(basename, |(stem, _)| stem);
                packaged_docs |= ["CHANGELOG", "LICENSE", "README"].contains(&stem);
            }
            let wanted = package.kind != "github" || github_default(&path);
            if wanted && basename == format!("{}-pkg.el", package.name) {
                let mut data = Vec::new();
                entry.read_to_end(&mut data)?;
                pkg_file = Some(String::from_utf8_lossy(&data).into_owned());
            } else if wanted && scanner::included(&path, &package.name) {
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
        if package.kind == "github" {
            bail!("no .el files at the repository root or in lisp/ (MELPA's default file set)");
        }
        bail!("no checkable .el files");
    }
    let main_requires = contents
        .iter()
        .find(|(path, _)| path.rsplit('/').next() == Some(&format!("{name}.el")))
        .map(|(_, text)| scanner::requirements(text))
        .or_else(|| pkg_file.as_deref().map(scanner::pkg_requirements))
        .unwrap_or_default();
    let files = contents
        .iter()
        .map(|(path, text)| scanner::scan(path, text, &name))
        .collect::<Result<Vec<_>>>()?;
    Ok(PackageFacts {
        name,
        source,
        files,
        main_requires,
        has_license_file,
        repo_clean,
        packaged_docs,
    })
}
