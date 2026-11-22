use crate::{
    emacs_regex,
    syntax::{self, State},
};
use regex::Regex;
use serde::Deserialize;
use std::sync::LazyLock;

pub const COMMIT: &str = "fcf5d883c6ced74ba16963d48c9e9e0bf0a1ff37";
pub const SHARP_QUOTE: &str = "It's safer to sharp-quote the names of existing functions; use `#'`";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Call {
    checker: String,
    line: u32,
    regexp: String,
    message: String,
    no_smart_space: bool,
    include_comments: bool,
    include_strings: bool,
    case_insensitive: bool,
    exclude: Option<String>,
}

pub struct Pattern {
    pub id: String,
    pub message: String,
    pub line: u32,
    regex: Regex,
    include_comments: bool,
    include_strings: bool,
    exclude: Option<Regex>,
}

pub struct Advice {
    pub id: String,
    pub message: String,
    pub line: u32,
}

pub fn slug(message: &str) -> String {
    let words: Vec<String> = message
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(6)
        .map(str::to_ascii_lowercase)
        .collect();
    format!("mz-{}", words.join("-"))
}

pub static PATTERNS: LazyLock<Vec<Pattern>> = LazyLock::new(|| {
    let calls: Vec<Call> =
        serde_json::from_str(include_str!("../melpazoid.json")).expect("melpazoid.json");
    calls
        .into_iter()
        .map(|call| {
            let source = if call.no_smart_space {
                call.regexp.clone()
            } else {
                emacs_regex::smart_space(&call.regexp)
            };
            let translated = emacs_regex::translate(&source, call.case_insensitive)
                .unwrap_or_else(|e| panic!("{}: {e}", call.regexp));
            let id = if call.message == SHARP_QUOTE {
                "sharp-quote".to_owned()
            } else {
                slug(&call.message)
            };
            debug_assert!(call.checker.starts_with("melpazoid-check-"));
            Pattern {
                id,
                message: call.message,
                line: call.line,
                regex: Regex::new(&translated).unwrap_or_else(|e| panic!("{translated}: {e}")),
                include_comments: call.include_comments,
                include_strings: call.include_strings,
                exclude: call.exclude.map(|x| {
                    Regex::new(&emacs_regex::translate(&x, false).expect("exclude"))
                        .expect("exclude")
                }),
            }
        })
        .collect()
});

const NATIVE: &[(&str, &str, u32)] = &[
    (
        "mz-author-header",
        "FYI only: To get `(lm-authors)` to work, write `;; Author: Your Name <email/url/@handle>`",
        230,
    ),
    (
        "mz-maintainer-header",
        "FYI only: To get `(lm-maintainers)` to work, write `;; Maintainer: Your Name <email/url/@handle>`",
        234,
    ),
    ("mz-commentary-stub", "`;;; Commentary` in main file should not be a stub", 245),
    ("mz-commentary-readme", "`;;; Commentary` should not just redirect to a README", 250),
    ("mz-commentary-url", "`;;; Commentary` should not just redirect to a URL", 255),
    ("mz-commentary-wide", "`;;; Commentary` is much wider than 80 characters", 261),
    (
        "mz-commentary-todo",
        "You can separate TODOs from package `;;; Commentary:` with a `;;; TODO:` section",
        265,
    ),
    ("mz-commentary-decoration", "`;;; Commentary` decoration like `;;;;...` will appear downstream", 269),
    ("mz-theme-load-path", "Warning: No `add-to-list 'custom-theme-load-path` found", 213),
    ("mz-theme-name", "Theme `NAME` does not match filename NAME.el", 221),
];

pub fn advice() -> Vec<Advice> {
    let mut out: Vec<Advice> = Vec::new();
    for p in PATTERNS.iter().filter(|p| p.id != "sharp-quote") {
        if !out.iter().any(|a| a.id == p.id) {
            out.push(Advice {
                id: p.id.clone(),
                message: p.message.clone(),
                line: p.line,
            });
        }
    }
    for (id, message, line) in NATIVE {
        out.push(Advice {
            id: (*id).to_owned(),
            message: (*message).to_owned(),
            line: *line,
        });
    }
    out
}

