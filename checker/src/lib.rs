pub mod archive;
pub mod scanner;
pub mod sexp;

pub const RULE_SET_VERSION: u32 = 3;

leanfran::lean! {
    pub mod policy;
    r#"
    structure FileFacts where
      fileName : String
      stem : String
      firstLine : String
      lexicalBinding : Bool
      author : String
      maintainer : String
      url : String
      version : String
      packageRequires : String
      keywords : String
      commentary : Bool
      codeSection : Bool
      footer : Bool
      licenseNotice : Bool
      provides : List String
      requires : List String
      definitions : List String

    structure PackageFacts where
      name : String
      files : List FileFacts
      hasLicenseFile : Bool

    structure Rule where
      id : String
      title : String
      description : String

    def mainFile (p : PackageFacts) : Bool :=
      p.files.any (fun f => f.fileName == p.name ++ ".el")

    private def inMain (p : PackageFacts) (test : FileFacts → Bool) : Bool :=
      p.files.any (fun f => f.fileName == p.name ++ ".el" && test f)

    def summaryLine (p : PackageFacts) : Bool := inMain p fun f =>
      let start := ";;; " ++ p.name ++ ".el --- "
      start.isPrefixOf f.firstLine &&
        !((f.firstLine.drop start.length).toString.trimAscii.toString).isEmpty

    def lexicalBinding (p : PackageFacts) : Bool := p.files.all (·.lexicalBinding)
    def author (p : PackageFacts) : Bool := inMain p (!·.author.isEmpty)
    def url (p : PackageFacts) : Bool := inMain p (!·.url.isEmpty)
    def version (p : PackageFacts) : Bool := inMain p (!·.version.isEmpty)
    def packageRequires (p : PackageFacts) : Bool := inMain p (!·.packageRequires.isEmpty)
    def commentary (p : PackageFacts) : Bool := inMain p (·.commentary)
    def codeSection (p : PackageFacts) : Bool := p.files.all (·.codeSection)
    def provide (p : PackageFacts) : Bool := p.files.all fun f => f.provides.contains f.stem
    def footer (p : PackageFacts) : Bool := p.files.all (·.footer)
    def license (p : PackageFacts) : Bool := p.hasLicenseFile || p.files.any (·.licenseNotice)

    def prefixed (base symbol : String) : Bool :=
      symbol == base || (base ++ "-").isPrefixOf symbol || (base ++ "/").isPrefixOf symbol

    theorem prefixed_self (name : String) : prefixed name name = true := by
      simp [prefixed]

    def symbolPrefix (p : PackageFacts) : Bool := p.files.all fun f =>
      f.definitions.all (fun s => prefixed p.name s || prefixed f.stem s)

    def noCl (p : PackageFacts) : Bool := p.files.all fun f => !f.requires.contains "cl"

    def rules : List Rule := [
      ⟨"main-file", "Main file", "A file named <package>.el exists."⟩,
      ⟨"summary-line", "Summary line", "The main file begins with a named summary line."⟩,
      ⟨"lexical-binding", "Lexical binding", "Every checked file enables lexical binding on its first line."⟩,
      ⟨"author", "Author", "The main file declares an Author header."⟩,
      ⟨"url", "URL", "The main file declares a URL or Homepage header."⟩,
      ⟨"version", "Version", "The main file declares a Version or Package-Version header."⟩,
      ⟨"package-requires", "Package requirements", "The main file declares Package-Requires, including an empty list if appropriate."⟩,
      ⟨"commentary", "Commentary", "The main file has a Commentary section."⟩,
      ⟨"code-section", "Code section", "Every checked file has a Code section."⟩,
      ⟨"provide", "Feature", "Every checked file provides its own file-stem feature."⟩,
      ⟨"footer", "Footer", "Every checked file has its named ends-here footer."⟩,
      ⟨"license", "License", "A file contains a license notice or the package has a LICENSE/COPYING file."⟩,
      ⟨"symbol-prefix", "Symbol prefix", "Top-level definitions use the package or file-stem namespace."⟩,
      ⟨"no-cl", "No legacy cl", "No checked file requires the obsolete cl feature."⟩]

    def evaluate (p : PackageFacts) : List (String × Bool) := [
      ("main-file", mainFile p), ("summary-line", summaryLine p),
      ("lexical-binding", lexicalBinding p), ("author", author p), ("url", url p),
      ("version", version p), ("package-requires", packageRequires p),
      ("commentary", commentary p), ("code-section", codeSection p),
      ("provide", provide p), ("footer", footer p), ("license", license p),
      ("symbol-prefix", symbolPrefix p), ("no-cl", noCl p)]
    "#
}
