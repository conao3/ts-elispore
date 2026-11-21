import { CircleCheck, CircleX } from "lucide-react"
import { sourceLabels } from "./catalog"
import type { Checks, PackageCheck } from "./checks"

export function PackageChecks({ packages, report }: { packages: PackageCheck[]; report: Checks }) {
  if (!packages.length) return null
  return (
    <section className="package-checks" aria-label="Package checks">
      <h3>Package checks</h3>
      <p className="checks-date">
        Run <time dateTime={report.generatedAt}>{report.generatedAt.slice(0, 10)}</time>
      </p>
      {packages.map((pkg) => (
        <div className="checked-package" key={pkg.key}>
          <h4>
            {sourceLabels[pkg.source]} · {pkg.name}
          </h4>
          <p className="checked-version">Version {pkg.version || "unavailable"}</p>
          {pkg.error !== undefined ? (
            <p className="check-error">Could not run checks: {pkg.error}</p>
          ) : (
            <ul className="check-rules">
              {report.rules.map((rule) => {
                const failed = pkg.failed.includes(rule.id)
                const Icon = failed ? CircleX : CircleCheck
                return (
                  <li key={rule.id} className={failed ? "check-fail" : "check-pass"}>
                    <Icon size={15} aria-hidden="true" />
                    <span>
                      <span className="sr-only">{failed ? "Fail: " : "Pass: "}</span>
                      {rule.title}
                      <small>{rule.description}</small>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}
