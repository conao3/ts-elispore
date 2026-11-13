import { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { Search, ArrowUpRight, Star, Command, Package, RefreshCw } from "lucide-react"
import { catalogSchema, search } from "./catalog"
import type { Entry } from "./catalog"
import "./style.css"
function App() {
  const [entries, setEntries] = useState<Entry[]>([]),
    [date, setDate] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(new URLSearchParams(location.search).get("q") ?? ""),
    [sort, setSort] = useState("stars"),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch(
      import.meta.env.PROD
        ? "https://raw.githubusercontent.com/conao3/ts-elispore/master/public/catalog.json"
        : `${import.meta.env.BASE_URL}catalog.json`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw Error("The catalog could not be loaded.")
        return r.json()
      })
      .then((json: unknown) => {
        const data = catalogSchema.parse(json)
        setEntries(data.entries)
        setDate(data.generatedAt)
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load the catalog.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])
  useEffect(() => {
    const url = new URL(location.href)
    if (query) url.searchParams.set("q", query)
    else url.searchParams.delete("q")
    history.replaceState(null, "", url)
  }, [query])
  const results = useMemo(
    () => search(entries, query, sort, archived),
    [entries, query, sort, archived],
  )
  const visible = results.slice(0, page * 30)
  return (
    <>
      <header>
        <a className="brand" href={import.meta.env.BASE_URL}>
          <Command size={23} /> elispore<span> / </span>
        </a>
        <a className="header-link" href="https://github.com/conao3/ts-elispore">
          Source on GitHub <ArrowUpRight size={15} />
        </a>
      </header>
      <main>
        <div className="eyebrow">
          <span className="dot" /> THE EMACS PACKAGE EXPLORER
        </div>
        <h1>
          A little Lisp.
          <br />
          <span>A lot to discover.</span>
        </h1>
        <p className="intro">
          Find your next Emacs package. Search the catalog.
          <br className="desktop" /> Go straight to the source.
        </p>
        <div className="search-box">
          <Search size={23} />
          <label className="sr-only" htmlFor="query">
            Search packages
          </label>
          <input
            id="query"
            autoFocus
            placeholder="Try “lean”, “completion”, or “git”…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
          <kbd>/</kbd>
        </div>
        <div className="suggestions">
          <span>Start exploring</span>
          {["lean", "completion", "git", "org", "theme"].map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuery(q)
                setPage(1)
              }}
            >
              {q} ↗
            </button>
          ))}
        </div>
        <section aria-label="Package results">
          <div className="toolbar">
            <h2 aria-live="polite">
              {loading ? "Loading catalog…" : `${results.length.toLocaleString()} repositories`}
              <span>{query ? ` matching “${query}”` : " to explore"}</span>
            </h2>
            <div className="filters">
              <label className="archive">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => {
                    setArchived(e.target.checked)
                    setPage(1)
                  }}
                />{" "}
                Archived
              </label>
              <label className="sr-only" htmlFor="sort">
                Sort packages
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value)
                  setPage(1)
                }}
              >
                <option value="stars">Most starred</option>
                <option value="updated">Recently updated</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>
          {error ? (
            <div className="empty" role="alert">
              <h3>Something interrupted the search.</h3>
              <p>{error}</p>
              <button onClick={() => setReload(reload + 1)}>Try again</button>
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="empty">
              <Package />
              <h3>No matches in this catalog.</h3>
              <p>Try fewer words, or explore more repositories directly on GitHub.</p>
              <a
                href={`https://github.com/search?type=repositories&q=${encodeURIComponent(`${query} language:"Emacs Lisp"`)}`}
              >
                Search GitHub ↗
              </a>
            </div>
          ) : (
            <div className="grid">
              {visible.map((e) => (
                <article key={e.id}>
                  <div className="card-top">
                    <Package size={18} />
                    <span>
                      <Star size={13} />
                      {e.stars.toLocaleString()}
                    </span>
                  </div>
                  <a className="repo" href={e.url}>
                    <small>{e.name.split("/")[0]} /</small>
                    <h3>
                      {e.name.split("/").slice(1).join("/")} <ArrowUpRight size={18} />
                    </h3>
                  </a>
                  <p>
                    {e.description ||
                      "Explore the repository for documentation and installation instructions."}
                  </p>
                  <div className="tags">
                    {e.topics
                      .filter((t) => !["emacs", "emacs-lisp", "elisp"].includes(t))
                      .slice(0, 3)
                      .map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setQuery(t)
                            setPage(1)
                          }}
                        >
                          {t}
                        </button>
                      ))}
                  </div>
                  <div className="card-bottom">
                    <span>
                      {e.archived
                        ? "Archived"
                        : `Updated ${new Date(e.updated).toLocaleDateString("en", { month: "short", year: "numeric" })}`}
                    </span>
                    <span>
                      {e.license && e.license !== "NOASSERTION"
                        ? e.license
                        : "License: see repository"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!error && results.length > visible.length && (
            <button className="more" onClick={() => setPage(page + 1)}>
              Show more packages ↓
            </button>
          )}
        </section>
        <footer>
          <span>
            <RefreshCw size={13} />{" "}
            {date
              ? `Catalog refreshed ${new Date(date).toLocaleDateString("en")}`
              : "Fetching catalog"}
          </span>
          <p>
            A selection of GitHub packages and libraries. Discovery is based on language and topics;
            configuration repositories are filtered. Check each repository for installation and
            compatibility.
          </p>
          <a href="https://github.com/conao3/ts-elispore#catalog">How the catalog works ↗</a>
        </footer>
      </main>
    </>
  )
}
const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement) &&
    !(event.target instanceof HTMLSelectElement)
  ) {
    event.preventDefault()
    document.getElementById("query")?.focus()
  }
})
