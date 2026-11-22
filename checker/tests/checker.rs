use elispore_check::{archive, melpazoid, policy, scanner, sexp};

const GOOD: &str = include_str!("fixtures/sample.el");
const BAD: &str = include_str!("fixtures/broken.el");

fn package(files: Vec<policy::FileFacts>, main_requires: Vec<String>) -> policy::PackageFacts {
    policy::PackageFacts {
        name: "sample".into(),
        source: "melpa".into(),
        files,
        main_requires,
        has_license_file: false,
        repo_clean: true,
        packaged_docs: false,
    }
}

fn failed(facts: policy::PackageFacts) -> Vec<String> {
    policy::evaluate(facts)
        .into_iter()
        .filter_map(|(id, (applies, pass))| (applies && !pass).then_some(id))
        .collect()
}

fn single(name: &str, text: &str) -> Vec<String> {
    failed(package(
        vec![scanner::scan(name, text, "sample").unwrap()],
        scanner::requirements(text),
    ))
}

#[test]
fn passing_fixture() {
    let results = policy::evaluate(package(
        vec![scanner::scan("sample.el", GOOD, "sample").unwrap()],
        vec![],
    ));
    assert_eq!(
        results.iter().map(|(id, _)| id).collect::<Vec<_>>(),
        policy::rules().iter().map(|r| &r.id).collect::<Vec<_>>()
    );
    assert!(single("sample.el", GOOD).is_empty());
    let advice = scanner::scan("sample.el", GOOD, "sample").unwrap().advice;
    assert!(advice.is_empty(), "{advice:?}");
}

#[test]
fn failing_fixture() {
    assert_eq!(
        single("broken.el", BAD),
        [
            "main-file",
            "packaging-header",
            "file-prefix",
            "lexical-binding",
            "license-notice",
            "requires-main"
        ]
    );
}

#[test]
fn each_rule_fails_independently() {
    for (id, from, to) in [
        (
            "packaging-header",
            ";;; sample.el --- A sample package",
            ";;; sample.el - A sample package",
        ),
        (
            "lexical-binding",
            "lexical-binding: t",
            "lexical-binding: nil",
        ),
        ("license-notice", "SPDX-License-Identifier:", "License:"),
        ("license-spdx", "GPL-3.0-or-later", "GPL-2.0-only"),
        (
            "license-position",
            ";; SPDX-License-Identifier: GPL-3.0-or-later\n;;; Commentary:\n",
            ";;; Commentary:\n;; SPDX-License-Identifier: GPL-3.0-or-later\n",
        ),
        (
            "requires-unquoted",
            ";; Package-Requires: ()",
            ";; Package-Requires: ((\"emacs\" \"26.1\"))",
        ),
        (
            "url-unquoted",
            ";; Homepage: https://example.org/sample",
            ";; Homepage: \"https://example.org/sample\"",
        ),
        (
            "sharp-quote",
            "(provide 'sample)",
            "(mapcar 'car nil)\n(provide 'sample)",
        ),
        (
            "face-inherit",
            "(provide 'sample)",
            "(defface sample-face '((t :inherit bold :underline t)) \"Face.\")\n(provide 'sample)",
        ),
    ] {
        let text = GOOD.replace(from, to);
        assert_ne!(text, GOOD, "{id}");
        assert_eq!(single("sample.el", &text), [id], "{id}");
    }
}

#[test]
fn package_level_rules() {
    let main = scanner::scan("sample.el", GOOD, "sample").unwrap();
    let extra_text = GOOD.replace("sample.el", "sample-extra.el").replace(
        ";; Package-Requires: ()",
        ";; Package-Requires: ((dash \"2.19\"))",
    );
    let extra = scanner::scan("sample-extra.el", &extra_text, "sample").unwrap();
    assert_eq!(
        failed(package(vec![main.clone(), extra.clone()], vec![])),
        ["requires-main"]
    );
    assert!(failed(package(
        vec![main.clone(), extra.clone()],
        vec!["dash \"2.19\"".into()]
    ))
    .is_empty());
    let other =
        scanner::scan("other.el", &GOOD.replace("sample.el", "other.el"), "sample").unwrap();
    assert_eq!(
        failed(package(vec![main.clone(), other.clone()], vec![])),
        ["file-prefix"]
    );
    assert_eq!(
        failed(package(vec![other], vec![])),
        ["main-file", "file-prefix", "requires-main"]
    );
    for (source, docs, license, clean, expected) in [
        ("melpa", true, true, true, vec!["packaged-docs"]),
        (
            "github",
            true,
            false,
            false,
            vec!["license-file", "repo-clean"],
        ),
        ("gnu-elpa", true, false, false, vec![]),
    ] {
        let facts = policy::PackageFacts {
            source: source.into(),
            packaged_docs: docs,
            has_license_file: license,
            repo_clean: clean,
            ..package(vec![main.clone()], vec![])
        };
        assert_eq!(failed(facts), expected, "{source}");
    }
    assert!(policy::prefixed_file("foo-mode", "foo-bar.el"));
    assert!(policy::prefixed_file("foo-themes", "foo.el"));
    assert!(!policy::prefixed_file("foo", "foobar.el"));
}

