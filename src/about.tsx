import { Link } from "react-aria-components"

const repository = "https://github.com/conao3/ts-elispore"

export function About() {
  return (
    <main className="about-page">
      <Link href="/" className="back-link">
        ← Search packages
      </Link>
      <h1>Add recipe</h1>
      <section aria-labelledby="how-to-add">
        <h2 id="how-to-add">How to add a package</h2>
        <p>
          No MELPA recipe is required for GitHub discovery. Elispore currently has no recipe
          submission form.
        </p>
        <ol>
          <li>
            Publish your package in a public, non-fork GitHub repository, with an <code>.el</code>{" "}
            file at the root or directly in <code>lisp/</code>.
          </li>
          <li>
            Add the <code>emacs-package</code> topic in your repository’s About settings. See{" "}
            <Link href="https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics">
              GitHub’s topic instructions
            </Link>
            .
          </li>
          <li>
            Check Elispore after the next daily catalog refresh. Discovery is bounded: the{" "}
            <code>emacs-package</code> search takes up to 200 repositories sorted by stars, so a
            topic does not guarantee inclusion.
          </li>
        </ol>
        <p>
          The updater also searches starred and recently updated Emacs Lisp repositories and related
          topics. It excludes configuration distributions, mirrors, style guides, awesome lists and
          editor source repositories.
        </p>
        <p>
          If discovery misses your package,{" "}
          <Link href={`${repository}/edit/master/scripts/catalog.ts`}>
            open a pull request adding your <code>owner/repo</code> to the seed list in{" "}
            <code>scripts/catalog.ts</code>
          </Link>
          . Seeds go through the same eligibility and file checks. Include the upstream URL and the
          location of its Emacs Lisp files; run the{" "}
          <Link href={`${repository}#development`}>development checks</Link> before submitting.
        </p>
        <h2>Existing MELPA recipes</h2>
        <p>
          The build also merges checked-in JSON snapshots from{" "}
          <Link href={`${repository}/tree/master/examples/melpa`}>examples/melpa/</Link>,
          deduplicated by GitHub repository ID. These are not refreshed daily. To update this part,
          convert GitHub-backed MELPA recipes with <code>scripts/melpa.ts</code>, review the
          generated <code>&lt;recipe-name&gt;.json</code> files, and submit a pull request with the
          staged entries. Follow the{" "}
          <Link href={`${repository}#converting-melpa-recipes`}>
            conversion commands and pinned MELPA revision
          </Link>
          . The build’s <code>scripts/catalog-import.ts</code> validates and merges them; non-GitHub
          sources are not supported.
        </p>
      </section>
      <section aria-labelledby="why-elispore">
        <h2 id="why-elispore">Why Elispore</h2>
        <p>
          MELPA reviews every new recipe by hand, and its rules slow down new packages: the package
          must have been maintained in a public repository for at least one month (
          <Link href="https://github.com/melpa/melpa/blob/master/.github/PULL_REQUEST_TEMPLATE.md">
            MELPA pull request template
          </Link>
          ), and AI-assisted packages need an <code>Assisted-by:</code> line, with the human author
          as the first and most thorough reviewer (
          <Link href="https://github.com/melpa/melpa/blob/master/CONTRIBUTING.org#using-ai">
            MELPA’s AI guidelines
          </Link>
          ). Now that AI speeds up development, reviewing every package by hand cannot keep up;
          packages should be registered through mechanical checks instead.
        </p>
        <p>
          Emacs Lisp has one global namespace, and MELPA’s central list was useful as a catalog of
          package names. Elispore builds that catalog so you can search which names are already
          taken.
        </p>
        <p>
          Elispore does not build packages. Its primary install path downloads the source directly
          from GitHub with package.el (<code>package-vc</code>, via leaf or use-package{" "}
          <code>:vc</code>) and compiles it locally.
        </p>
      </section>
    </main>
  )
}
