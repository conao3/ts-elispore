pub mod archive;
pub mod emacs_regex;
pub mod melpazoid;
pub mod scanner;
pub mod sexp;
pub mod syntax;

pub const RULE_SET_VERSION: u32 = 7;

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
      packageRequires : List String
      urlQuoted : Bool
      missingSharpQuote : Bool
      faceInheritOverride : Bool
      author : Bool
      version : Bool
      codeSection : Bool
      footer : Bool
      provides : List String
      providesTheme : Bool
      requires : List String
      definitions : List String
      advice : List String

    structure PackageFacts where
      name : String
      source : String
      files : List FileFacts
      mainRequires : List String
      hasLicenseFile : Bool
      repoClean : Bool
      packagedDocs : Bool

    structure Source where
      label : String
      url : String
      quote : String

    structure Rule where
      id : String
      title : String
      description : String
      sources : List Source

    def manual (node title quote : String) : Source :=
      ⟨"Emacs Lisp Reference Manual (Emacs 31.1): " ++ title,
       "https://www.gnu.org/software/emacs/manual/html_node/elisp/" ++ node ++ ".html", quote⟩

    def contributing (lines quote : String) : Source :=
      ⟨"MELPA CONTRIBUTING.org",
       "https://github.com/melpa/melpa/blob/8d525bf492f8ae18a3855775eb2e3c65e957ad10/CONTRIBUTING.org?plain=1#" ++ lines, quote⟩

    def melpazoidPy (lines quote : String) : Source :=
      ⟨"melpazoid.py",
       "https://github.com/riscy/melpazoid/blob/fcf5d883c6ced74ba16963d48c9e9e0bf0a1ff37/melpazoid/melpazoid.py#" ++ lines, quote⟩

    def melpazoidEl (lines quote : String) : Source :=
      ⟨"melpazoid.el",
       "https://github.com/riscy/melpazoid/blob/fcf5d883c6ced74ba16963d48c9e9e0bf0a1ff37/melpazoid/melpazoid.el#" ++ lines, quote⟩

    def conventions : Source :=
      contributing "L114-L115" "The Emacs Lisp files should follow the Emacs Lisp conventions and the Emacs Lisp Style Guide."

    def headers : String := "Conventional Headers for Emacs Libraries"
    def coding : String := "Emacs Lisp Coding Conventions"

    def mainFile (p : PackageFacts) : Bool :=
      p.files.any (fun f => f.fileName == p.name ++ ".el")

    private def inMain (p : PackageFacts) (test : FileFacts → Bool) : Bool :=
      p.files.any (fun f => f.fileName == p.name ++ ".el" && test f)

    def summaryHeader (line : String) : Bool :=
      ((((line.splitOn "-*-").headD "").splitOn " --- ").length) > 1

    def packagingHeader (p : PackageFacts) : Bool := p.files.all (summaryHeader ·.firstLine)

    def withoutSuffix (name suffix : String) : String :=
      if name.endsWith suffix then String.ofList (name.toList.take (name.length - suffix.length)) else name

    def filePrefix (name : String) : String :=
      if name.endsWith "-mode" then withoutSuffix name "-mode" else withoutSuffix name "-themes"

    def prefixedFile (name fileName : String) : Bool :=
      (filePrefix name ++ "-").isPrefixOf fileName || (filePrefix name ++ ".").isPrefixOf fileName

    def prefixed (base symbol : String) : Bool :=
      symbol == base || (base ++ "-").isPrefixOf symbol

    def fileNames (p : PackageFacts) : Bool := p.files.all (prefixedFile p.name ·.fileName)
    def lexicalBinding (p : PackageFacts) : Bool := p.files.all (·.lexicalBinding)
    def licenseNotice (p : PackageFacts) : Bool := p.files.all (·.licenseNotice)
    def licenseSpdx (p : PackageFacts) : Bool := p.files.all (·.spdxId != "GPL-2.0-only")
    def licensePosition (p : PackageFacts) : Bool := p.files.all (·.licenseBeforeCommentary)

    def requiresMain (p : PackageFacts) : Bool :=
      mainFile p && p.files.all (fun f => f.packageRequires.all (p.mainRequires.contains ·))

    def unquotedName (requirement : String) : Bool :=
      !(((requirement.splitOn " ").headD "").contains '"')

    def requiresUnquoted (p : PackageFacts) : Bool := p.files.all (·.packageRequires.all unquotedName)
    def urlUnquoted (p : PackageFacts) : Bool := p.files.all (!·.urlQuoted)
    def sharpQuote (p : PackageFacts) : Bool := p.files.all (!·.missingSharpQuote)
    def faceInherit (p : PackageFacts) : Bool := p.files.all (!·.faceInheritOverride)
    def author (p : PackageFacts) : Bool := inMain p (·.author)
    def version (p : PackageFacts) : Bool := inMain p (·.version)
    def codeSection (p : PackageFacts) : Bool := p.files.all (·.codeSection)
    def provide (p : PackageFacts) : Bool := p.files.all fun f =>
      !f.provides.isEmpty || (f.fileName.endsWith "-theme.el" && f.providesTheme)
    def footer (p : PackageFacts) : Bool := p.files.all (·.footer)
    def noCl (p : PackageFacts) : Bool := p.files.all (!·.requires.contains "cl")

    def requirementNames (p : PackageFacts) : List String :=
      p.mainRequires.map fun r => (r.splitOn " ").headD ""

    def hyphenParents (name : String) : List String :=
      let parts := name.splitOn "-"
      (List.range (parts.length - 1)).map fun i => "-".intercalate (parts.take (i + 1))

    def namePrefixes (p : PackageFacts) : List String :=
      [p.name, filePrefix p.name]
        ++ (if "ox-".isPrefixOf p.name then ["org-" ++ String.ofList (p.name.toList.drop 3)] else [])
        ++ (hyphenParents p.name).filter (requirementNames p).contains

    def unwrapped (symbol : String) : String :=
      if "with-".isPrefixOf symbol then String.ofList (symbol.toList.drop 5)
      else if "define-".isPrefixOf symbol then String.ofList (symbol.toList.drop 7)
      else symbol

    def symbolPrefix (p : PackageFacts) : Bool := p.files.all fun f =>
      f.definitions.all fun s =>
        (f.stem :: namePrefixes p).any fun b => prefixed b s || prefixed b (unwrapped s)

    theorem requiresMain_mainFile (p : PackageFacts) (h : requiresMain p = true) :
        mainFile p = true := by
      simp [requiresMain] at h
      exact h.1

    def rules : List Rule := [
      ⟨"main-file", "Main file", "A file named <package>.el exists.", [
        manual "Simple-Packages" "Simple Packages" "The name of the package is the same as the base name of the file, as written on the first line.",
        melpazoidPy "L492" "_fail(f\"- MELPA requires a file called {package_name(recipe)}.el\")"]⟩,
      ⟨"packaging-header", "Packaging header", "Every file starts with a `;;; <file>.el --- <description>` line.", [
        manual "Library-Headers" headers "The very first line should have this format: ;;; filename --- description -*- lexical-binding: t; -*-",
        melpazoidPy "L530" "_fail(f\"- {relpath} -- no packaging header\")"]⟩,
      ⟨"file-prefix", "File names", "Every file name starts with the package name (without -mode or -themes) followed by - or a dot.", [
        melpazoidPy "L522" "_fail(f\"- {relpath!s:<40} wrong prefix.  Use: `{prefix}-<module>.el`\")"]⟩,
      ⟨"packaged-docs", "No packaged docs", "The MELPA package does not ship change logs, READMEs or license files.", [
        contributing "L127-L129" "Avoid change logs and readmes :: Files like these would only end up in an obscure installation directory where a user would never know to look when searching for information.",
        melpazoidPy "L496" "_fail(f\"- {relpath} -- avoid packaging change logs, READMEs, and licenses\")"]⟩,
      ⟨"lexical-binding", "Lexical binding", "Every file enables lexical binding on its first line.", [
        contributing "L147" "Please enable lexical binding",
        manual "Coding-Conventions" coding "We recommend enabling lexical-binding in new code, and converting existing Emacs Lisp code to enable lexical-binding if it doesn’t already.",
        manual "Library-Headers" headers "The very first line should have this format: ;;; filename --- description -*- lexical-binding: t; -*-"]⟩,
      ⟨"license-notice", "License boilerplate", "Every file has license boilerplate or an SPDX-License-Identifier.", [
        contributing "L85-L87" "The license boilerplate should be applied above the ;;; Commentary of each source file.",
        manual "Coding-Conventions" coding "Please put a copyright notice and copying permission notice on the file if you distribute copies.",
        melpazoidPy "L559-L560" "f\"Error: {relpath} needs *formal* license boilerplate and/or an\""]⟩,
      ⟨"license-spdx", "GPL-compatible SPDX", "No SPDX-License-Identifier is GPL-2.0-only.", [
        contributing "L83-L85" "The package is released under a GPL-Compatible Free Software License, preferably the GNU General Public License (GPL) version 3.",
        melpazoidPy "L647" "_fail(f\"- {license_id} is incompatible with MELPA, use GPL-2.0-or-later\")"]⟩,
      ⟨"license-position", "License above Commentary", "License boilerplate comes before `;;; Commentary`.", [
        contributing "L85-L87" "The license boilerplate should be applied above the ;;; Commentary of each source file.",
        manual "Library-Headers" headers "This begins introductory comments that explain how the library works. It should come right after the copying permissions"]⟩,
      ⟨"license-file", "License file", "The repository has a LICENSE or COPYING file.", [
        contributing "L87-L88" "The repository should contain a LICENSE or COPYING file, formatted so that it can be detected by common tooling.",
        melpazoidPy "L627" "return 'Error: Add a GPL-compatible LICENSE file to the repository'"]⟩,
      ⟨"requires-main", "Package-Requires in main file", "The main file's Package-Requires includes every requirement declared in other files.", [
        melpazoidPy "L718-L722" "f\"- {main_file.name} must include all of the \""]⟩,
      ⟨"requires-unquoted", "Unquoted requirements", "Package names in Package-Requires are not quoted.", [
        manual "Library-Headers" headers "The car of each sub-list is the name of a package, as a symbol.",
        melpazoidPy "L293" "_fail(f\"- Package names should not be quoted: `{req}`\")"]⟩,
      ⟨"url-unquoted", "Unquoted URL", "The URL or Homepage header has no quotation marks.", [
        melpazoidPy "L471" "_fail(f\"- Remove quotation marks around URL {url!r}\")"]⟩,
      ⟨"repo-clean", "Clean repository", "The repository has no .elc, backup (~) or .DS_Store files.", [
        melpazoidPy "L446-L450" "_fail(f\"- FYI: repository shouldn't contain .elc file {repo_file.name!r}\")"]⟩,
      ⟨"sharp-quote", "Sharp-quoted functions", "Function names passed as arguments use #' instead of '.", [
        contributing "L153-L156" "Prefix function names with #' (i.e., the special form function) instead of just ' (i.e., the special form quote) to tell the compiler this is a function reference.",
        melpazoidEl "L284-L315" "(let ((msg \"It's safer to sharp-quote the names of existing functions; use `#'`\"))"]⟩,
      ⟨"face-inherit", "Face inheritance", "No face both inherits another face and overrides its attributes.", [
        contributing "L148-L150" "Please avoid defining a face that both :inherit another face and also override their attributes (e.g. by making them bold, underlined or inverse-video)."]⟩,
      ⟨"author", "Author header", "The main file has an Author header.", [
        manual "Library-Headers" headers "Just about every Lisp library ought to have the ‘Author’ and ‘Keywords’ header comment lines.",
        conventions]⟩,
      ⟨"version", "Version header", "The main file has a Version or Package-Version header (GitHub repositories only; archives add Package-Version).", [
        manual "Simple-Packages" "Simple Packages" "The version number comes from the ‘Package-Version’ header, if it exists, or from the ‘Version’ header otherwise. One or the other must be present.",
        conventions]⟩,
      ⟨"code-section", "Code section", "Every file has a `;;; Code:` line.", [
        manual "Library-Headers" headers "This begins the actual code of the program.",
        conventions]⟩,
      ⟨"provide", "Provide", "Every file calls provide; a `-theme.el` file may call provide-theme instead.", [
        manual "Coding-Conventions" coding "Put a call to provide at the end of each separate Lisp file.",
        manual "Custom-Themes" "Custom Themes" "A Custom theme file should be named foo-theme.el, where foo is the theme name. The first Lisp form in the file should be a call to deftheme, and the last form should be a call to provide-theme.",
        conventions]⟩,
      ⟨"footer", "Footer", "Every file has a `;;; <file>.el ends here` line.", [
        manual "Library-Headers" headers "This is the footer line; it appears at the very end of the file.",
        conventions]⟩,
      ⟨"symbol-prefix", "Symbol prefix", "Top-level definitions start with a prefix of the package: its name or file name, its name without -mode or -themes, org- for an ox- package, or a parent package it requires; a with- or define- before the prefix is allowed.", [
        manual "Coding-Conventions" coding "The names of all global symbols in your program, that is the names of variables, constants, and functions, should begin with that chosen prefix. Separate the prefix from the rest of the name with a hyphen, ‘-’.",
        manual "Coding-Conventions" coding "If one prefix is insufficient, your package can use two or three alternative common prefixes, so long as they make sense.",
        manual "Coding-Conventions" coding "constructs that define functions, variables, etc., may work better if they start with ‘define-’, so it’s okay to put the name prefix later on in the name.",
        melpazoidPy "L763-L765" "variations += ['org-' + name[3:]] if name.startswith('ox-') else []",
        melpazoidPy "L822" "_warn(f\"  - `{name}` does not depend on `{pkg_short}` - consider renaming\")",
        conventions]⟩,
      ⟨"no-cl", "No legacy cl", "No file requires the obsolete cl library.", [
        manual "Coding-Conventions" coding "If you need Common Lisp extensions, use the cl-lib library rather than the old cl library.",
        conventions]⟩]

    def applies (p : PackageFacts) (id : String) : Bool :=
      if id == "license-file" || id == "repo-clean" || id == "version" then p.source == "github"
      else if id == "packaged-docs" then p.source == "melpa"
      else true

    def check (id : String) (p : PackageFacts) : Bool :=
      if id == "main-file" then mainFile p
      else if id == "packaging-header" then packagingHeader p
      else if id == "file-prefix" then fileNames p
      else if id == "packaged-docs" then !p.packagedDocs
      else if id == "lexical-binding" then lexicalBinding p
      else if id == "license-notice" then licenseNotice p
      else if id == "license-spdx" then licenseSpdx p
      else if id == "license-position" then licensePosition p
      else if id == "license-file" then p.hasLicenseFile
      else if id == "requires-main" then requiresMain p
      else if id == "requires-unquoted" then requiresUnquoted p
      else if id == "url-unquoted" then urlUnquoted p
      else if id == "repo-clean" then p.repoClean
      else if id == "sharp-quote" then sharpQuote p
      else if id == "face-inherit" then faceInherit p
      else if id == "author" then author p
      else if id == "version" then version p
      else if id == "code-section" then codeSection p
      else if id == "provide" then provide p
      else if id == "footer" then footer p
      else if id == "symbol-prefix" then symbolPrefix p
      else if id == "no-cl" then noCl p
      else false

    def ruleIds : List String := [
      "main-file",
      "packaging-header",
      "file-prefix",
      "packaged-docs",
      "lexical-binding",
      "license-notice",
      "license-spdx",
      "license-position",
      "license-file",
      "requires-main",
      "requires-unquoted",
      "url-unquoted",
      "repo-clean",
      "sharp-quote",
      "face-inherit",
      "author",
      "version",
      "code-section",
      "provide",
      "footer",
      "symbol-prefix",
      "no-cl"]

    theorem rules_ids : rules.map Rule.id = ruleIds := by
      simp [rules, ruleIds]

    def evaluate (p : PackageFacts) : List (String × Bool × Bool) :=
      ruleIds.map fun id => (id, applies p id, check id p)

    theorem evaluate_ids (p : PackageFacts) : (evaluate p).map Prod.fst = ruleIds := by
      simp [evaluate, Function.comp_def]

    theorem evaluate_applies (p : PackageFacts) :
        (evaluate p).all (fun e => e.2.1 == applies p e.1) = true := by
      simp [evaluate]

    theorem evaluate_check (p : PackageFacts) :
        (evaluate p).all (fun e => e.2.2 == check e.1 p) = true := by
      simp [evaluate]

    def skippedFor (source : String) : List String :=
      if source == "github" then ["packaged-docs"]
      else if source == "melpa" then ["license-file", "repo-clean", "version"]
      else ["packaged-docs", "license-file", "repo-clean", "version"]

    theorem evaluate_skipped (p : PackageFacts) :
        ((evaluate p).filter (fun e => !e.2.1)).map Prod.fst = skippedFor p.source := by
      unfold evaluate ruleIds applies skippedFor
      by_cases g : p.source = "github" <;> by_cases m : p.source = "melpa" <;> simp_all

    theorem checks_table (p : PackageFacts) :
        ruleIds.map (fun id => check id p) = [
          mainFile p,
          packagingHeader p,
          fileNames p,
          !p.packagedDocs,
          lexicalBinding p,
          licenseNotice p,
          licenseSpdx p,
          licensePosition p,
          p.hasLicenseFile,
          requiresMain p,
          requiresUnquoted p,
          urlUnquoted p,
          p.repoClean,
          sharpQuote p,
          faceInherit p,
          author p,
          version p,
          codeSection p,
          provide p,
          footer p,
          symbolPrefix p,
          noCl p] := by
      simp [ruleIds, check]

    def unique : List String → List String
      | [] => []
      | x :: xs => if (unique xs).contains x then unique xs else x :: unique xs

    theorem mem_unique (x : String) (l : List String) : x ∈ unique l ↔ x ∈ l := by
      induction l with
      | nil => simp [unique]
      | cons y ys ih =>
        simp only [unique]
        split <;> rename_i h
        · simp only [List.contains_iff_mem] at h
          simp only [ih, List.mem_cons]
          constructor
          · intro hx; exact Or.inr hx
          · rintro (rfl | hx)
            · exact ih.mp h
            · exact hx
        · simp [ih]

    theorem nodup_unique (l : List String) : (unique l).Nodup := by
      induction l with
      | nil => simp [unique]
      | cons y ys ih =>
        simp only [unique]
        split <;> rename_i h
        · exact ih
        · simp only [List.contains_iff_mem] at h
          exact List.nodup_cons.mpr ⟨h, ih⟩

    def advice (p : PackageFacts) : List String := unique (p.files.flatMap (·.advice))

    theorem advice_mem (p : PackageFacts) (x : String) :
        x ∈ advice p ↔ ∃ f ∈ p.files, x ∈ f.advice := by
      simp [advice, mem_unique, List.mem_flatMap]

    theorem advice_nodup (p : PackageFacts) : (advice p).Nodup := nodup_unique _
    "#
}