pub fn findings(text: &str, states: &[State]) -> Vec<&'static str> {
    let mut ids: Vec<&'static str> = Vec::new();
    for pattern in PATTERNS.iter() {
        if ids.contains(&pattern.id.as_str()) {
            continue;
        }
        let hit = pattern.regex.captures_iter(text).any(|caps| {
            let whole = caps.get(0).unwrap();
            let at = caps.get(1).unwrap_or(whole).start();
            let state = states.get(at).copied().unwrap_or(State::Code);
            (pattern.include_comments || state != State::Comment)
                && (pattern.include_strings || state != State::String)
                && !pattern
                    .exclude
                    .as_ref()
                    .is_some_and(|x| x.is_match(whole.as_str()))
        });
        if hit {
            ids.push(&pattern.id);
        }
    }
    ids
}

static AUTHOR_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?mi)^;; Author").unwrap());
static MAINTAINER_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?mi)^;; Maintainer").unwrap());
static AUTHOR_HEADER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?mi)^;+[ \t]+(@\(#\))?[ \t]*\$?(author)[ \t]*:[ \t]*").unwrap());
static MAINTAINER_HEADER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?mi)^;+[ \t]+(@\(#\))?[ \t]*\$?(maintainer)[ \t]*:[ \t]*").unwrap()
});
static COMMENTARY_SECTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?mi)^;;;;* (Commentary|Documentation):[ \t]*$").unwrap());
static ANY_SECTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?mi)^(;;;;*) .*:[ \t]*$").unwrap());
static COMMENTARY_STRIP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?mi)^;;;[ \t]*(Commentary|Documentation):[ \t\n]*|^;;[ \t]?|[ \t\n]*\z").unwrap()
});
static TRAILING_BLANKS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)[ \t]*$").unwrap());
static SEE_README: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)See .*README").unwrap());
static SEE_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)See https:/*").unwrap());
static WIDE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r".{90}").unwrap());
static TODO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?mi)^todo").unwrap());
static DECORATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^;;;;").unwrap());
static THEME_FACES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\(custom-theme-set-faces").unwrap());
static THEME_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\(add-to-list[[:space:]\n]+'custom-theme-load-path").unwrap()
});
static AUTOTHEMER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\(autothemer-deftheme[[:space:]\n]+\b(\w+)\b").unwrap());

static CODE_SECTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?mi)^;;;;* (Code):[ \t]*$").unwrap());
static CONTINUATION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^;+(\t|[\t ]{2,})(.+)").unwrap());

fn header_lines(text: &str, header: &Regex) -> Option<Vec<String>> {
    let bound = CODE_SECTION.find(text).map_or(text.len(), |m| m.start());
    let m = header.find(&text[..bound])?;
    let mut lines = text[m.end()..].lines();
    let first = lines.next().unwrap_or_default();
    if first.is_empty() {
        return None;
    }
    let mut out = vec![first.to_owned()];
    for line in lines {
        match CONTINUATION.captures(line) {
            Some(caps) => out.push(caps[2].to_owned()),
            None => break,
        }
    }
    Some(out)
}

fn addresses(lines: &[String]) -> bool {
    lines.iter().any(|l| l.contains('<') || l.contains('@'))
}

fn line_start(text: &str, at: usize) -> usize {
    text[..at].rfind('\n').map_or(0, |i| i + 1)
}

fn forward_comments(text: &str, from: usize) -> usize {
    let mut at = from;
    loop {
        let rest = &text[at..];
        let trimmed = rest.trim_start();
        at += rest.len() - trimmed.len();
        if trimmed.starts_with(';') {
            at += trimmed.find('\n').map_or(trimmed.len(), |i| i + 1);
        } else {
            return at;
        }
    }
}

pub fn commentary(text: &str) -> Option<String> {
    let start_match = COMMENTARY_SECTION.find(text)?;
    let start = start_match.start();
    let level = text[start..].chars().take_while(|&c| c == ';').count();
    let after = start_match.end() + 1;
    let mut end = text.len();
    if after <= text.len() {
        for caps in ANY_SECTION.captures_iter(&text[after..]) {
            if caps[1].len() <= level {
                let header = after + caps.get(0).unwrap().start();
                let previous = if header == 0 {
                    0
                } else {
                    line_start(text, header - 1)
                };
                end = if text[previous..].starts_with('\u{c}') {
                    previous
                } else {
                    header
                };
                break;
            }
        }
    }
    let end = end.min(forward_comments(text, start)).max(start);
    let body = COMMENTARY_STRIP.replace_all(&text[start..end], "");
    Some(TRAILING_BLANKS.replace_all(&body, "").into_owned())
}

pub fn native(text: &str, stem: &str, main: bool) -> Vec<&'static str> {
    let mut ids = Vec::new();
    let authors = header_lines(text, &AUTHOR_HEADER);
    if AUTHOR_LINE.is_match(text) && !authors.as_deref().is_some_and(addresses) {
        ids.push("mz-author-header");
    }
    let maintainers = header_lines(text, &MAINTAINER_HEADER).or(authors);
    if MAINTAINER_LINE.is_match(text) && !maintainers.as_deref().is_some_and(addresses) {
        ids.push("mz-maintainer-header");
    }
    if let Some(body) = commentary(text) {
        let length = body.chars().count();
        if length < 20 && main {
            ids.push("mz-commentary-stub");
        }
        if length < 80 && SEE_README.is_match(&body) {
            ids.push("mz-commentary-readme");
        }
        if length < 80 && SEE_URL.is_match(&body) {
            ids.push("mz-commentary-url");
        }
        if WIDE.is_match(&body) {
            ids.push("mz-commentary-wide");
        }
        if TODO.is_match(&body) {
            ids.push("mz-commentary-todo");
        }
        if DECORATION.is_match(&body) {
            ids.push("mz-commentary-decoration");
        }
    }
    if THEME_FACES.is_match(text) && !THEME_PATH.is_match(text) {
        ids.push("mz-theme-load-path");
    }
    if AUTOTHEMER
        .captures_iter(text)
        .any(|caps| format!("{}-theme", &caps[1]) != stem)
    {
        ids.push("mz-theme-name");
    }
    ids
}

pub fn states(text: &str) -> Vec<State> {
    syntax::states(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advice_ids_are_unique_per_message() {
        let advice = advice();
        for (i, a) in advice.iter().enumerate() {
            for b in &advice[i + 1..] {
                assert!(
                    a.id != b.id || a.message == b.message,
                    "{} {}",
                    a.message,
                    b.message
                );
            }
        }
    }

    #[test]
    fn findings_respect_comments_and_strings() {
        let text = "(mapcar 'car xs)\n;; (ignore-errors x)\n(message \"(ignore-errors\")\n";
        let ids = findings(text, &states(text));
        assert!(ids.contains(&"sharp-quote"));
        assert!(!ids
            .iter()
            .any(|id| id.starts_with("mz-avoid-ignore-errors")));
    }

    #[test]
    fn commentary_body() {
        let text = ";;; x.el --- X  -*- lexical-binding: t -*-\n\n;;; Commentary:\n\n;; See README.\n\n;;; Code:\n";
        assert_eq!(commentary(text).as_deref(), Some("See README."));
        let ids = native(text, "x", true);
        assert!(ids.contains(&"mz-commentary-stub"));
        assert!(ids.contains(&"mz-commentary-readme"));
    }

    #[test]
    fn author_and_maintainer_follow_lisp_mnt() {
        let ids = |header: &str| native(&format!("{header}\n;;; Code:\n"), "x", false);
        assert!(ids(";; Author: Bernhard Proell").contains(&"mz-author-header"));
        assert!(ids(";; Author: Name <x@y>").is_empty());
        assert!(ids(";; Author: @handle").is_empty());
        assert_eq!(
            ids(";; Author: Name <x@y>\n;; Maintainer: Fred Campos"),
            ["mz-maintainer-header"]
        );
        assert!(ids(";; Author: Name <https://x>\n;; Maintainer:").is_empty());
        assert!(ids(";; Author: Name\n;;         Other <o@p>").is_empty());
    }
}