#[test]
fn license_position_uses_the_earliest_notice() {
    let text = GOOD.replace(
        ";; SPDX-License-Identifier: GPL-3.0-or-later\n;;; Commentary:\n",
        ";; This program is free software: you can redistribute it\n;;; Commentary:\n;; SPDX-License-Identifier: GPL-3.0-or-later\n",
    );
    assert_ne!(text, GOOD);
    assert!(single("sample.el", &text).is_empty());
}

#[test]
fn requirements_follow_melpazoid() {
    assert_eq!(
        scanner::requirements(";; package-requires: ((emacs \"24.4\"))"),
        ["emacs \"24.4\""]
    );
    assert_eq!(
        scanner::requirements(";; Package-Requires: ((emacs \"27.1\") websocket f)"),
        ["emacs \"27.1\"", "f", "websocket"]
    );
    assert_eq!(
        scanner::requirements("Package-Requires: ((emacs \"29.1\")\n(calfw \"2.0\"))"),
        ["calfw \"2.0\"", "emacs \"29.1\""]
    );
    assert_eq!(
        scanner::pkg_requirements("(define-package \"x\" \"1.2\" \"A pkg.\" '(a (b \"31.5\")))"),
        ["a", "b \"31.5\""]
    );
}

#[test]
fn advice_matches_melpazoid_patterns() {
    let text = GOOD.replace(
        "(provide 'sample)",
        "(when (not x) (ignore-errors (progn y)))\n(global-set-key \"a\" #'ignore)\n(provide 'sample)",
    );
    let advice = scanner::scan("sample.el", &text, "sample").unwrap().advice;
    for message in [
        "Avoid `ignore-errors` in production code; handle the root cause whenever possible",
        "No `progn` required under `ignore-errors`",
        "Don't set global bindings; create a global minor-mode map or instruct users in `;;; Commentary`.",
    ] {
        assert!(advice.contains(&melpazoid::slug(message)), "{message}: {advice:?}");
    }
    let ids: Vec<String> = melpazoid::advice().into_iter().map(|a| a.id).collect();
    assert!(advice.iter().all(|id| ids.contains(id)));
}

