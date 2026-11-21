use elispore_check::{archive, policy, scanner, sexp};

const GOOD: &str = include_str!("fixtures/sample.el");
const BAD: &str = include_str!("fixtures/broken.el");

fn evaluate(name: &str, text: &str) -> Vec<(String, bool)> {
    policy::evaluate(policy::PackageFacts {
        name: "sample".into(),
        files: vec![scanner::scan(name, text).unwrap()],
        has_license_file: false,
    })
}

#[test]
fn passing_fixture() {
    let results = evaluate("sample.el", GOOD);
    assert_eq!(results.len(), 14);
    assert!(results.iter().all(|(_, passed)| *passed), "{results:?}");
    assert_eq!(
        results.iter().map(|(id, _)| id).collect::<Vec<_>>(),
        policy::rules().iter().map(|r| &r.id).collect::<Vec<_>>()
    );
}

#[test]
fn failing_fixture_covers_every_rule() {
    let results = evaluate("broken.el", BAD);
    assert!(results.iter().all(|(_, passed)| !passed), "{results:?}");
}

#[test]
fn each_rule_fails_independently() {
    for (id, from, to) in [
        (
            "summary-line",
            ";;; sample.el --- A sample package",
            ";;; wrong.el ---",
        ),
        (
            "lexical-binding",
            "lexical-binding: t",
            "lexical-binding: nil",
        ),
        ("author", ";; Author:", ";; Missing:"),
        ("url", ";; Homepage:", ";; Missing:"),
        ("version", ";; Package-Version:", ";; Missing:"),
        ("package-requires", ";; Package-Requires:", ";; Missing:"),
        ("commentary", ";;; Commentary:", ";;; Missing:"),
        ("code-section", ";;; Code:", ";;; Missing:"),
        ("provide", "(provide 'sample)", "(provide 'other)"),
        (
            "footer",
            ";;; sample.el ends here",
            ";;; other.el ends here",
        ),
        ("license", "SPDX-License-Identifier:", "Missing:"),
        ("symbol-prefix", "(defvar sample/value", "(defvar unrelated"),
        ("no-cl", "(require 'cl-lib)", "(require 'cl)"),
    ] {
        let results = evaluate("sample.el", &GOOD.replace(from, to));
        assert_eq!(
            results
                .into_iter()
                .filter_map(|(id, pass)| (!pass).then_some(id))
                .collect::<Vec<_>>(),
            [id],
            "{id}"
        );
    }
}

#[test]
fn empty_package_and_file() {
    let empty = scanner::scan("sample.el", "").unwrap();
    assert!(!empty.lexical_binding);
    assert!(empty.provides.is_empty());
    assert!(empty.definitions.is_empty());
    let results = policy::evaluate(policy::PackageFacts {
        name: "sample".into(),
        files: vec![],
        has_license_file: false,
    });
    assert!(!results.iter().find(|(id, _)| id == "main-file").unwrap().1);
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
    )
    .unwrap();
    assert_eq!(facts.requires, ["real"]);
    assert_eq!(facts.provides, ["sample"]);
    assert_eq!(facts.definitions, ["sample-data", "sample-top"]);
}

#[test]
fn scanner_headers_and_file_prefix() {
    let facts = scanner::scan(
        "sub/sample-extra.el",
        &GOOD
            .replace("sample.el", "sample-extra.el")
            .replace("sample-command", "sample-extra-command"),
    )
    .unwrap();
    assert_eq!(facts.maintainer, "Example Maintainer");
    assert_eq!(facts.keywords, "tools");
    assert!(policy::symbol_prefix(policy::PackageFacts {
        name: "different".into(),
        files: vec![scanner::scan("sample.el", GOOD).unwrap()],
        has_license_file: false
    }));
    assert!(policy::prefixed("sample", "sample"));
    assert!(!policy::prefixed("sample", "samples"));
    assert!(
        !scanner::scan(
            "sample.el",
            ";;; sample -*- lexical-binding: nil; -*-\n;; lexical-binding: t"
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
    for text in ["(", "\"unterminated", ")"] {
        assert!(sexp::parse(text).is_err());
        assert!(scanner::scan("sample.el", text).is_err());
    }
    assert!(scanner::scan("README", "").is_err());
}

#[test]
fn archive_index_and_single_package() {
    let packages = archive::index("melpa", "https://example.org", r#"(1 (sample . [(20260101 42) nil "Summary" single ((:url . "https://example.org"))]) (other . [(1 2 3) nil "Summary" tar]))"#).unwrap();
    assert_eq!(packages[0].version, "20260101.42");
    assert_eq!(packages[0].url, "https://example.org/sample-20260101.42.el");
    let facts = archive::unpack(&packages[0], GOOD.as_bytes()).unwrap();
    assert!(policy::evaluate(facts).into_iter().all(|(_, pass)| pass));
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
            ("repo-HEAD/LICENSE.md", "license"),
        ],
        true,
    );
    let facts = archive::unpack(&package, &data).unwrap();
    assert_eq!(facts.name, "sample");
    assert_eq!(facts.files.len(), 2);
    assert!(facts.has_license_file);
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
        &tarball(&[("p/sample.el", GOOD), ("p/COPYING", "license")], false),
    )
    .unwrap();
    assert!(facts.has_license_file);
}
