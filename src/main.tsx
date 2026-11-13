import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Search } from "lucide-react"
import { catalogSchema } from "./catalog"
import type { Entry } from "./catalog"
import { parseQuery, searchEntries, setQualifier } from "./query"
import { leafSnippet } from "./snippet"
import "./style.css"

const categories = [
  { label: "All packages", topic: "" },
  { label: "Completion", topic: "completion" },
  { label: "Editing", topic: "editing" },
  { label: "Languages", topic: "programming-languages" },
  { label: "Org mode", topic: "org-mode" },
  { label: "Themes", topic: "theme" },
  { label: "Tools", topic: "tools" },
]
const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
function PackageRow({
  entry,
  opened,
  onOpen,
  onOwner,
}: {
  entry: Entry
  opened: boolean
  onOpen: (open: boolean) => void
  onOwner: (owner: string) => void
}) {
  const [owner, name] = entry.name.split("/")
  const code = leafSnippet(entry)
  const pre = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      const range = document.createRange()
      if (pre.current) {
        range.selectNodeContents(pre.current)
        const selection = getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }
  return (
    <details
      className="package"
      data-name={entry.name}
      open={opened}
      onToggle={(event) => onOpen(event.currentTarget.open)}
    >
      <summary>
        <a
          className="tile avatar-link"
          href={`https://github.com/${owner}`}
          target="_blank"
          rel="noopener"
          aria-label={`${owner} on GitHub`}
          onClick={(event) => event.stopPropagation()}
        >
          <img
            src={`https://github.com/${owner}.png?size=80`}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
        <span className="identity">
          <strong className="repo-name">
            <button
              type="button"
              className="repo-owner"
              data-owner={owner}
              title={`Add user:${owner} to the search query`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!getSelection()?.toString()) onOwner(owner)
              }}
            >
              {owner}
            </button>
            <span className="repo-slash">/</span>
            <span>{name}</span>
          </strong>
          <span>{entry.description || "Explore the repository for documentation and setup."}</span>
        </span>
        <span className="stars">☆ {entry.stars.toLocaleString("en")}</span>
        <time dateTime={entry.updated} title={entry.updated}>
          {new Date(entry.updated).toLocaleDateString("en", {
            month: "short",
            day: "2-digit",
            timeZone: "UTC",
          })}
        </time>
        <span className="chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <section className="expanded" aria-label={`${entry.name} details`}>
        <div className="explanation">
          <span className="eyebrow">
            {entry.topics.slice(0, 2).join(" / ") || "GITHUB REPOSITORY"}
          </span>
          <h3>{name}</h3>
          <p>
            {entry.description ||
              "See the upstream README for features, requirements, and configuration."}
          </p>
          <div className="badges">
            {entry.language && <span>{entry.language}</span>}
            <span>
              {entry.license && entry.license !== "NOASSERTION"
                ? entry.license
                : "License: see repository"}
            </span>
            <span>{entry.archived ? "Archived" : "Active repository"}</span>
          </div>
          <div className="links">
            <a className="primary" href={entry.url} target="_blank" rel="noopener">
              Open GitHub repository ↗
            </a>
            <a href={`${entry.url}#readme`} target="_blank" rel="noopener">
              Read documentation ↗
            </a>
          </div>
        </div>
        <div className="installation">
          <div className="code-heading">
            <span>Install from GitHub</span>
            <button className="copy" type="button" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre ref={pre} tabIndex={0}>
            <code>{code}</code>
          </pre>
          <p className="code-note">
            Requires leaf with :vc support and Emacs 29+ · See the upstream README for
            configuration.
          </p>
        </div>
      </section>
    </details>
  )
}
function App() {
  const [entries, setEntries] = useState<Entry[]>([]),
    [date, setDate] = useState(""),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [reload, setReload] = useState(0)
  const [query, setQuery] = useState(
    () => new URLSearchParams(location.search).get("q") ?? "archived:false",
  )
  const [sort, setSort] = useState("stars"),
    [limit, setLimit] = useState(30),
    [mobileFilters, setMobileFilters] = useState(false),
    [openIds, setOpenIds] = useState(new Set<number>())
  const input = useRef<HTMLInputElement>(null),
    active = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError("")
    fetch("/catalog.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the package catalog.")
        return response.json()
      })
      .then((value: unknown) => {
        const catalog = catalogSchema.parse(value)
        setEntries(catalog.entries)
        setDate(catalog.generatedAt)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : "Could not load the catalog.")
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
    setLimit(30)
  }, [query])
  useEffect(() => {
    const pop = () => setQuery(new URLSearchParams(location.search).get("q") ?? "archived:false")
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    addEventListener("popstate", pop)
    addEventListener("keydown", key)
    return () => {
      removeEventListener("popstate", pop)
      removeEventListener("keydown", key)
    }
  }, [])
  const state = useMemo(() => {
    try {
      return { filters: parseQuery(query), results: searchEntries(entries, query, sort), error: "" }
    } catch (error) {
      return {
        filters: [],
        results: [],
        error: error instanceof Error ? error.message : "Invalid query",
      }
    }
  }, [entries, query, sort])
  const values = (key: string) =>
    state.filters
      .filter((filter) => filter.key === key && !filter.exclude)
      .map((filter) => filter.value)
  const topics = values("topic"),
    licenses = values("license"),
    pushed = values("pushed")
  useEffect(() => {
    if (active.current)
      active.current.indeterminate = pushed.length > 0 && !pushed.includes(`>=${yearAgo}`)
  }, [pushed])
  function qualify(key: string, value: string, append = false) {
    try {
      setQuery(setQualifier(query, key, value, append))
    } catch {
      input.current?.focus()
    }
  }
  const licenseOptions = useMemo(
    () =>
      [
        ...new Set(
          entries
            .map((entry) => entry.license)
            .filter((value): value is string => Boolean(value) && value !== "NOASSERTION"),
        ),
      ]
        .sort(
          (a, b) =>
            entries.filter((e) => e.license === b).length -
            entries.filter((e) => e.license === a).length,
        )
        .slice(0, 5),
    [entries],
  )
  const title =
    categories.find((category) => category.topic === topics[0])?.label ??
    (topics.join(", ") || "All packages")
  return (
    <>
      <header>
        <a className="brand" href="/" aria-label="Elispore home">
          <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 1v22M1 12h22M4 4l16 16M4 20L20 4" stroke="#CC785C" strokeWidth="2.2" />
          </svg>
          elispore
        </a>
        <a
          className="github"
          href="https://github.com/conao3/ts-elispore"
          target="_blank"
          rel="noopener"
        >
          Source on GitHub ↗
        </a>
      </header>
      <div className={`layout${mobileFilters ? " show-filters" : ""}`}>
        <aside aria-label="Package filters">
          <div className="sidebar-content">
            <div className="eyebrow sidebar-caption">REFINE RESULTS</div>
            <fieldset className="group">
              <legend>Category</legend>
              {categories.map((category) => (
                <button
                  key={category.label}
                  className="category"
                  data-category={category.label}
                  aria-pressed={category.topic ? topics.includes(category.topic) : !topics.length}
                  onClick={() => qualify("topic", category.topic)}
                >
                  {category.label}
                  <span>
                    {category.topic
                      ? entries.filter((entry) => entry.topics.includes(category.topic)).length
                      : entries.length}
                  </span>
                </button>
              ))}
            </fieldset>
            <fieldset className="group">
              <legend>License</legend>
              <label className="check">
                <input
                  type="radio"
                  name="license"
                  value=""
                  checked={!licenses.length}
                  onChange={() => qualify("license", "")}
                />
                Any license
              </label>
              {licenseOptions.map((license) => (
                <label key={license} className="check">
                  <input
                    type="radio"
                    name="license"
                    value={license.toLowerCase()}
                    checked={licenses.includes(license.toLowerCase())}
                    onChange={() => qualify("license", license.toLowerCase())}
                  />
                  {license}
                </label>
              ))}
            </fieldset>
            <fieldset className="group">
              <legend>Activity</legend>
              <label className="check">
                <input
                  ref={active}
                  id="active"
                  type="checkbox"
                  checked={pushed.includes(`>=${yearAgo}`)}
                  onChange={(event) =>
                    qualify("pushed", event.target.checked ? `>=${yearAgo}` : "")
                  }
                />
                Updated in the last year
              </label>
              <label className="check">
                <input
                  id="archived"
                  type="checkbox"
                  checked={!values("archived").includes("false")}
                  onChange={(event) => qualify("archived", event.target.checked ? "" : "false")}
                />
                Include archived
              </label>
            </fieldset>
            <button className="clear" id="clear" onClick={() => setQuery("")}>
              Clear all filters
            </button>
            <div className="sidebar-bottom">
              {entries.length.toLocaleString("en")} GitHub repositories
              <br />
              {date ? `Refreshed ${new Date(date).toLocaleDateString("en")}` : "Loading catalog…"}
            </div>
          </div>
        </aside>
        <main>
          <div className="intro">
            <span className="eyebrow">THE EMACS PACKAGE INDEX</span>
            <h1>Find the right package. Keep moving.</h1>
            <p>Search GitHub-hosted Emacs packages, with the details right where you need them.</p>
          </div>
          <label className="searchbox">
            <span className="sr-only">Search packages</span>
            <Search size={18} />
            <input
              ref={input}
              id="query"
              type="search"
              aria-invalid={Boolean(state.error)}
              aria-describedby="query-status"
              placeholder="Search packages…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
          <p
            id="query-status"
            className={`query-status${state.error ? " query-error" : ""}`}
            role="status"
          >
            {state.error ||
              "GitHub filters: user:minad · topic:completion · license:gpl-3.0 · stars:>=1000"}
          </p>
          <div className="toolbar">
            <h2>
              {title}
              <span id="count" aria-live="polite">
                {loading
                  ? "Loading…"
                  : `${state.results.length.toLocaleString("en")} ${state.results.length === 1 ? "repository" : "repositories"}`}
              </span>
            </h2>
            <button
              className="mobile-filter"
              id="mobile-filter"
              aria-expanded={mobileFilters}
              onClick={() => setMobileFilters(!mobileFilters)}
            >
              Filters
            </button>
            <label>
              <span className="sr-only">Sort packages</span>
              <select id="sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="stars">Most starred</option>
                <option value="updated">Recently updated</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          <div className="columns" aria-hidden="true">
            <span className="colname">PACKAGE</span>
            <span>STARS</span>
            <span className="date-head">LAST PUSH</span>
            <span />
          </div>
          {loading ? (
            <div className="loader" role="status">
              Loading the package catalog…
            </div>
          ) : loadError ? (
            <div className="result-error" role="alert">
              <p>{loadError}</p>
              <button className="clear" onClick={() => setReload(reload + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <>
              <div id="results">
                {state.results.slice(0, limit).map((entry) => (
                  <PackageRow
                    key={entry.id}
                    entry={entry}
                    opened={openIds.has(entry.id)}
                    onOpen={(open) =>
                      setOpenIds((current) => {
                        if (current.has(entry.id) === open) return current
                        const next = new Set(current)
                        if (open) next.add(entry.id)
                        else next.delete(entry.id)
                        return next
                      })
                    }
                    onOwner={(owner) => qualify("user", owner, true)}
                  />
                ))}
              </div>
              {!state.results.length && !state.error && (
                <div className="empty">
                  No packages match these filters.
                  <br />
                  <button className="clear" style={{ marginTop: 14 }} onClick={() => setQuery("")}>
                    Clear filters
                  </button>
                </div>
              )}
              {state.results.length > limit && (
                <button className="more" onClick={() => setLimit(limit + 30)}>
                  Show more packages ↓
                </button>
              )}
            </>
          )}
          <footer>
            <span>GitHub-hosted Emacs packages and libraries.</span>
            <span>Check the upstream README for installation and compatibility.</span>
          </footer>
        </main>
      </div>
    </>
  )
}
const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
