import { ChevronDown, CircleCheck, CircleX } from "lucide-react"
import { Button, Disclosure, DisclosurePanel, Link } from "react-aria-components"
import { sourceLabels } from "./catalog"
import { applicableRules } from "./checks"
import { InlineCode } from "./inline-code"
import type { Checks, PackageCheck } from "./checks"

function RuleList({ pkg, rules }: { pkg: PackageCheck; rules: Checks["rules"] }) {
  const ordered = rules.toSorted(
    (a, b) => Number(!pkg.failed.includes(a.id)) - Number(!pkg.failed.includes(b.id)),
  )
  return (
    <ul className="check-rules">
      {ordered.map((rule) => {
        const failed = pkg.failed.includes(rule.id)
        const Icon = failed ? CircleX : CircleCheck
        return (
          <li key={rule.id} className={failed ? "check-fail" : "check-pass"}>
            <Icon size={15} aria-hidden="true" />
            <span>
              <span className="sr-only">{failed ? "Fail: " : "Pass: "}</span>
              <Link href={rule.sources[0]!.url} target="_blank" rel="noreferrer">
                <InlineCode text={rule.title} />
              </Link>
              {rule.description && (
                <small>
                  <InlineCode text={rule.description} />
                </small>
              )}
              {rule.level === "required" && (
                <small className="check-sources">
                  {rule.sources.map((source, index) => (
                    <Link
                      key={index}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${source.label}: ${source.quote}`}
                    >
                      {source.label.split(": ")[1] ?? source.label}
                    </Link>
                  ))}
                </small>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function PackageChecks({ packages, report }: { packages: PackageCheck[]; report: Checks }) {
  if (!packages.length) return null
  return (
    <section className="package-checks" aria-label="Package checks">
      <h3>Package checks</h3>
      <p className="checks-date">
        Run <time dateTime={report.generatedAt}>{report.generatedAt.slice(0, 10)}</time>
      </p>
      {packages.map((pkg) => {
        const advice = applicableRules(pkg, report.rules, "advice").filter((rule) =>
          pkg.failed.includes(rule.id),
        )
        return (
          <div className="checked-package" key={pkg.key}>
            <h4>
              {sourceLabels[pkg.source]} · {pkg.name}
            </h4>
            <p className="checked-version">Version {pkg.version || "unavailable"}</p>
            {pkg.error !== undefined ? (
              <p className="check-error">Could not run checks: {pkg.error}</p>
            ) : (
              <>
                <RuleList pkg={pkg} rules={applicableRules(pkg, report.rules, "required")} />
                {advice.length ? (
                  <Disclosure className="check-advice">
                    <Button slot="trigger">
                      <ChevronDown size={12} aria-hidden="true" />
                      melpazoid advice ({advice.length})
                    </Button>
                    <DisclosurePanel>
                      <RuleList pkg={pkg} rules={advice} />
                    </DisclosurePanel>
                  </Disclosure>
                ) : (
                  <p className="check-advice-none">No melpazoid advice</p>
                )}
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}
