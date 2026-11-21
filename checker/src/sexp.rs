use anyhow::{bail, Context, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Sexp {
    Atom(String),
    Text,
    List(Vec<Sexp>),
    Quote(Box<Sexp>),
}

impl Sexp {
    pub fn atom(&self) -> Option<&str> {
        match self {
            Self::Atom(s) => Some(s),
            _ => None,
        }
    }
    pub fn list(&self) -> Option<&[Self]> {
        match self {
            Self::List(xs) => Some(xs),
            _ => None,
        }
    }
}

pub fn parse(text: &str) -> Result<Vec<Sexp>> {
    let mut parser = Parser {
        chars: text.chars().peekable(),
    };
    let mut forms = Vec::new();
    loop {
        parser.space();
        if parser.chars.peek().is_none() {
            break;
        }
        forms.push(parser.form(0).with_context(|| {
            format!(
                "near character {}",
                text.chars().count() - parser.chars.clone().count()
            )
        })?);
    }
    Ok(forms)
}

struct Parser<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
}

impl Parser<'_> {
    fn space(&mut self) {
        loop {
            match self.chars.peek() {
                Some(c) if c.is_whitespace() => {
                    self.chars.next();
                }
                Some(';') => {
                    for c in self.chars.by_ref() {
                        if c == '\n' {
                            break;
                        }
                    }
                }
                _ => break,
            }
        }
    }

    fn form(&mut self, depth: usize) -> Result<Sexp> {
        if depth > 512 {
            bail!("sexp nesting exceeds 512");
        }
        self.space();
        match self.chars.next() {
            Some('(' | '[') => {
                let mut xs = Vec::new();
                loop {
                    self.space();
                    match self.chars.peek() {
                        Some(')' | ']') => {
                            self.chars.next();
                            break;
                        }
                        None => bail!("unterminated list"),
                        _ => xs.push(self.form(depth + 1)?),
                    }
                }
                Ok(Sexp::List(xs))
            }
            Some(')' | ']') => bail!("unexpected closing delimiter"),
            Some('\'' | '`') => Ok(Sexp::Quote(Box::new(self.form(depth + 1)?))),
            Some(',') => {
                if self.chars.peek() == Some(&'@') {
                    self.chars.next();
                }
                self.form(depth + 1)
            }
            Some('"') => {
                loop {
                    match self.chars.next() {
                        Some('\\') => {
                            self.chars.next();
                        }
                        Some('"') => break,
                        None => bail!("unterminated string"),
                        _ => {}
                    }
                }
                Ok(Sexp::Text)
            }
            Some('?') => {
                if self.chars.next() == Some('\\') {
                    loop {
                        match self.chars.next() {
                            Some('C' | 'M' | 'S' | 'H' | 'A' | 's')
                                if self.chars.peek() == Some(&'-') =>
                            {
                                self.chars.next();
                                if self.chars.peek() == Some(&'\\') {
                                    self.chars.next();
                                } else {
                                    self.chars.next();
                                    break;
                                }
                            }
                            Some('^') => {
                                if self.chars.peek() == Some(&'\\') {
                                    self.chars.next();
                                } else {
                                    self.chars.next();
                                    break;
                                }
                            }
                            _ => break,
                        }
                    }
                }
                Ok(Sexp::Text)
            }
            Some('#') if self.chars.peek() == Some(&'\'') => {
                self.chars.next();
                Ok(Sexp::Quote(Box::new(self.form(depth + 1)?)))
            }
            Some(c) => {
                let mut atom = String::from(if c == '\\' {
                    self.chars.next().context("unterminated symbol escape")?
                } else {
                    c
                });
                while let Some(&c) = self.chars.peek() {
                    if c.is_whitespace() || "()[];\"'`,".contains(c) {
                        break;
                    }
                    self.chars.next();
                    if c == '\\' {
                        if let Some(c) = self.chars.next() {
                            atom.push(c);
                        }
                    } else {
                        atom.push(c);
                    }
                }
                Ok(Sexp::Atom(atom))
            }
            None => bail!("expected sexp"),
        }
    }
}
