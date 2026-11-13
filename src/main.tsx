import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Search } from "lucide-react"
import {
  Button,
  Checkbox,
  Disclosure,
  DisclosurePanel,
  Input,
  Label,
  Link,
  ListBox,
  ListBoxItem,
  Popover,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  SelectValue,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components"
import { catalogSchema } from "./catalog"
import type { Entry } from "./catalog"
import { parseQuery, searchEntries, setQualifier } from "./query"
import { installationSnippet } from "./snippet"
import type { SnippetFormat } from "./snippet"
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
  const [format, setFormat] = useState<SnippetFormat>("leaf")
  const code = installationSnippet(entry, format)
  const copyVersion = useRef(0)
  function selectFormat(next: SnippetFormat) {
    copyVersion.current++
    setCopied(false)
    setFormat(next)
  }
  const pre = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  async function copy() {
    const version = ++copyVersion.current
    try {
      await navigator.clipboard.writeText(code)
      if (copyVersion.current === version) setCopied(true)
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
    <Disclosure
      className="package"
      data-name={entry.name}
      isExpanded={opened}
      onExpandedChange={onOpen}
    >
      <div
        className="package-row"
        onClick={(event) => {
          if (!(event.target as Element).closest("a,button") && !getSelection()?.toString())
            onOpen(!opened)
        }}
      >
        <Link
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
        </Link>
        <span className="identity">
          <strong className="repo-name">
            <Button
              type="button"
              className="repo-owner"
              data-owner={owner}
              aria-label={`Add user:${owner} to the search query`}
              onPress={() => {
                if (!getSelection()?.toString()) onOwner(owner)
              }}
            >
              {owner}
            </Button>
            <span className="repo-slash">/</span>
            <Button slot="trigger" className="repo-trigger" aria-label={`${entry.name} details`}>
              {name}
            </Button>
          </strong>
          {entry.description && <span>{entry.description}</span>}
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
      </div>
      <DisclosurePanel className="expanded" aria-label={`${entry.name} details`}>
        <div className="explanation">
          <div className="badges">
            {entry.language && <span>{entry.language}</span>}
            <span>
              {entry.license && entry.license !== "NOASSERTION"
                ? entry.license
                : "License: see repository"}
            </span>
            {entry.archived && <span>Archived</span>}
          </div>
          <div className="links">
            <Link href={entry.url} target="_blank" rel="noopener">
              GitHub
            </Link>
            <Link href={`${entry.url}#readme`} target="_blank" rel="noopener">
              README
            </Link>
          </div>
        </div>
        <div className="installation">
          <div className="code-block">
            <div className="code-toolbar">
              <ToggleButtonGroup
                className="snippet-switch"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[format]}
                onSelectionChange={(keys) => {
                  const next = [...keys][0]
                  if (next === "leaf" || next === "use-package") selectFormat(next)
                }}
                aria-label="Installation format"
              >
                {(["leaf", "use-package"] as const).map((option) => (
                  <ToggleButton key={option} id={option}>
                    {option}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Button className="copy" type="button" onPress={() => void copy()}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre ref={pre} tabIndex={0}>
              <code>{code}</code>
            </pre>
          </div>
          <Disclosure className="requirements">
            <Button slot="trigger">Requirements</Button>
            <DisclosurePanel>
              <p className="code-note">
                {format === "leaf"
                  ? "Requires leaf with :vc support and Emacs 29+."
                  : "Requires use-package with :vc support (included in Emacs 30+)."}{" "}
                See the upstream README for configuration.
              </p>
            </DisclosurePanel>
          </Disclosure>
        </div>
      </DisclosurePanel>
    </Disclosure>
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
  const input = useRef<HTMLInputElement>(null)
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
  return (
    <>
      <header>
        <Link className="brand" href="/" aria-label="Elispore home">
          <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 1v22M1 12h22M4 4l16 16M4 20L20 4" stroke="#CC785C" strokeWidth="2.2" />
          </svg>
          elispore
        </Link>
        <Link
          className="github"
          href="https://github.com/conao3/ts-elispore"
          target="_blank"
          rel="noopener"
        >
          Source
        </Link>
      </header>
      <div className={`layout${mobileFilters ? " show-filters" : ""}`}>
        <aside aria-label="Package filters">
          <div className="sidebar-content">
            <fieldset className="group">
              <legend>Category</legend>
              {categories.map((category) => (
                <ToggleButton
                  key={category.label}
                  className="category"
                  data-category={category.label}
                  isSelected={category.topic ? topics.includes(category.topic) : !topics.length}
                  onPress={() => qualify("topic", category.topic)}
                >
                  {category.label}
                  <span>
                    {category.topic
                      ? entries.filter((entry) => entry.topics.includes(category.topic)).length
                      : entries.length}
                  </span>
                </ToggleButton>
              ))}
            </fieldset>
            <RadioGroup
              className="group"
              value={licenses[0] ?? ""}
              onChange={(value) => qualify("license", value)}
            >
              <Label>License</Label>
              <Radio className="check" value="">
                <span className="radio-mark" />
                Any license
              </Radio>
              {licenseOptions.map((license) => (
                <Radio key={license} className="check" value={license.toLowerCase()}>
                  <span className="radio-mark" />
                  {license}
                </Radio>
              ))}
            </RadioGroup>
            <fieldset className="group">
              <legend>Activity</legend>
              <Checkbox
                className="check"
                id="active"
                isSelected={pushed.includes(`>=${yearAgo}`)}
                isIndeterminate={pushed.length > 0 && !pushed.includes(`>=${yearAgo}`)}
                onChange={(checked) => qualify("pushed", checked ? `>=${yearAgo}` : "")}
              >
                <span className="checkbox-mark" />
                Updated in the last year
              </Checkbox>
              <Checkbox
                className="check"
                id="archived"
                isSelected={!values("archived").includes("false")}
                onChange={(checked) => qualify("archived", checked ? "" : "false")}
              >
                <span className="checkbox-mark" />
                Include archived
              </Checkbox>
            </fieldset>
            <Button className="clear" id="clear" onPress={() => setQuery("")}>
              Clear all filters
            </Button>
            <div className="sidebar-bottom">
              {date ? `Refreshed ${new Date(date).toLocaleDateString("en")}` : "Loading catalog…"}
            </div>
          </div>
        </aside>
        <main>
          <h1 className="sr-only">Emacs packages</h1>
          <SearchField
            className="searchbox"
            aria-label="Search packages"
            value={query}
            onChange={setQuery}
            isInvalid={Boolean(state.error)}
          >
            <Search size={18} />
            <Input
              ref={input}
              id="query"
              type="search"
              aria-invalid={Boolean(state.error)}
              aria-describedby="query-status"
              placeholder="Search packages or user:minad topic:completion"
            />
            <kbd>⌘ K</kbd>
          </SearchField>
          <p
            id="query-status"
            className={`query-status${state.error ? " query-error" : ""}`}
            role="status"
          >
            {state.error}
          </p>
          <div className="toolbar">
            <h2>
              <span id="count" aria-live="polite">
                {loading
                  ? "Loading…"
                  : `${state.results.length.toLocaleString("en")} ${state.results.length === 1 ? "repository" : "repositories"}`}
              </span>
            </h2>
            <Button
              className="mobile-filter"
              id="mobile-filter"
              aria-expanded={mobileFilters}
              onPress={() => setMobileFilters(!mobileFilters)}
            >
              Filters
            </Button>
            <Select
              aria-label="Sort packages"
              value={sort}
              onChange={(value) => {
                if (value) setSort(String(value))
              }}
            >
              <Button id="sort" className="sort-trigger">
                <SelectValue />
                <span aria-hidden="true">⌄</span>
              </Button>
              <Popover className="sort-popover">
                <ListBox className="sort-options">
                  <ListBoxItem id="stars">Most starred</ListBoxItem>
                  <ListBoxItem id="updated">Recently updated</ListBoxItem>
                  <ListBoxItem id="name">Name A–Z</ListBoxItem>
                </ListBox>
              </Popover>
            </Select>
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
              <Button className="clear" onPress={() => setReload(reload + 1)}>
                Try again
              </Button>
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
                  <Button className="clear" style={{ marginTop: 14 }} onPress={() => setQuery("")}>
                    Clear filters
                  </Button>
                </div>
              )}
              {state.results.length > limit && (
                <Button className="more" onPress={() => setLimit(limit + 30)}>
                  Show more packages ↓
                </Button>
              )}
            </>
          )}
        </main>
      </div>
    </>
  )
}
const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
