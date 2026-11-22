use crate::{
    melpazoid,
    policy::FileFacts,
    sexp::{self, Sexp},
};
use anyhow::{Context, Result};
use regex::Regex;
use std::{path::Path, sync::LazyLock};

pub fn included(path: &str, package_name: &str) -> bool {
    let path = Path::new(path);
    let name = path
        .file_name()
        .and_then(|x| x.to_str())
        .unwrap_or_default();
    name.ends_with(".el")
        && !name.starts_with(".dir-locals")
        && !["test.el", "tests.el"].contains(&name)
        && !["-pkg.el", "-autoloads.el"]
            .iter()
            .any(|s| name.ends_with(s))
        && (name == format!("{package_name}.el")
            || !["-test.el", "-tests.el"].iter().any(|s| name.ends_with(s)))
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

fn calls(form: &Sexp, name: &str) -> bool {
    form.list().is_some_and(|xs| {
        !matches!(xs.first().and_then(Sexp::atom), Some("quote" | "function"))
            && (xs.first().and_then(Sexp::atom) == Some(name) || xs.iter().any(|x| calls(x, name)))
    })
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

static SPDX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)SPDX-License-Identifier:[ ]*(\w\S+)").unwrap());
static LICENSE_EXCERPTS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        "(?i)Licensed under the Apache License, Version 2.0",
        "|Redistribution and use in source and binary forms",
        "|Copying and distribution of this file, with or without",
        "|is free software.* you can redistribute it",
        "|Permission to use, copy, modify, and/or distribute this",
        "|Permission is hereby granted, free of charge, to any person",
        "|This source code form is subject to the terms of the Mozilla",
        "|This is free and unencumbered software released into",
    ))
    .unwrap()
});
static COMMENTARY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^;;; Commentary").unwrap());
static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i);; (URL|Homepage):[ ]*(.+)").unwrap());

fn shlex(text: &str) -> Vec<String> {
    let word = |c: char| c.is_alphanumeric() || "_':-".contains(c);
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c.is_whitespace() || c == ';' {
            continue;
        }
        if c == '"' {
            let mut token = String::from('"');
            for d in chars.by_ref() {
                token.push(d);
                if d == '"' {
                    break;
                }
            }
            tokens.push(token);
        } else if word(c) {
            let mut token = String::from(c);
            while let Some(&d) = chars.peek() {
                if !word(d) {
                    break;
                }
                token.push(d);
                chars.next();
            }
            tokens.push(token);
        } else {
            tokens.push(c.to_string());
        }
    }
    tokens
}

static REQUIREMENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\( [^()]+ \)|[a-z]+").unwrap());

pub fn requirements(text: &str) -> Vec<String> {
    let tokens = shlex(text);
    let Some(start) = tokens
        .iter()
        .position(|t| t.to_lowercase() == "package-requires:")
    else {
        return Vec::new();
    };
    let mut depth = 0i32;
    let mut taken = Vec::new();
    for token in &tokens[start + 1..] {
        taken.push(token.as_str());
        depth += i32::from(token == "(");
        depth -= i32::from(token == ")");
        if depth <= 0 {
            break;
        }
    }
    if taken.len() < 2 || taken[0] != "(" || taken[taken.len() - 1] != ")" {
        return Vec::new();
    }
    let substring = taken[1..taken.len() - 1].join(" ");
    let mut out: Vec<String> = REQUIREMENT
        .find_iter(&substring)
        .map(|m| {
            m.as_str()
                .to_lowercase()
                .replace("( ", "")
                .replace(" )", "")
        })
        .collect();
    out.sort();
    out.dedup();
    out
}

pub fn pkg_requirements(text: &str) -> Vec<String> {
    let tokens = shlex(text);
    if tokens.len() < 6 {
        return Vec::new();
    }
    let joined = tokens[5..tokens.len() - 1].join(" ");
    let Some(open) = joined.find("' (") else {
        return Vec::new();
    };
    let reqs = &joined[open + 2..];
    let reqs = match reqs.find(") )") {
        Some(close) => &reqs[..close + 3],
        None => reqs,
    };
    let mut out: Vec<String> = reqs
        .split(['(', ')'])
        .map(|r| r.trim().to_lowercase())
        .filter(|r| !r.is_empty())
        .collect();
    out.sort();
    out.dedup();
    out
}

fn face_spec_overrides(spec: &Sexp) -> bool {
    let spec = match spec {
        Sexp::Quote(x) => x.as_ref(),
        x => x,
    };
    spec.list().is_some_and(|entries| {
        entries.iter().filter_map(Sexp::list).any(|entry| {
            let rest = entry.get(1..).unwrap_or_default();
            let plist = match rest {
                [x] | [Sexp::Atom(_), x] if rest.len() == 1 || rest[0].atom() == Some(".") => {
                    x.list().unwrap_or(rest)
                }
                _ => rest,
            };
            let keys: Vec<&str> = plist
                .iter()
                .filter_map(Sexp::atom)
                .filter(|a| a.starts_with(':'))
                .collect();
            keys.contains(&":inherit") && keys.iter().any(|k| *k != ":inherit")
        })
    })
}

fn face_overrides(form: &Sexp) -> bool {
    match form {
        Sexp::List(xs) => {
            (xs.first().and_then(Sexp::atom) == Some("defface")
                && xs.get(2).is_some_and(face_spec_overrides))
                || xs.iter().any(face_overrides)
        }
        Sexp::Vector(xs) => xs.iter().any(face_overrides),
        _ => false,
    }
}

pub fn scan(path: &str, text: &str, package_name: &str) -> Result<FileFacts> {
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
    let spdx = SPDX.captures(text);
    let license_start = spdx
        .as_ref()
        .map(|c| c.get(0).unwrap().start())
        .into_iter()
        .chain(LICENSE_EXCERPTS.find(text).map(|m| m.start()))
        .min();
    let commentary = COMMENTARY.find(text).map(|m| m.start());
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
    let states = melpazoid::states(text);
    let mut advice = melpazoid::findings(text, &states);
    let sharp_quote = advice.contains(&"sharp-quote");
    advice.retain(|id| *id != "sharp-quote");
    advice.extend(melpazoid::native(text, &stem, stem == package_name));
    let mut advice: Vec<String> = advice.into_iter().map(str::to_owned).collect();
    advice.sort();
    advice.dedup();
    Ok(FileFacts {
        file_name,
        stem,
        first_line,
        lexical_binding,
        license_notice: license_start.is_some(),
        spdx_id: spdx.map(|c| c[1].to_owned()).unwrap_or_default(),
        license_before_commentary: match (license_start, commentary) {
            (Some(at), Some(c)) => at < c,
            _ => true,
        },
        package_requires: requirements(text),
        url_quoted: URL.captures(text).is_some_and(|c| c[2].contains('"')),
        missing_sharp_quote: sharp_quote,
        face_inherit_override: forms.iter().any(face_overrides),
        author: !header(text, &["Author"]).is_empty(),
        version: !header(text, &["Version", "Package-Version"]).is_empty(),
        code_section: comment_lines.iter().any(|l| l.trim() == ";;; Code:"),
        footer: comment_lines.iter().any(|l| {
            l.trim()
                == format!(
                    ";;; {} ends here",
                    Path::new(path).file_name().unwrap().to_string_lossy()
                )
        }),
        provides,
        provides_theme: forms.iter().any(|form| calls(form, "provide-theme")),
        requires,
        definitions,
        advice,
    })
}
