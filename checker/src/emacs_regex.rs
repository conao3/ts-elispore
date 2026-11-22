use anyhow::{bail, Result};

pub fn translate(source: &str, case_insensitive: bool) -> Result<String> {
    let chars: Vec<char> = source.chars().collect();
    let mut out = String::from(if case_insensitive { "(?mi)" } else { "(?m)" });
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' => {
                let Some(&next) = chars.get(i + 1) else {
                    bail!("trailing backslash in {source:?}");
                };
                match next {
                    '(' | ')' | '|' | '{' | '}' => out.push(next),
                    '<' | '>' => out.push_str(r"\b"),
                    '\'' => out.push_str(r"\z"),
                    '`' => out.push_str(r"\A"),
                    'w' => out.push_str(r"\w"),
                    'W' => out.push_str(r"\W"),
                    _ => push_literal(&mut out, next),
                }
                i += 2;
            }
            '[' => {
                i = class(&chars, i, &mut out)?;
            }
            '(' | ')' | '|' | '{' | '}' => {
                push_literal(&mut out, c);
                i += 1;
            }
            '^' => {
                let anchored = i == 0 || chars[..i].ends_with(&['\\', '(']);
                if anchored {
                    out.push('^');
                } else {
                    push_literal(&mut out, c);
                }
                i += 1;
            }
            '$' => {
                let anchored = i + 1 == chars.len() || chars[i + 1..].starts_with(&['\\', ')']);
                if anchored {
                    out.push('$');
                } else {
                    push_literal(&mut out, c);
                }
                i += 1;
            }
            '.' | '*' | '+' | '?' => {
                out.push(c);
                i += 1;
            }
            _ => {
                push_literal(&mut out, c);
                i += 1;
            }
        }
    }
    Ok(out)
}

fn push_literal(out: &mut String, c: char) {
    out.push_str(&regex::escape(c.encode_utf8(&mut [0; 4])));
}

fn class(chars: &[char], start: usize, out: &mut String) -> Result<usize> {
    let mut i = start + 1;
    out.push('[');
    if chars.get(i) == Some(&'^') {
        out.push('^');
        i += 1;
    }
    let mut first = true;
    loop {
        let Some(&c) = chars.get(i) else {
            bail!("unterminated character class");
        };
        if c == ']' && !first {
            out.push(']');
            return Ok(i + 1);
        }
        if c == '[' && chars.get(i + 1) == Some(&':') {
            let rest: String = chars[i..].iter().collect();
            let Some(end) = rest.find(":]") else {
                bail!("unterminated character class name");
            };
            out.push_str(&rest[..end + 2]);
            i += rest[..end + 2].chars().count();
        } else {
            match c {
                '[' | ']' | '\\' | '&' | '~' => {
                    out.push('\\');
                    out.push(c);
                }
                '\n' => out.push_str(r"\n"),
                _ => out.push(c),
            }
            i += 1;
        }
        first = false;
    }
}

pub fn smart_space(source: &str) -> String {
    source.replace(' ', "[[:space:]\n]+")
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    fn matches(emacs: &str, text: &str) -> bool {
        Regex::new(&translate(emacs, false).unwrap())
            .unwrap()
            .is_match(text)
    }

    #[test]
    fn literals_groups_and_classes() {
        assert!(matches("(mapcar '[^,]", "(mapcar 'car xs)"));
        assert!(!matches("(mapcar '[^,]", "(mapcar ',x xs)"));
        assert!(matches("\n\\(;;;\\) .*\n;;; ", "x\n;;; a\n;;; b"));
        assert!(matches(r"(eq [^()]*\<nil\>.*)", "(eq x nil)"));
        assert!(!matches(r"(eq [^()]*\<nil\>.*)", "(eq x nils"));
        assert!(matches("`[A-Z]{2,}'", "`A{2,}'"));
        assert!(!matches("`[A-Z]{2,}'", "`AB'"));
        assert!(matches(
            r"(add-to-list 'auto-mode-alist.*\$",
            "(add-to-list 'auto-mode-alist '(\"x$\""
        ));
        assert!(matches("^(setq ", "a\n(setq x"));
        assert!(!matches("^(setq ", "a (setq x"));
        assert!(matches("[<>eq/=]+ (point)", "= (point)"));
        assert!(matches(
            "(defalias '[^[:space:]]+ '[^#()]*)",
            "(defalias 'a 'b)"
        ));
    }

    #[test]
    fn smart_spaces_span_newlines() {
        let emacs = smart_space("(with-temp-buffer (set-buffer ");
        assert!(matches(&emacs, "(with-temp-buffer\n  (set-buffer x"));
    }

    #[test]
    fn case_folding() {
        let re = Regex::new(&translate("copyright.*free", true).unwrap()).unwrap();
        assert!(re.is_match("Copyright 2020 Free"));
    }
}
