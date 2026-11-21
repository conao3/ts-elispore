use crate::{
    policy::FileFacts,
    sexp::{self, Sexp},
};
use anyhow::{Context, Result};
use std::path::Path;

pub fn included(path: &str) -> bool {
    let path = Path::new(path);
    let name = path
        .file_name()
        .and_then(|x| x.to_str())
        .unwrap_or_default();
    name.ends_with(".el")
        && !["-pkg.el", "-autoloads.el", "-test.el", "-tests.el"]
            .iter()
            .any(|s| name.ends_with(s))
        && !path
            .components()
            .any(|x| matches!(x.as_os_str().to_str(), Some("test" | "tests")))
}

fn header(text: &str, names: &[&str]) -> String {
    for line in text
        .lines()
        .take_while(|l| !l.trim_start().starts_with(";;; Code:"))
    {
        if let Some(line) = line.strip_prefix(";;") {
            if let Some((key, value)) = line.trim_start().split_once(':') {
                if names.iter().any(|n| key.eq_ignore_ascii_case(n)) && !value.trim().is_empty() {
                    return value.trim().to_owned();
                }
            }
        }
    }
    String::new()
}

fn feature(form: &Sexp) -> Option<&str> {
    match form {
        Sexp::Quote(x) => x.atom(),
        Sexp::List(xs) if xs.first().and_then(Sexp::atom) == Some("quote") => xs.get(1)?.atom(),
        _ => None,
    }
}

fn features(form: &Sexp, provides: &mut Vec<String>, requires: &mut Vec<String>) {
    if let Some(xs) = form.list() {
        match xs.first().and_then(Sexp::atom) {
            Some("quote" | "function") => return,
            Some("provide" | "require") => {
                if let Some(name) = xs.get(1).and_then(feature) {
                    if xs[0].atom() == Some("provide") {
                        provides.push(name.to_owned());
                    } else {
                        requires.push(name.to_owned());
                    }
                }
            }
            _ => {}
        }
        for x in xs {
            features(x, provides, requires);
        }
    }
}

pub fn scan(path: &str, text: &str) -> Result<FileFacts> {
    let file_name = Path::new(path)
        .file_name()
        .context("missing file name")?
        .to_string_lossy()
        .into_owned();
    let stem = file_name
        .strip_suffix(".el")
        .context("not an elisp file")?
        .to_owned();
    let first_line = text.lines().next().unwrap_or_default().to_owned();
    let lexical_binding = first_line.split("-*-").nth(1).is_some_and(|s| {
        s.split(';').any(|part| {
            part.split_once(':').is_some_and(|(key, value)| {
                key.trim() == "lexical-binding"
                    && value.trim().trim_end_matches("-*-").trim() == "t"
            })
        })
    });
    let forms = sexp::parse(text).with_context(|| format!("parse {path}"))?;
    let mut provides = Vec::new();
    let mut requires = Vec::new();
    let mut definitions = Vec::new();
    for form in &forms {
        features(form, &mut provides, &mut requires);
        if let Some(xs) = form.list() {
            if matches!(
                xs.first().and_then(Sexp::atom),
                Some(
                    "defun"
                        | "defmacro"
                        | "defvar"
                        | "defcustom"
                        | "defconst"
                        | "defface"
                        | "defgroup"
                        | "define-minor-mode"
                        | "define-derived-mode"
                        | "cl-defun"
                        | "cl-defmacro"
                        | "defsubst"
                )
            ) {
                if xs.first().and_then(Sexp::atom) == Some("defvar") && xs.len() < 3 {
                    continue;
                }
                if let Some(name) = xs.get(1).and_then(Sexp::atom) {
                    definitions.push(name.to_owned());
                }
            }
        }
    }
    let comment_lines: Vec<_> = text.lines().filter(|l| l.starts_with(';')).collect();
    Ok(FileFacts {
        file_name,
        stem,
        first_line,
        lexical_binding,
        author: header(text, &["Author"]),
        maintainer: header(text, &["Maintainer"]),
        url: header(text, &["URL", "Homepage"]),
        version: header(text, &["Version", "Package-Version"]),
        package_requires: header(text, &["Package-Requires"]),
        keywords: header(text, &["Keywords"]),
        commentary: comment_lines.iter().any(|l| l.trim() == ";;; Commentary:"),
        code_section: comment_lines.iter().any(|l| l.trim() == ";;; Code:"),
        footer: comment_lines.iter().any(|l| {
            l.trim()
                == format!(
                    ";;; {} ends here",
                    Path::new(path).file_name().unwrap().to_string_lossy()
                )
        }),
        license_notice: comment_lines.iter().any(|l| {
            l.contains("GNU General Public License") || l.contains("SPDX-License-Identifier:")
        }),
        provides,
        requires,
        definitions,
    })
}
