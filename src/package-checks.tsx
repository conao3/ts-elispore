import { ChevronDown, CircleAlert, CircleCheck, CircleX, Minus } from "lucide-react"
import { Button, Disclosure, DisclosurePanel, Link } from "react-aria-components"
import { sourceLabels } from "./catalog"
import type { Checks, PackageCheck } from "./checks"
import { InlineCode } from "./inline-code"

type Rule = Checks["rules"][number]
type Status = "pass" | "fail" | "skip" | "found" | "clear"

const statusIcons = {
  pass: CircleCheck,
  fail: CircleX,
  skip: Minus,
  found: CircleAlert,
  clear: Minus,
}

const statusLabels: Record<Status, string> = {
  pass: "Pass",
  fail: "Fail",
  skip: "Not checked for this source",
  found: "Found",
  clear: "Not found",
}

function status(pkg: PackageCheck, rule: Rule): Status {
  if (pkg.skipped?.includes(rule.id)) return "skip"
  const failed = pkg.failed.includes(rule.id)
  if (rule.level === "advice") return failed ? "found" : "clear"
  return failed ? "fail" : "pass"
}

function StatusCell({ pkg, rule }: { pkg: PackageCheck; rule: Rule }) {
  const value = status(pkg, rule)
  const Icon = statusIcons[value]
  return (
    <td className={`check-status check-${value}`}>
      <Icon size={15} aria-label={statusLabels[value]} />
    </td>
  )
}

function RuleRows({ rules, packages }: { rules: Rule[]; packages: PackageCheck[] }) {
  return rules.map((rule) => (
    <tr key={rule.id}>
      <th scope="row">
        <Link href={`/about/#rule-${rule.id}`}>
          <InlineCode text={rule.title} />
        </Link>
        {rule.description && (
          <small>
            <InlineCode text={rule.description} />
          </small>
        )}
      </th>
      {packages.map((pkg) => (
        <StatusCell key={pkg.key} pkg={pkg} rule={rule} />
      ))}
    </tr>
  ))
}

function RuleTable({
  rules,
  packages,
  label,
  header,
}: {
  rules: Rule[]
  packages: PackageCheck[]
  label: string
  header: boolean
}) {
  return (
    <table className="check-table" aria-label={label}>
      <thead className={header && packages.length > 1 ? undefined : "sr-only"}>
        <tr>
          <th scope="col">Check</th>
          {packages.map((pkg) => (
            <th scope="col" key={pkg.key}>
              {sourceLabels[pkg.source]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <RuleRows rules={rules} packages={packages} />
      </tbody>
    </table>
  )
}

export function PackageChecks({ packages, report }: { packages: PackageCheck[]; report: Checks }) {
  if (!packages.length) return null
  const checked = packages.filter((pkg) => pkg.error === undefined)
  const required = report.rules.filter(
    (rule) => rule.level === "required" && checked.some((pkg) => status(pkg, rule) !== "skip"),
  )
  const failing = required.filter((rule) => checked.some((pkg) => status(pkg, rule) === "fail"))
  const passing = required.filter((rule) => !failing.includes(rule))
  const advice = report.rules.filter(
    (rule) => rule.level === "advice" && checked.some((pkg) => pkg.failed.includes(rule.id)),
  )
  return (
    <section className="package-checks" aria-label="Package checks">
      <div className="checks-header">
        <h3>Package checks</h3>
        <p className="checks-date">
          Run <time dateTime={report.generatedAt}>{report.generatedAt.slice(0, 10)}</time> /{" "}
          <Link href="/about/#package-checks-about">About the rules</Link>
        </p>
      </div>
      <ul className="checked-packages">
        {packages.map((pkg) => {
          const applicable = required.filter((rule) => status(pkg, rule) !== "skip")
          const passed = applicable.filter((rule) => status(pkg, rule) === "pass").length
          return (
            <li className="checked-package" key={pkg.key}>
              <span className="checked-source">
                {sourceLabels[pkg.source]} / {pkg.name}
              </span>
              <span className="checked-version">{pkg.version || "Version unavailable"}</span>
              {pkg.error !== undefined ? (
                <span className="check-error">Could not run checks: {pkg.error}</span>
              ) : (
                <span
                  className={
                    passed === applicable.length
                      ? "checked-summary checked-perfect"
                      : "checked-summary"
                  }
                >
                  {passed === applicable.length && <CircleCheck size={13} aria-hidden="true" />}
                  {passed === applicable.length
                    ? `All ${applicable.length} required checks pass`
                    : `${passed} of ${applicable.length} required checks pass`}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {checked.length > 0 && (
        <>
          {failing.length === 0 && (
            <div className="checks-perfect" role="status">
              <CircleCheck size={30} strokeWidth={2.25} aria-hidden="true" />
              <div>
                <strong>Every required check passes</strong>
                <span>
                  Checked in {checked.map((pkg) => sourceLabels[pkg.source]).join(" and ")} /{" "}
                  {advice.length === 0
                    ? "no melpazoid advice"
                    : `${advice.length} melpazoid advice`}
                </span>
              </div>
            </div>
          )}
          {failing.length > 0 && (
            <RuleTable rules={failing} packages={checked} label="Failing required checks" header />
          )}
          {passing.length > 0 && (
            <Disclosure className="check-group">
              <Button slot="trigger">
                <ChevronDown size={12} aria-hidden="true" />
                {passing.length} passing {passing.length === 1 ? "check" : "checks"}
              </Button>
              <DisclosurePanel>
                <RuleTable
                  rules={passing}
                  packages={checked}
                  label="Passing required checks"
                  header={failing.length === 0}
                />
              </DisclosurePanel>
            </Disclosure>
          )}
          {advice.length > 0 ? (
            <Disclosure className="check-group check-advice">
              <Button slot="trigger">
                <ChevronDown size={12} aria-hidden="true" />
                melpazoid advice ({advice.length})
              </Button>
              <DisclosurePanel>
                <RuleTable
                  rules={advice}
                  packages={checked}
                  label="melpazoid advice"
                  header={false}
                />
              </DisclosurePanel>
            </Disclosure>
          ) : (
            <p className="check-advice-none">No melpazoid advice</p>
          )}
        </>
      )}
    </section>
  )
}
