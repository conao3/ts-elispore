import { useEffect } from "react"
import { Link } from "react-aria-components"
import type { Checks } from "./checks"
import { InlineCode } from "./inline-code"

const repository = "https://github.com/conao3/ts-elispore"

export function About({ checks }: { checks: Checks | null }) {
  useEffect(() => {
    if (checks && window.location.hash)
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [checks])
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
        <h2>Package archives</h2>
        <p>
          Elispore refreshes <Link href="https://melpa.org/">MELPA</Link>,{" "}
          <Link href="https://elpa.gnu.org/packages/">GNU ELPA</Link>, and{" "}
          <Link href="https://elpa.nongnu.org/nongnu/">NonGNU ELPA</Link> daily. Packages can be
          listed in more than one archive, regardless of where they are hosted.
        </p>
      </section>
      <section aria-labelledby="package-checks-about" className="about-checks">
        <h2 id="package-checks-about">Package checks</h2>
        <p>
          Checks scan package source without running it. The rules come from MELPA&rsquo;s{" "}
          <Link href="https://github.com/melpa/melpa/blob/master/CONTRIBUTING.org">
            CONTRIBUTING.org
          </Link>
          , the{" "}
          <Link href="https://www.gnu.org/software/emacs/manual/html_node/elisp/Tips.html">
            Emacs Lisp conventions
          </Link>{" "}
          that it asks packages to follow, and{" "}
          <Link href="https://github.com/riscy/melpazoid">melpazoid</Link>, scripts for testing
          Emacs packages, primarily submissions to MELPA. Each rule quotes its sources. Checks that
          need Emacs itself (byte-compilation, checkdoc, package-lint, loading) are not run. Results
          are cached and refreshed only on explicit re-run, not with the daily catalog update.
        </p>
        {checks && (
          <>
            <h3 id="required-checks">Required checks</h3>
            <p>These make up a package&rsquo;s score.</p>
            {checks.rules
              .filter((rule) => rule.level === "required")
              .map((rule) => (
                <article key={rule.id} id={`rule-${rule.id}`} className="about-rule">
                  <h4>{rule.title}</h4>
                  <p>
                    <InlineCode text={rule.description} />
                  </p>
                  <ul className="rule-sources">
                    {rule.sources.map((source, index) => (
                      <li key={index}>
                        <Link href={source.url}>{source.label}</Link>
                        {source.label.startsWith("melpazoid") ? (
                          <pre>
                            <code>{source.quote}</code>
                          </pre>
                        ) : (
                          <blockquote>{source.quote}</blockquote>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            <h3 id="melpazoid-advice">melpazoid advice</h3>
            <p>
              Findings from melpazoid&rsquo;s style checks. They are listed with a package&rsquo;s
              results but do not count toward its score.
            </p>
            <table className="advice-table">
              <thead>
                <tr>
                  <th scope="col">Message</th>
                  <th scope="col">melpazoid.el</th>
                </tr>
              </thead>
              <tbody>
                {checks.rules
                  .filter((rule) => rule.level === "advice")
                  .map((rule) => (
                    <tr key={rule.id} id={`rule-${rule.id}`}>
                      <td>
                        <InlineCode text={rule.title} />
                      </td>
                      <td>
                        {rule.sources.map((source, index) => (
                          <span key={index}>
                            {index > 0 && ", "}
                            <Link href={source.url} aria-label={`melpazoid.el: ${source.quote}`}>
                              {source.url.slice(source.url.lastIndexOf("#") + 1)}
                            </Link>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
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
          Elispore does not build packages. Install from a Git repository with package.el (
          <code>package-vc</code>, via leaf or use-package <code>:vc</code>), or use{" "}
          <code>:ensure t</code> for packages in GNU ELPA or NonGNU ELPA.
        </p>
      </section>
    </main>
  )
}
