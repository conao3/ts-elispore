import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  Search,
  BookOpen,
  ExternalLink,
  Star,
  ChevronDown,
  Copy,
  Check,
  X,
  SlidersHorizontal,
} from "lucide-react"
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Disclosure,
  DisclosurePanel,
  DialogTrigger,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  Input,
  Label,
  Link,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
  Select,
  SelectValue,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components"
import { catalogSchema, sourceLabels, sourceSchema } from "./catalog"
import type { Entry } from "./catalog"
import { deriveCategories } from "./categories"
import { normalizeTopic } from "./topics"
import { checkPrefix, parseQuery, searchEntries, setQualifier } from "./query"
import type { Filter } from "./query"
import { installationExample } from "./snippet"
import type { SnippetFormat, SnippetMethod } from "./snippet"
import { relativeTime, tokenizeSnippet } from "./presentation"
import "./style.css"
import { About } from "./about"
import { checksSchema, checkScore, entryChecks } from "./checks"
import type { Checks } from "./checks"
import { PackageChecks } from "./package-checks"

const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
function Github({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.2-1.5 6.2-7A5.4 5.4 0 0 0 18.8 4a5 5 0 0 0-.1-3S17.5.7 15 2.4a13.4 13.4 0 0 0-7 0C5.5.7 4.3 1 4.3 1a5 5 0 0 0-.1 3 5.4 5.4 0 0 0-1.5 3.8c0 5.5 3.2 6.7 6.2 7A3.4 3.4 0 0 0 8 17.5V22" />
    </svg>
  )
}
function PackageRow({
  entry,
  checks,
  filters,
  opened,
  onOpen,
  onOwner,
  onTopic,
}: {
  entry: Entry
  checks: Checks | null
  filters: Filter[]
  opened: boolean
  onOpen: (open: boolean) => void
  onOwner: (owner: string) => void
  onTopic: (topic: string) => void
}) {
  const [owner, name] = entry.name.split("/")
  const github = new URL(entry.url).hostname === "github.com" && Boolean(name)
  const stars = entry.stars?.toLocaleString("en")
  const packages = entryChecks(entry, checks)
  const score = checkScore(packages, checks?.rules ?? [])
  const [format, setFormat] = useState<SnippetFormat>("leaf")
  const [method, setMethod] = useState<SnippetMethod>("vc")
  const { code, note, hasArchive } = installationExample(entry, format, filters, method)
  const copyVersion = useRef(0)
  function selectFormat(next: SnippetFormat) {
    copyVersion.current++
    setCopiedCode(null)
    setFormat(next)
  }
  const pre = useRef<HTMLPreElement>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const copied = code !== null && copiedCode === code
  async function copy() {
    if (code === null) return
    const version = ++copyVersion.current
    try {
      await navigator.clipboard.writeText(code)
      if (copyVersion.current === version) setCopiedCode(code)
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
        {github ? (
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
              width={36}
              height={36}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </Link>
        ) : (
          <span className="tile" aria-hidden="true">
            <BookOpen size={18} />
          </span>
        )}
        <span className="identity">
          <strong className="repo-name">
            {github && (
              <>
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
              </>
            )}
            <Button slot="trigger" className="repo-trigger" aria-label={`${entry.name} details`}>
              {github ? name : entry.name}
            </Button>
          </strong>
          {entry.description && (
            <span className="description" title={entry.description}>
              {entry.description}
            </span>
          )}
        </span>
        <span className="stars">
          <span className="star-count">
            <Star size={14} aria-hidden="true" />
            {stars ?? "—"}
          </span>
          {score && (
            <span
              className="check-score"
              role="img"
              aria-label={`${score.passed} of ${score.total} package checks pass`}
            >
              {score.passed}/{score.total}
            </span>
          )}
        </span>
        <time dateTime={entry.updated} title={entry.updated}>
          {entry.updated ? relativeTime(entry.updated) : "—"}
        </time>
        <ChevronDown className="chevron" size={16} aria-hidden="true" />
      </div>
      <DisclosurePanel className="expanded" aria-label={`${entry.name} details`}>
        <div className="explanation">
          <dl className="metadata">
            <dt>Language</dt>
            <dd>{entry.language ?? "Not specified"}</dd>
            <dt>License</dt>
            <dd>
              {entry.license && entry.license !== "NOASSERTION" ? entry.license : "See repository"}
            </dd>
            <dt>Stars</dt>
            <dd>{stars ?? "Not available"}</dd>
            <dt>Last push</dt>
            <dd>
              {entry.updated
                ? new Date(entry.updated).toLocaleDateString("en", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : "Not available"}
            </dd>
            {entry.sources?.length ? (
              <>
                <dt>Sources</dt>
                <dd>{entry.sources.map((source) => sourceLabels[source]).join(", ")}</dd>
              </>
            ) : null}
            {entry.topics.length > 0 && (
              <>
                <dt>Topics</dt>
                <dd className="topics">
                  {entry.topics.map((topic) => (
                    <Button
                      key={topic}
                      className="topic"
                      data-topic={topic}
                      aria-label={`Add topic:${topic} to the search query`}
                      onPress={() => onTopic(topic)}
                    >
                      {topic}
                    </Button>
                  ))}
                </dd>
              </>
            )}
            {entry.archived && (
              <>
                <dt>Status</dt>
                <dd className="archived">Archived</dd>
              </>
            )}
          </dl>
          {checks && <PackageChecks packages={packages} report={checks} />}
          <div className="links">
            <Link href={entry.url} target="_blank" rel="noopener">
              {github ? (
                <Github size={14} aria-hidden="true" />
              ) : (
                <BookOpen size={14} aria-hidden="true" />
              )}
              {github ? "GitHub" : "Upstream"}
              <ExternalLink size={11} aria-hidden="true" />
            </Link>
            {github && (
              <Link href={`${entry.url}#readme`} target="_blank" rel="noopener">
                <BookOpen size={14} aria-hidden="true" />
                README
                <ExternalLink size={11} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
        <div className="installation">
          {hasArchive && (
            <ToggleButtonGroup
              className="method-switch"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[method]}
              onSelectionChange={(keys) => {
                const selected = [...keys][0]
                if (selected === "archive" || selected === "vc") {
                  copyVersion.current++
                  setCopiedCode(null)
                  setMethod(selected)
                }
              }}
              aria-label="Installation method"
            >
              <ToggleButton id="vc">Git (:vc)</ToggleButton>
              <ToggleButton id="archive">ELPA (:ensure)</ToggleButton>
            </ToggleButtonGroup>
          )}
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
              <Button
                className="copy"
                type="button"
                isDisabled={code === null}
                onPress={() => void copy()}
              >
                {copied ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre
              ref={pre}
              tabIndex={code === null ? undefined : 0}
              role="group"
              aria-label="Installation code"
              aria-disabled={code === null || undefined}
            >
              <code>
                {code === null
                  ? note
                  : tokenizeSnippet(code).map((token, i) => (
                      <span key={i} className={`syntax-${token.kind}`}>
                        {token.text}
                      </span>
                    ))}
              </code>
            </pre>
          </div>
          <Disclosure className="requirements">
            <Button slot="trigger">
              <ChevronDown size={12} aria-hidden="true" />
              Requirements
            </Button>
            <DisclosurePanel>
              <p className="code-note">
                {method === "archive" && hasArchive
                  ? "Enable the corresponding ELPA archive in Emacs before installing."
                  : format === "leaf"
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
  const [checks, setChecks] = useState<Checks | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch("/checks.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Checks unavailable")
        return response.json()
      })
      .then((value: unknown) => {
        if (!controller.signal.aborted) setChecks(checksSchema.parse(value))
      })
      .catch(() => {
        /* Optional cached results must not interrupt search. */
      })
    return () => controller.abort()
  }, [])
  const [entries, setEntries] = useState<Entry[]>([]),
    [date, setDate] = useState(""),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [reload, setReload] = useState(0)
  const [query, setQuery] = useState(
    () => new URLSearchParams(location.search).get("q") ?? "-archived:true",
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
    const pop = () => setQuery(new URLSearchParams(location.search).get("q") ?? "-archived:true")
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
  const topics = values("topic").map(normalizeTopic),
    licenses = values("license"),
    pushed = values("pushed")
  const categories = deriveCategories(entries, values("topic"))
  const prefix = useMemo(() => checkPrefix(entries, state.filters), [entries, state.filters])
  const sources = values("source")
  const sourceOptions = useMemo(() => {
    const present = new Set(entries.flatMap((entry) => entry.sources ?? []))
    return sourceSchema.options.filter((source) => present.has(source))
  }, [entries])
  function qualify(key: string, value: string, append = false, exclude = false) {
    try {
      setQuery(setQualifier(query, key, value, append, exclude))
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
  const filters = (
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
            <span>{category.count}</span>
          </ToggleButton>
        ))}
      </fieldset>
      <CheckboxGroup
        className="group"
        value={sources}
        onChange={(values) => {
          try {
            setQuery(
              values.reduce(
                (query, value) => setQualifier(query, "source", value, true),
                setQualifier(query, "source", ""),
              ),
            )
          } catch {
            input.current?.focus()
          }
        }}
      >
        <Label>Source</Label>
        {sourceOptions.map((source) => (
          <Checkbox key={source} className="check" value={source}>
            <span className="checkbox-mark" />
            {sourceLabels[source]}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <CheckboxGroup
        className="group license-group"
        value={licenses}
        onChange={(values) => {
          try {
            setQuery(
              values.reduce(
                (query, value) => setQualifier(query, "license", value, true),
                setQualifier(query, "license", ""),
              ),
            )
          } catch {
            input.current?.focus()
          }
        }}
      >
        <Label>License</Label>
        {[...new Set([...licenseOptions.map((license) => license.toLowerCase()), ...licenses])].map(
          (license) => (
            <Checkbox key={license} className="check" value={license}>
              <span className="checkbox-mark" />
              {licenseOptions.find((option) => option.toLowerCase() === license) ?? license}
            </Checkbox>
          ),
        )}
      </CheckboxGroup>
      <fieldset className="group">
        <legend>Activity</legend>
        <Checkbox
          className="check"

          isSelected={pushed.includes(`>=${yearAgo}`)}
          isIndeterminate={pushed.length > 0 && !pushed.includes(`>=${yearAgo}`)}
          onChange={(checked) => qualify("pushed", checked ? `>=${yearAgo}` : "")}
        >
          <span className="checkbox-mark" />
          Updated in the last year
        </Checkbox>
        <Checkbox
          className="check"

          isSelected={
            !state.filters.some(
              ({ key, value, exclude }) =>
                key === "archived" && value === (exclude ? "true" : "false"),
            )
          }
          onChange={(checked) => qualify("archived", checked ? "" : "true", false, !checked)}
        >
          <span className="checkbox-mark" />
          Include archived
        </Checkbox>
      </fieldset>
      <Button className="clear" onPress={() => setQuery("")}>
        Clear all filters
      </Button>
    </div>
  )
  return (
    <>
      <header>
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Elispore home">
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 1v22M1 12h22M4 4l16 16M4 20L20 4"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            elispore
          </Link>
          <div className="catalog-meta">
            <span>{entries.length.toLocaleString("en")} packages</span>
            <span>
              {date
                ? `Refreshed ${new Date(date).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}`
                : "Loading catalog…"}
            </span>
          </div>
          <Link
            className="add-recipe"
            href="/about/"
            aria-current={window.location.pathname === "/about/" ? "page" : undefined}
          >
            Add recipe
          </Link>
          <Link
            className="source-link"
            href="https://github.com/conao3/ts-elispore"
            target="_blank"
            rel="noopener"
            aria-label="Source on GitHub"
          >
            <Github size={19} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {window.location.pathname.replace(/\/$/, "") === "/about" ? (
        <About checks={checks} />
      ) : (
        <div className="layout">
          <aside aria-label="Package filters">{filters}</aside>
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
              <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
            </SearchField>
            <p
              id="query-status"
              className={`query-status${state.error ? " query-error" : ""}`}
              role="status"
            >
              {state.error}
            </p>
            {!loading && !loadError && prefix && (
              <div className="prefix-status">
                <p role="status">
                  {prefix.packages.length
                    ? `“${prefix.prefix}” is in use.`
                    : `“${prefix.prefix}” is free in this catalog.`}
                </p>
                {prefix.packages.length > 0 && (
                  <Disclosure className="requirements">
                    <Button slot="trigger">
                      <ChevronDown size={12} aria-hidden="true" />
                      {prefix.packages.length === 1
                        ? "1 matching package"
                        : `${prefix.packages.length} matching packages`}
                    </Button>
                    <DisclosurePanel>
                      <ul>
                        {prefix.packages.map(({ name, sources }) => (
                          <li key={name}>
                            <strong>{name}</strong> —{" "}
                            {sources.map((source) => sourceLabels[source]).join(", ")}
                          </li>
                        ))}
                      </ul>
                    </DisclosurePanel>
                  </Disclosure>
                )}
              </div>
            )}
            <div className="toolbar">
              <h2>
                <span id="count" aria-live="polite">
                  {loading
                    ? "Loading…"
                    : `${state.results.length.toLocaleString("en")} ${state.results.length === 1 ? "package" : "packages"}`}
                </span>
              </h2>
              <DialogTrigger isOpen={mobileFilters} onOpenChange={setMobileFilters}>
                <Button className="mobile-filter" id="mobile-filter" aria-expanded={mobileFilters}>
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  Filters
                </Button>
                <ModalOverlay className="filter-overlay" isDismissable>
                  <Modal className="filter-modal">
                    <Dialog className="filter-dialog" aria-label="Package filters">
                      {({ close }) => (
                        <>
                          <div className="sheet-heading">
                            <Heading slot="title">Filters</Heading>
                            <Button
                              className="icon-button"
                              aria-label="Close filters"
                              onPress={close}
                            >
                              <X size={20} aria-hidden="true" />
                            </Button>
                          </div>
                          <div className="sheet-content">{filters}</div>
                          <div className="sheet-footer">
                            <Button className="show-results" onPress={close}>
                              Show {state.results.length.toLocaleString("en")} packages
                            </Button>
                          </div>
                        </>
                      )}
                    </Dialog>
                  </Modal>
                </ModalOverlay>
              </DialogTrigger>
              <Select
                aria-label="Sort packages"
                value={sort}
                onChange={(value) => {
                  if (value) setSort(String(value))
                }}
              >
                <Button id="sort" className="sort-trigger">
                  <SelectValue />
                  <ChevronDown size={14} aria-hidden="true" />
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
              <span className="colname">Package</span>
              <span>Stars</span>
              <span className="date-head">Updated</span>
              <span />
            </div>
            <div className="results-card">
              {loading ? (
                <div className="loader" role="status">
                  <span className="sr-only">Loading the package catalog…</span>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div className="skeleton-row" key={i} aria-hidden="true">
                      <span />
                      <div>
                        <i />
                        <i />
                      </div>
                    </div>
                  ))}
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
                        checks={checks}
                        filters={state.filters}
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
                        onTopic={(topic) => qualify("topic", topic, true)}
                      />
                    ))}
                  </div>
                  {!state.results.length && !state.error && (
                    <div className="empty">
                      No packages match these filters.
                      <br />
                      <Button
                        className="clear"
                        style={{ marginTop: 14 }}
                        onPress={() => setQuery("")}
                      >
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
            </div>
          </main>
        </div>
      )}
    </>
  )
}
const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
