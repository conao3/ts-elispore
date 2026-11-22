#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Code,
    Comment,
    String,
}

fn symbol_char(c: char) -> bool {
    c.is_alphanumeric() || "-_+*/<>=!?$%&:^~.@".contains(c)
}

pub fn states(text: &str) -> Vec<State> {
    let mut out = vec![State::Code; text.len()];
    let mut chars = text.char_indices().peekable();
    let mut state = State::Code;
    let mut previous: Option<char> = None;
    while let Some((i, c)) = chars.next() {
        let len = c.len_utf8();
        out[i..i + len].fill(state);
        match state {
            State::Comment => {
                if c == '\n' {
                    state = State::Code;
                }
            }
            State::String => match c {
                '\\' => {
                    if let Some((j, d)) = chars.next() {
                        out[j..j + d.len_utf8()].fill(State::String);
                    }
                }
                '"' => state = State::Code,
                _ => {}
            },
            State::Code => match c {
                ';' => state = State::Comment,
                '"' => state = State::String,
                '\\' => {
                    if let Some((j, d)) = chars.next() {
                        out[j..j + d.len_utf8()].fill(State::Code);
                    }
                }
                '?' if !previous.is_some_and(symbol_char) => {
                    if let Some((j, d)) = chars.next() {
                        out[j..j + d.len_utf8()].fill(State::Code);
                        if d == '\\' {
                            if let Some((k, e)) = chars.next() {
                                out[k..k + e.len_utf8()].fill(State::Code);
                            }
                        }
                    }
                }
                _ => {}
            },
        }
        previous = Some(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str, needle: &str) -> State {
        states(text)[text.find(needle).unwrap()]
    }

    #[test]
    fn comments_strings_and_characters() {
        let text = "(a \"x;y\" ?\\\" ?; b) ; (c\n(d \"e\\\"f\")";
        assert_eq!(at(text, "(a"), State::Code);
        assert_eq!(at(text, "x;y"), State::String);
        assert_eq!(at(text, "b)"), State::Code);
        assert_eq!(at(text, "(c"), State::Comment);
        assert_eq!(at(text, "(d"), State::Code);
        assert_eq!(at(text, "f\""), State::String);
        assert_eq!(at(text, "\"e"), State::Code);
    }

    #[test]
    fn question_mark_inside_symbols() {
        let text = "(foo? \"s\")";
        assert_eq!(at(text, "s\""), State::String);
    }
}
