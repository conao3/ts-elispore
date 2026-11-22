use anyhow::{bail, Context, Result};
use clap::Parser;
use elispore_check::{
    archive::{self, Package, MAX_BYTES},
    melpazoid, policy, RULE_SET_VERSION,
};
use futures::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, time::Duration};

#[derive(Parser)]
#[command(
    version,
    about = "Check Emacs Lisp packages against MELPA's CONTRIBUTING.org and melpazoid"
)]
struct Args {
    #[arg(
        long,
        value_delimiter = ',',
        default_value = "melpa,gnu-elpa,nongnu-elpa"
    )]
    source: Vec<String>,
    #[arg(long)]
    github_list: Option<PathBuf>,
    #[arg(long, num_args = 1..)]
    only: Vec<String>,
    #[arg(long, default_value_t = 32, value_parser = clap::value_parser!(u16).range(1..=1024))]
    jobs: u16,
    #[arg(long)]
    cache: Option<PathBuf>,
    #[arg(long, default_value = "public/checks.json")]
    output: PathBuf,
    #[arg(long)]
    force: bool,
}

#[derive(Serialize, Deserialize)]
struct Source {
    label: String,
    url: String,
    quote: String,
}

#[derive(Serialize, Deserialize)]
struct Rule {
    id: String,
    title: String,
    description: String,
    level: String,
    sources: Vec<Source>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Check {
    version: String,
    failed: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    skipped: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    version: u32,
    generated_at: String,
    rules: Vec<Rule>,
    results: BTreeMap<String, Check>,
}

async fn body(response: reqwest::Response) -> Result<Vec<u8>> {
    let mut response = response.error_for_status()?;
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        bail!("response exceeds size limit");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            bail!("response exceeds size limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn check(
    client: &reqwest::Client,
    package: &Package,
    cached: Option<&Check>,
    force: bool,
) -> Result<(Check, bool)> {
    let mut version = package.version.clone();
    if package.kind == "github" {
        let response = client.head(&package.url).send().await?.error_for_status()?;
        version = response
            .headers()
            .get(reqwest::header::ETAG)
            .context("GitHub response has no ETag")?
            .to_str()?
            .to_owned();
    }
    if let Some(cached) = cached.filter(|c| !force && c.error.is_none() && c.version == version) {
        return Ok((cached.clone(), true));
    }
    let response = client.get(&package.url).send().await?.error_for_status()?;
    if package.kind == "github" {
        version = response
            .headers()
            .get(reqwest::header::ETAG)
            .context("GitHub response has no ETag")?
            .to_str()?
            .to_owned();
    }
    let bytes = body(response).await?;
    let facts = archive::unpack(package, &bytes)?;
    let advice = policy::advice(facts.clone());
    let results = policy::evaluate(facts);
    let mut failed: Vec<String> = results
        .iter()
        .filter(|(_, (applies, pass))| *applies && !pass)
        .map(|(id, _)| id.clone())
        .collect();
    failed.extend(advice);
    let skipped = results
        .into_iter()
        .filter(|(_, (applies, _))| !applies)
        .map(|(id, _)| id)
        .collect();
    Ok((
        Check {
            version,
            failed,
            skipped,
            error: None,
        },
        false,
    ))
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .connect_timeout(Duration::from_secs(20))
        .user_agent("elispore-check/0.1")
        .build()?;
    let cache_path = args.cache.as_ref().unwrap_or(&args.output);
    let cache: Option<Report> = if !args.force && cache_path.exists() {
        Some(serde_json::from_slice(&std::fs::read(cache_path)?).context("invalid cache JSON")?)
    } else {
        None
    };
    let cached = cache.as_ref().filter(|c| c.version == RULE_SET_VERSION);
    let mut packages = Vec::new();
    for source in &args.source {
        let base = match source.as_str() {
            "melpa" => "https://melpa.org/packages",
            "gnu-elpa" => "https://elpa.gnu.org/packages",
            "nongnu-elpa" => "https://elpa.nongnu.org/nongnu",
            "github" => {
                let path = args
                    .github_list
                    .as_ref()
                    .context("--source github requires --github-list")?;
                for line in std::fs::read_to_string(path)?
                    .lines()
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !s.starts_with('#'))
                {
                    packages.push(archive::github(line)?);
                }
                continue;
            }
            _ => bail!("unknown source: {source}"),
        };
        let bytes = body(
            client
                .get(format!("{base}/archive-contents"))
                .send()
                .await?,
        )
        .await
        .with_context(|| format!("fetch {source} index"))?;
        packages.extend(archive::index(source, base, std::str::from_utf8(&bytes)?)?);
    }
    packages.retain(|p| {
        args.only.is_empty() || args.only.contains(&p.name) || args.only.contains(&p.key)
    });
    packages.sort_by(|a, b| a.key.cmp(&b.key));
    packages.dedup_by(|a, b| a.key == b.key);
    let mut pending = stream::iter(packages.iter().map(|p| {
        let client = &client;
        let old = cached.and_then(|c| c.results.get(&p.key));
        async move {
            let result = check(client, p, old, args.force).await;
            (p, result)
        }
    }))
    .buffer_unordered(usize::from(args.jobs));
    let mut results = BTreeMap::new();
    let mut reused = 0;
    while let Some((package, result)) = pending.next().await {
        let value = match result {
            Ok((value, hit)) => {
                reused += usize::from(hit);
                value
            }
            Err(error) => Check {
                version: package.version.clone(),
                failed: Vec::new(),
                skipped: Vec::new(),
                error: Some(format!("{error:#}")),
            },
        };
        results.insert(package.key.clone(), value);
    }
    let mut rules: Vec<_> = policy::rules()
        .into_iter()
        .map(|r| Rule {
            id: r.id,
            title: r.title,
            description: r.description,
            level: "required".into(),
            sources: r
                .sources
                .into_iter()
                .map(|s| Source {
                    label: s.label,
                    url: s.url,
                    quote: s.quote,
                })
                .collect(),
        })
        .collect();
    rules.extend(melpazoid::advice().into_iter().map(|a| {
        Rule {
            id: a.id,
            title: a.message,
            description: String::new(),
            level: "advice".into(),
            sources: a
                .sources
                .into_iter()
                .map(|(line, quote)| Source {
                    label: "melpazoid.el".into(),
                    url: format!(
                        "https://github.com/riscy/melpazoid/blob/{}/melpazoid/melpazoid.el#L{line}",
                        melpazoid::COMMIT
                    ),
                    quote,
                })
                .collect(),
        }
    }));
    let errors = results.values().filter(|r| r.error.is_some()).count();
    println!(
        "Packages: {}; errors: {errors}; cached: {reused}; downloaded: {}",
        results.len(),
        results.len() - reused
    );
    for rule in &rules {
        let checked = results
            .values()
            .filter(|r| r.error.is_none() && !r.skipped.contains(&rule.id))
            .count();
        let passed = results
            .values()
            .filter(|r| {
                r.error.is_none() && !r.skipped.contains(&rule.id) && !r.failed.contains(&rule.id)
            })
            .count();
        println!(
            "{}: {passed}/{checked} ({:.2}%)",
            rule.id,
            if checked == 0 {
                0.0
            } else {
                passed as f64 / checked as f64 * 100.0
            }
        );
    }
    let report = Report {
        version: RULE_SET_VERSION,
        generated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        rules,
        results,
    };
    if let Some(parent) = args.output.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&args.output, serde_json::to_vec(&report)?)?;
    println!(
        "Output: {} ({} bytes)",
        args.output.display(),
        std::fs::metadata(&args.output)?.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn package() -> Package {
        Package {
            key: "melpa/sample".into(),
            name: "sample".into(),
            version: "1.0".into(),
            url: "http://127.0.0.1:1/unreachable".into(),
            kind: "single".into(),
        }
    }

    fn server(status: &str, text: &str) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let response = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nETag: sample-head\r\nConnection: close\r\n\r\n{text}", text.len());
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            stream.read(&mut request).unwrap();
            stream.write_all(response.as_bytes()).unwrap();
        });
        (url, handle)
    }

    #[tokio::test]
    async fn cache_hit_needs_no_package_request() {
        let client = reqwest::Client::new();
        let old = Check {
            version: "1.0".into(),
            failed: vec![],
            skipped: vec![],
            error: None,
        };
        let (_, hit) = check(&client, &package(), Some(&old), false).await.unwrap();
        assert!(hit);
        assert!(check(&client, &package(), Some(&old), true).await.is_err());
        let stale = Check {
            version: "0.9".into(),
            ..old.clone()
        };
        assert!(check(&client, &package(), Some(&stale), false)
            .await
            .is_err());
        let error = Check {
            error: Some("network".into()),
            ..old
        };
        assert!(check(&client, &package(), Some(&error), false)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn download_evaluates_fixture_and_errors_propagate() {
        let client = reqwest::Client::new();
        for (status, text, success) in [
            ("200 OK", include_str!("../tests/fixtures/sample.el"), true),
            ("200 OK", "(", false),
            ("404 Not Found", "missing", false),
        ] {
            let (url, handle) = server(status, text);
            let result = check(&client, &Package { url, ..package() }, None, false).await;
            handle.join().unwrap();
            assert_eq!(result.is_ok(), success);
            if let Ok((result, hit)) = result {
                assert!(!hit);
                assert!(result.failed.is_empty());
            }
        }
    }

    #[tokio::test]
    async fn github_etag_validates_cache_without_get() {
        let (url, handle) = server("200 OK", "");
        let old = Check {
            version: "sample-head".into(),
            failed: vec![],
            skipped: vec![],
            error: None,
        };
        let (_, hit) = check(
            &reqwest::Client::new(),
            &Package {
                url,
                kind: "github".into(),
                ..package()
            },
            Some(&old),
            false,
        )
        .await
        .unwrap();
        handle.join().unwrap();
        assert!(hit);
    }

    #[test]
    fn compact_sorted_json_and_optional_error() {
        let report = Report {
            version: RULE_SET_VERSION,
            generated_at: "now".into(),
            rules: vec![],
            results: BTreeMap::from([
                (
                    "z".into(),
                    Check {
                        version: "1".into(),
                        failed: vec![],
                        skipped: vec![],
                        error: Some("failed".into()),
                    },
                ),
                (
                    "a".into(),
                    Check {
                        version: "1".into(),
                        failed: vec!["lexical-binding".into()],
                        skipped: vec![],
                        error: None,
                    },
                ),
            ]),
        };
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.find("\"a\"").unwrap() < json.find("\"z\"").unwrap());
        assert_eq!(json.matches("\"error\"").count(), 1);
        assert!(!json.contains('\n'));
        let decoded: Report = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.results.len(), 2);
    }
}
