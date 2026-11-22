pub mod archive;
pub mod emacs_regex;
pub mod melpazoid;
pub mod scanner;
pub mod sexp;
pub mod syntax;

pub const RULE_SET_VERSION: u32 = 4;

leanfran::lean! {
    pub mod policy;
    r#"
    structure FileFacts where
      fileName : String
      stem : String
      firstLine : String
      lexicalBinding : Bool
      licenseNotice : Bool
      spdxId : String
      licenseBeforeCommentary : Bool
      requires : List String
      urlQuoted : Bool
      missingSharpQuote : Bool
      faceInheritOverride : Bool
      advice : List String

    structure PackageFacts where
      name : String
      source : String
      files : List FileFacts
      mainRequires : List String
      hasLicenseFile : Bool
      repoClean : Bool
      packagedDocs : Bool

    structure Rule where
      id : String
      title : String
      description : String
      source : String

    def contributing (line : String) : String :=
      "https://github.com/melpa/melpa/blob/8d525bf492f8ae18a3855775eb2e3c65e957ad10/CONTRIBUTING.org?plain=1#L" ++ line

    def melpazoidPy (line : String) : String :=
      "https://github.com/riscy/melpazoid/blob/fcf5d883c6ced74ba16963d48c9e9e0bf0a1ff37/melpazoid/melpazoid.py#L" ++ line

    def mainFile (p : PackageFacts) : Bool :=
      p.files.any (fun f => f.fileName == p.name ++ ".el")

    def summaryHeader (line : String) : Bool :=
      ((((line.splitOn "-*-").headD "").splitOn " --- ").length) > 1

    def packagingHeader (p : PackageFacts) : Bool := p.files.all (summaryHeader ·.firstLine)

    def withoutSuffix (name suffix : String) : String :=
      if name.endsWith suffix then String.ofList (name.toList.take (name.length - suffix.length)) else name

    def filePrefix (name : String) : String :=
      if name.endsWith "-mode" then withoutSuffix name "-mode" else withoutSuffix name "-themes"

    def prefixedFile (name fileName : String) : Bool :=
      (filePrefix name ++ "-").isPrefixOf fileName || (filePrefix name ++ ".").isPrefixOf fileName

    def fileNames (p : PackageFacts) : Bool := p.files.all (prefixedFile p.name ·.fileName)
    def lexicalBinding (p : PackageFacts) : Bool := p.files.all (·.lexicalBinding)
    def licenseNotice (p : PackageFacts) : Bool := p.files.all (·.licenseNotice)
    def licenseSpdx (p : PackageFacts) : Bool := p.files.all (·.spdxId != "GPL-2.0-only")
    def licensePosition (p : PackageFacts) : Bool := p.files.all (·.licenseBeforeCommentary)

    def requiresMain (p : PackageFacts) : Bool :=
      mainFile p && p.files.all (fun f => f.requires.all (p.mainRequires.contains ·))

    def unquotedName (requirement : String) : Bool :=
      !(((requirement.splitOn " ").headD "").contains '"')

    def requiresUnquoted (p : PackageFacts) : Bool := p.files.all (·.requires.all unquotedName)
    def urlUnquoted (p : PackageFacts) : Bool := p.files.all (!·.urlQuoted)
    def sharpQuote (p : PackageFacts) : Bool := p.files.all (!·.missingSharpQuote)
    def faceInherit (p : PackageFacts) : Bool := p.files.all (!·.faceInheritOverride)

    theorem requiresMain_mainFile (p : PackageFacts) (h : requiresMain p = true) :
        mainFile p = true := by
      simp [requiresMain] at h
      exact h.1

    def rules : List Rule := [
      ⟨"main-file", "Main file", "A file named <package>.el exists.", melpazoidPy "492"⟩,
      ⟨"packaging-header", "Packaging header", "Every file starts with a `;;; <file>.el --- <summary>` line.", melpazoidPy "530"⟩,
      ⟨"file-prefix", "File names", "Every file name starts with the package name (without -mode or -themes) followed by - or a dot.", melpazoidPy "522"⟩,
      ⟨"packaged-docs", "No packaged docs", "The MELPA package does not ship change logs, READMEs or license files.", contributing "127"⟩,
      ⟨"lexical-binding", "Lexical binding", "Every file enables lexical binding on its first line.", contributing "147"⟩,
      ⟨"license-notice", "License boilerplate", "Every file has license boilerplate or an SPDX-License-Identifier.", contributing "83"⟩,
      ⟨"license-spdx", "GPL-compatible SPDX", "No SPDX-License-Identifier is GPL-2.0-only.", melpazoidPy "647"⟩,
      ⟨"license-position", "License above Commentary", "License boilerplate comes before `;;; Commentary`.", contributing "86"⟩,
      ⟨"license-file", "License file", "The repository has a LICENSE or COPYING file.", contributing "87"⟩,
      ⟨"requires-main", "Package-Requires in main file", "The main file's Package-Requires includes every requirement declared in other files.", melpazoidPy "718"⟩,
      ⟨"requires-unquoted", "Unquoted requirements", "Package names in Package-Requires are not quoted.", melpazoidPy "293"⟩,
      ⟨"url-unquoted", "Unquoted URL", "The URL or Homepage header has no quotation marks.", melpazoidPy "471"⟩,
      ⟨"repo-clean", "Clean repository", "The repository has no .elc, backup (~) or .DS_Store files.", melpazoidPy "446"⟩,
      ⟨"sharp-quote", "Sharp-quoted functions", "Function names passed as arguments use #' instead of '.", contributing "153"⟩,
      ⟨"face-inherit", "Face inheritance", "No face both inherits another face and overrides its attributes.", contributing "148"⟩]

    def applies (p : PackageFacts) (id : String) : Bool :=
      if id == "license-file" || id == "repo-clean" then p.source == "github"
      else if id == "packaged-docs" then p.source == "melpa"
      else true

    def evaluate (p : PackageFacts) : List (String × Bool × Bool) := [
      ("main-file", applies p "main-file", mainFile p),
      ("packaging-header", applies p "packaging-header", packagingHeader p),
      ("file-prefix", applies p "file-prefix", fileNames p),
      ("packaged-docs", applies p "packaged-docs", !p.packagedDocs),
      ("lexical-binding", applies p "lexical-binding", lexicalBinding p),
      ("license-notice", applies p "license-notice", licenseNotice p),
      ("license-spdx", applies p "license-spdx", licenseSpdx p),
      ("license-position", applies p "license-position", licensePosition p),
      ("license-file", applies p "license-file", p.hasLicenseFile),
      ("requires-main", applies p "requires-main", requiresMain p),
      ("requires-unquoted", applies p "requires-unquoted", requiresUnquoted p),
      ("url-unquoted", applies p "url-unquoted", urlUnquoted p),
      ("repo-clean", applies p "repo-clean", p.repoClean),
      ("sharp-quote", applies p "sharp-quote", sharpQuote p),
      ("face-inherit", applies p "face-inherit", faceInherit p)]

    def advice (p : PackageFacts) : List String :=
      p.files.foldl (fun acc f => acc ++ f.advice.filter (fun id => !acc.contains id)) []
    "#
}