#[test]
fn scanner_ignores_data_comments_strings_and_characters() {
    let facts = scanner::scan(
        "sample.el",
        r#"
; (require 'cl)
"(provide 'wrong)" "escaped \" (require 'cl)"
'(require 'cl)
(quote (require 'cl))
[(require 'cl) (provide 'wrong)]
(defvar sample-data [(require 'cl) (provide 'wrong)])
[defun unrelated () nil]
?\( ?\) ?\; ?\" ?x ?\C-\M-a
?\^? ?\^\( ?\M-\^?
[?\C-c?\C-^] (eq ?\C-^ ?\M-^)
(defun sample-top () (defun unrelated () nil))
(define-obsolete-function-alias 'unrelated 'other "1")
(defvar unrelated)
(declare-function unrelated "other")
(when t (require 'real))
(provide (quote sample))
(cl-defmethod sample-method ((_ (eql \`))) nil)
`(,?\( ,?\) ,?\;)
"#,
        "sample",
    )
    .unwrap();
    assert!(facts.requires.is_empty());
    assert!(!facts.face_inherit_override);
}

#[test]
fn lexical_binding_only_on_first_line() {
    assert!(
        !scanner::scan(
            "sample.el",
            ";;; sample -*- lexical-binding: nil; -*-\n;; lexical-binding: t",
            "sample"
        )
        .unwrap()
        .lexical_binding
    );
}

#[test]
fn excludes_generated_and_tests() {
    for path in [
        "foo-pkg.el",
        "foo-autoloads.el",
        "test/foo.el",
        "pkg/tests/foo.el",
        "foo-test.el",
        "foo-tests.el",
        "README",
    ] {
        assert!(!scanner::included(path, "sample"), "{path}");
    }
    assert!(scanner::included("lisp/test-helper.el", "sample"));
    for name in ["cursor-test", "toggle-test", "sample-tests"] {
        assert!(scanner::included(&format!("lisp/{name}.el"), name));
        assert!(!scanner::included(&format!("tests/{name}.el"), name));
        let package = archive::Package {
            key: format!("melpa/{name}"),
            name: name.into(),
            version: "1".into(),
            url: String::new(),
            kind: "single".into(),
        };
        let facts = archive::unpack(&package, GOOD.as_bytes()).unwrap();
        assert_eq!(facts.files.len(), 1);
        let mut package = package;
        package.kind = "tar".into();
        let facts = archive::unpack(
            &package,
            &tarball(&[(&format!("p/{name}.el"), GOOD)], false),
        )
        .unwrap();
        assert_eq!(facts.files.len(), 1);
    }
}

#[test]
fn parser_and_scanner_errors() {
    for text in [
        "(",
        "\"unterminated",
        ")",
        "(provide 'sample]",
        "[require 'cl)",
        "([)]",
        "[(])",
    ] {
        assert!(sexp::parse(text).is_err());
        assert!(scanner::scan("sample.el", text, "sample").is_err());
    }
    assert!(scanner::scan("README", "", "sample").is_err());
}

#[test]
fn archive_index_and_single_package() {
    let packages = archive::index("melpa", "https://example.org", r#"(1 (sample . [(20260101 42) nil "Summary" single ((:url . "https://example.org"))]) (other . [(1 2 3) nil "Summary" tar]))"#).unwrap();
    assert_eq!(packages[0].version, "20260101.42");
    assert_eq!(packages[0].url, "https://example.org/sample-20260101.42.el");
    let facts = archive::unpack(&packages[0], GOOD.as_bytes()).unwrap();
    assert!(failed(facts).is_empty());
    assert_eq!(archive::index("x", "x", "(1)").unwrap().len(), 0);
    for index in [
        "()",
        "(2)",
        "(1 (foo . []))",
        "(1 (../foo . [(1) nil \"x\" tar]))",
    ] {
        assert!(archive::index("x", "x", index).is_err());
    }
    assert!(archive::unpack(&packages[1], b"not a tar archive").is_err());
    assert!(archive::github("owner/emacs-sample.el").is_ok());
    assert!(archive::github("../sample").is_err());
    assert_eq!(
        archive::index(
            "melpa",
            "https://example.org",
            "(1 (@ . [(1) nil \"At\" single]))"
        )
        .unwrap()[0]
            .name,
        "@"
    );
}

fn tarball(files: &[(&str, &str)], gzip: bool) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (name, text) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(text.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, name, text.as_bytes())
            .unwrap();
    }
    let bytes = builder.into_inner().unwrap();
    if gzip {
        use std::io::Write;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&bytes).unwrap();
        encoder.finish().unwrap()
    } else {
        bytes
    }
}

#[test]
fn tar_and_github_main_selection_license_and_exclusions() {
    let mut package = archive::github("owner/emacs-other.el").unwrap();
    let data = tarball(
        &[
            ("repo-HEAD/sample.el", GOOD),
            ("repo-HEAD/longer-name.el", GOOD),
            ("repo-HEAD/tests/broken.el", "("),
            ("repo-HEAD/sample-pkg.el", "("),
            ("repo-HEAD/examples/demo.el", "("),
            ("repo-HEAD/lisp/sample-more.el", GOOD),
            ("repo-HEAD/sample.elc", ""),
            ("repo-HEAD/LICENSE.md", "license"),
        ],
        true,
    );
    let facts = archive::unpack(&package, &data).unwrap();
    assert_eq!(facts.name, "sample");
    assert_eq!(facts.files.len(), 3);
    assert!(facts.has_license_file);
    assert!(!facts.repo_clean);
    package.name = "longer-name".into();
    assert_eq!(
        archive::unpack(&package, &data).unwrap().name,
        "longer-name"
    );
    package.kind = "tar".into();
    assert!(archive::unpack(&package, &tarball(&[], false)).is_err());
    assert!(archive::unpack(&package, &tarball(&[("p/sample.el", "(")], false)).is_err());
    let facts = archive::unpack(
        &package,
        &tarball(&[("p/sample.el", GOOD), ("p/README.md", "docs")], false),
    )
    .unwrap();
    assert!(facts.packaged_docs);
    assert!(!facts.has_license_file);
}
