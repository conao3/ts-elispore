import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { once } from "node:events"
import path from "node:path"
const scratch = path.resolve(".claude-dev/scratch")
await mkdir(scratch, { recursive: true })
const dist = path.resolve("dist")
let checksMode = "ready"
let releaseChecks
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
    if (pathname === "/checks.json") {
      if (checksMode === "delayed")
        await new Promise((resolve) => {
          releaseChecks = resolve
        })
      if (checksMode === "invalid") {
        res.setHeader("Content-Type", "application/json")
        res.end('{"version":"invalid"}')
        return
      }
    }
    const file = path.resolve(
      dist,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    )
    if (!file.startsWith(dist + path.sep)) throw Error("Invalid path")
    const body = await readFile(file)
    res.setHeader(
      "Content-Type",
      file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".json")
              ? "application/json"
              : "application/octet-stream",
    )
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end("Not found")
  }
}).listen(0, "127.0.0.1")
await once(server, "listening")
const origin = process.argv[2] ?? `http://127.0.0.1:${server.address().port}`
const profile = await mkdtemp(path.join(scratch, "browser-"))
const browser = spawn(
  "chromium",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
)
const exited = once(browser, "exit")
let socket
try {
  let tab
  for (let i = 0; i < 100; i++) {
    try {
      const port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]
      tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(
        (t) => t.type === "page",
      )
      if (tab) break
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.ok(tab)
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await once(socket, "open")
  let id = 0
  const pending = new Map(),
    errors = []
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data)
    if (m.id) {
      pending.get(m.id)?.(m)
      pending.delete(m.id)
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails)
  })
  async function send(method, params = {}) {
    const n = ++id
    const r = await new Promise((resolve) => {
      pending.set(n, resolve)
      socket.send(JSON.stringify({ id: n, method, params }))
    })
    assert.equal(r.error, undefined, JSON.stringify(r.error))
    return r.result
  }
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  async function settle() {
    await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
  }
  async function key(key, code, windowsVirtualKeyCode) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode })
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode })
    await settle()
  }
  async function click(selector) {
    const point = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    )
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point })
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    })
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    })
    await settle()
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw Error("Timed out: " + expression)
  }
  async function edit(value) {
    await evaluate(
      `(()=>{const q=document.querySelector('#query');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(q,${JSON.stringify(value)});q.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    )
    await settle()
  }
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send("Page.navigate", { url: origin + "/?q=license:mit" })
  const licenseSelector = ".license-group input[type=checkbox]"
  const mitLicense = '.license-group input[value="mit"]'
  await waitFor(`document.querySelectorAll('${licenseSelector}').length > 1`)
  assert.equal(await evaluate(`document.querySelector('${mitLicense}').checked`), true)
  const otherLicense = await evaluate(
    `Array.from(document.querySelectorAll(${JSON.stringify(licenseSelector)})).find(e=>e.value!=='mit').value`,
  )
  await click(`.license-group label:has(input[value="${otherLicense}"])`)
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(licenseSelector)})).filter(e=>e.checked).map(e=>e.value).sort()`,
    ),
    ["mit", otherLicense].sort((a, b) => a.localeCompare(b)),
  )
  const combinedQuery = await evaluate("new URL(location.href).searchParams.get('q')")
  assert.ok(
    combinedQuery.includes("license:mit") && combinedQuery.includes(`license:${otherLicense}`),
  )
  const catalog = JSON.parse(await readFile(path.join(dist, "catalog.json"), "utf8"))
  const expected = catalog.entries.filter((e) =>
    ["mit", otherLicense].some((value) =>
      [value, `${value}-only`, `${value}-or-later`].includes(e.license?.toLowerCase()),
    ),
  ).length
  assert.equal(
    await evaluate("document.querySelector('#count').textContent"),
    `${expected.toLocaleString()} packages`,
  )
  const licenseScreenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(
    path.join(scratch, "license-multiselect.png"),
    Buffer.from(licenseScreenshot.data, "base64"),
  )
  await send("Page.enable")
  const reloaded = new Promise((resolve) => {
    const listener = (event) => {
      if (JSON.parse(event.data).method === "Page.loadEventFired") {
        socket.removeEventListener("message", listener)
        resolve()
      }
    }
    socket.addEventListener("message", listener)
  })
  await send("Page.reload")
  await reloaded
  await waitFor(`document.querySelectorAll('${licenseSelector}:checked').length===2`)
  await evaluate(`document.querySelector('${mitLicense}').focus()`)
  await settle()
  assert.equal(await evaluate(`document.activeElement.matches('${mitLicense}')`), true)
  await key(" ", "Space", 32)
  assert.equal(await evaluate(`document.querySelector('${mitLicense}').checked`), false)
  await click(`.license-group label:has(input[value="${otherLicense}"])`)
  assert.equal(await evaluate("new URL(location.href).searchParams.has('q')"), false)
  assert.equal(
    await evaluate("document.querySelector('#count').textContent"),
    `${catalog.entries.length.toLocaleString()} packages`,
  )
  console.log(
    "License checks passed: legacy URL, pointer and keyboard multiselect, OR results, URL reload, and clearing all licenses.",
  )
  await send("Page.navigate", { url: origin + "/?q=repo:agda/agda%20annotation" })
  await waitFor(
    `document.querySelector('.package[data-name="agda/agda"]') && document.querySelector('#count').textContent==='1 package'`,
  )
  await click('.package[data-name="agda/agda"] .repo-trigger')
  const melpaOptions = ':vc (:url "https://github.com/agda/agda" :lisp-dir "src/data/emacs-mode")'
  assert.equal(
    await evaluate("document.querySelector('code').textContent"),
    `(leaf annotation\n  ${melpaOptions})`,
  )
  const melpa = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(
    path.join(scratch, "melpa-catalog-preview.png"),
    Buffer.from(melpa.data, "base64"),
  )
  await evaluate(
    `Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text=>{window.copiedSnippet=text}}})`,
  )
  for (const format of ["leaf", "use-package"]) {
    await click(`.snippet-switch button:${format === "leaf" ? "first" : "last"}-child`)
    await click(".copy")
    assert.deepEqual(
      await evaluate("[document.querySelector('code').textContent, window.copiedSnippet]"),
      [`(${format} annotation\n  ${melpaOptions})`, `(${format} annotation\n  ${melpaOptions})`],
    )
  }
  await edit("repo:agda/agda eri")
  assert.equal(
    await evaluate("document.querySelector('code').textContent"),
    `(use-package eri\n  ${melpaOptions})`,
  )
  assert.equal(await evaluate("document.querySelector('.copy').textContent"), "Copy")
  console.log(
    "Browser displayed and copied both MELPA snippet formats and switched from annotation to eri.",
  )
  await send("Page.navigate", { url: origin + "/?q=2048-game" })
  await waitFor(`document.querySelector('.prefix-status')?.textContent.includes('is in use')`)
  await click(".prefix-status button")
  assert.match(
    await evaluate("document.querySelector('.prefix-status li').textContent"),
    /2048-game.*MELPA/,
  )
  await key(" ", "Space", 32)
  const prefixExpanded =
    "document.querySelector('.prefix-status button').getAttribute('aria-expanded')"
  assert.equal(await evaluate(prefixExpanded), "false")
  await key(" ", "Space", 32)
  assert.equal(await evaluate(prefixExpanded), "true")
  assert.match(
    await evaluate("document.querySelector('.prefix-status li').textContent"),
    /2048-game.*MELPA/,
  )
  await click('.package[data-name="2048-game"] .repo-trigger')
  const disabled = '.package[data-name="2048-game"] .code-block'
  assert.equal(
    await evaluate(`document.querySelector('${disabled} pre').getAttribute('aria-disabled')`),
    "true",
  )
  assert.equal(
    await evaluate(`document.querySelector('${disabled} pre').getAttribute('aria-label')`),
    "Installation code",
  )
  assert.match(
    await evaluate(`document.querySelector('${disabled} code').textContent`),
    /hg.*requires Git/,
  )
  await evaluate(
    `Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text=>{window.copiedSnippet=text}}})`,
  )
  await click(`${disabled} .copy`)
  assert.equal(await evaluate("window.copiedSnippet ?? null"), null)
  await evaluate(`document.querySelector('${disabled} .snippet-switch button:last-child').focus()`)
  await key("Tab", "Tab", 9)
  assert.equal(
    await evaluate(`document.activeElement.matches('${disabled} .copy, ${disabled} pre')`),
    false,
  )
  const archivesScreenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(
    path.join(scratch, "elispore-archive-prefix.png"),
    Buffer.from(archivesScreenshot.data, "base64"),
  )
  await click('label:has(input[value="gnu-elpa"])')
  assert.match(await evaluate("new URL(location.href).searchParams.get('q')"), /source:gnu-elpa/)
  assert.match(await evaluate("document.querySelector('.prefix-status').textContent"), /is in use/)
  await edit("elispore-unassigned-prefix-browser-test")
  assert.match(
    await evaluate("document.querySelector('.prefix-status').textContent"),
    /is free in this catalog/,
  )
  await edit("ada-mode -archived:true -user:ada-mode")
  await waitFor(`Boolean(document.querySelector('.package[data-name="ada-mode"]'))`)
  await click('.package[data-name="ada-mode"] .repo-trigger')
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelector('.package[data-name="ada-mode"] .metadata').querySelectorAll('dd')).slice(2,4).map(e=>e.textContent)`,
    ),
    ["Not available", "Not available"],
  )
  await click(".method-switch button:last-child")
  assert.equal(
    await evaluate("document.querySelector('.code-block code').textContent"),
    "(leaf ada-mode\n  :ensure t)",
  )
  console.log(
    "Archive checks passed: global prefix status, source filter, disabled copy by pointer and keyboard, and ELPA :ensure.",
  )
  await send("Page.navigate", { url: origin + "/?q=repo:minad/vertico" })
  await waitFor(
    `document.querySelector('.package') && document.querySelector('#count').textContent==='1 package'`,
  )
  await settle()
  assert.equal(
    await evaluate(
      `document.body.textContent.includes('PROTOTYPE')||document.body.textContent.includes('Round 02')||document.body.textContent.includes('Compare designs')`,
    ),
    false,
  )
  assert.equal(
    await evaluate(
      `(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.repo-name'));const s=getSelection();s.removeAllRanges();s.addRange(r);const text=s.toString();s.removeAllRanges();return text})()`,
    ),
    "minad/vertico",
  )
  assert.equal(
    await evaluate(`document.querySelector('.avatar-link img').getAttribute('src')`),
    "https://github.com/minad.png?size=80",
  )
  await evaluate(`document.querySelector('[data-owner=minad]').click()`)
  await settle()
  assert.ok(await evaluate(`document.querySelector('#query').value.includes('user:minad')`))
  assert.equal(
    await evaluate(`document.querySelector('.package').hasAttribute('data-expanded')`),
    false,
  )
  await edit("user:minad")
  await waitFor(`document.querySelectorAll('.package').length>1`)
  const measure = () =>
    evaluate(
      `(()=>{const s=document.querySelector('.package > .package-row'),r=s.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    )
  const before = await measure()
  for (const expected of [true, false, true]) {
    await evaluate(`document.querySelector('.package > .package-row').click()`)
    await settle()
    assert.equal(
      await evaluate(`document.querySelector('.package').hasAttribute('data-expanded')`),
      expected,
    )
    if (expected) {
      const rotation = await evaluate(
        `(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.chevron')).transform);return [m.a,m.b,m.c,m.d]})()`,
      )
      assert.ok(rotation.every((value, i) => Math.abs(value - [-1, 0, 0, -1][i]) < 0.001))
    }
    const after = await measure()
    for (const key of Object.keys(before))
      assert.ok(Math.abs(before[key] - after[key]) < 0.01, `${key} changed on toggle`)
  }
  await evaluate(`document.querySelectorAll('.package > .package-row')[1].click()`)
  await settle()
  assert.equal(await evaluate(`document.querySelectorAll('.package[data-expanded]').length`), 2)
  await edit("repo:minad/consult")
  await evaluate(`document.querySelector('.package > .package-row').click()`)
  await settle()
  const topic = await evaluate(`document.querySelector('.package .topic').dataset.topic`)
  await click(".package .topic")
  assert.ok(
    await evaluate(
      `document.querySelector('#query').value.includes(${JSON.stringify("topic:")} + ${JSON.stringify(topic)})`,
    ),
  )
  assert.equal(await evaluate(`document.querySelectorAll('.package[data-expanded]').length`), 1)
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll('.category')].find(b=>b.textContent.startsWith(${JSON.stringify(topic.charAt(0).toUpperCase() + topic.slice(1).replaceAll("-", " "))})).getAttribute('aria-pressed')`,
    ),
    "true",
  )
  await edit("repo:minad/consult")
  await evaluate(`document.querySelector('.package .topic').focus()`)
  await key("Enter", "Enter", 13)
  assert.ok(
    await evaluate(
      `document.querySelector('#query').value.includes(${JSON.stringify("topic:" + topic)})`,
    ),
  )
  assert.equal(await evaluate(`document.querySelectorAll('.package[data-expanded]').length`), 1)
  const topicsImage = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(path.join(scratch, "topics-desktop.png"), Buffer.from(topicsImage.data, "base64"))
  await edit("user:minad")
  await click('[data-category="Org mode"]')
  await settle()
  assert.ok(await evaluate(`document.querySelector('#query').value.includes('topic:org-mode')`))
  await edit("user:minad stars:>=1500")
  assert.equal(
    await evaluate(
      `document.querySelector('[data-category="All packages"]').getAttribute('aria-pressed')`,
    ),
    "true",
  )
  await edit("nonsense:unknown")
  assert.equal(
    await evaluate(`document.querySelector('#query').getAttribute('aria-invalid')`),
    "true",
  )
  await edit("repo:minad/vertico")
  await evaluate(`document.querySelector('.package > .package-row').click()`)
  await settle()
  if (!(await evaluate("document.querySelector('.package').hasAttribute('data-expanded')")))
    await evaluate("document.querySelector('.package > .package-row').click()")
  await settle()
  await waitFor("document.querySelector('.avatar-link img').naturalWidth > 0")
  await evaluate(`document.querySelector('.requirements > button').click()`)
  await settle()
  assert.equal(
    await evaluate(`document.querySelector('.requirements').hasAttribute('data-expanded')`),
    true,
  )
  assert.equal(
    await evaluate(`document.querySelector('.package').hasAttribute('data-expanded')`),
    true,
  )
  await evaluate(`document.querySelector('.requirements > button').click()`)
  await settle()
  assert.equal(
    await evaluate("document.querySelector('code').textContent"),
    '(leaf vertico\n  :vc (:url "https://github.com/minad/vertico"))',
  )
  assert.equal(
    await evaluate(
      `String(document.querySelector('.snippet-switch button').hasAttribute('data-selected'))`,
    ),
    "true",
  )
  const snippetRow = await measure()
  await evaluate(`document.querySelector('.snippet-switch button').focus()`)
  await key("ArrowRight", "ArrowRight", 39)
  await key(" ", "Space", 32)
  await settle()
  const selectedCode = '(use-package vertico\n  :vc (:url "https://github.com/minad/vertico"))'
  assert.equal(await evaluate("document.querySelector('code').textContent"), selectedCode)
  assert.equal(
    await evaluate(
      `String(document.querySelectorAll('.snippet-switch button')[1].hasAttribute('data-selected'))`,
    ),
    "true",
  )
  assert.equal(
    await evaluate(`document.querySelector('.package').hasAttribute('data-expanded')`),
    true,
  )
  assert.deepEqual(await measure(), snippetRow)
  await evaluate(
    `Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text=>{window.copiedSnippet=text}}}); document.querySelector('.copy').click()`,
  )
  await settle()
  assert.equal(await evaluate("window.copiedSnippet"), selectedCode)
  assert.equal(await evaluate(`document.querySelector('.copy').textContent`), "Copied")
  await evaluate(`document.querySelector('.snippet-switch button').click()`)
  await settle()
  assert.ok(await evaluate(`document.querySelector('code').textContent.startsWith('(leaf ')`))
  assert.equal(await evaluate(`document.querySelector('.copy').textContent`), "Copy")
  await click("#sort")
  await waitFor(`Boolean(document.querySelector('[role=listbox]'))`)
  await key("End", "End", 35)
  await key("Enter", "Enter", 13)
  assert.ok(await evaluate(`document.querySelector('#sort').textContent.includes('Name A–Z')`))
  assert.equal(await evaluate(`document.activeElement.id`), "sort")
  await click("#sort")
  await key("Escape", "Escape", 27)
  assert.equal(await evaluate(`document.querySelector('[role=listbox]')`), null)
  await click("fieldset .check .checkbox-mark")
  assert.ok(await evaluate(`document.querySelector('#query').value.includes('pushed:')`))
  await edit("repo:minad/vertico")
  await evaluate(`document.querySelector('.repo-trigger').focus()`)
  await key("Enter", "Enter", 13)
  assert.equal(
    await evaluate(`document.querySelector('.package').hasAttribute('data-expanded')`),
    false,
  )
  await key("Enter", "Enter", 13)
  assert.equal(
    await evaluate(`document.querySelector('.package').hasAttribute('data-expanded')`),
    true,
  )
  await waitFor(`Boolean(document.querySelector('.check-score'))`)
  assert.match(
    await evaluate(`document.querySelector('.check-score').getAttribute('aria-label')`),
    /^\d+ of 14 package checks pass$/,
  )
  assert.equal(
    await evaluate(`document.querySelector('.package-checks h3').textContent`),
    "Package checks",
  )
  assert.ok(await evaluate(`document.querySelectorAll('.check-rules li').length >= 14`))
  assert.ok(
    await evaluate(`document.querySelector('.checked-version').textContent.startsWith('Version ')`),
  )
  const screens = "/home/ubuntu/screens"
  await mkdir(screens, { recursive: true })
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  })
  await evaluate(`window.scrollTo(0,0)`)
  await settle()
  const checksDesktop = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(
    path.join(screens, "elispore-checks-light.png"),
    Buffer.from(checksDesktop.data, "base64"),
  )
  const image = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(path.join(scratch, "production-desktop.png"), Buffer.from(image.data, "base64"))
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await settle()
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=390`))
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('aside')).display`), "none")
  assert.ok(
    await evaluate(
      `Boolean(document.querySelector('.check-score')) && Boolean(document.querySelector('.package-checks'))`,
    ),
  )
  await evaluate(
    `window.scrollTo(0, document.querySelector('.package-row').getBoundingClientRect().top + window.scrollY - 70)`,
  )
  await settle()
  const checksMobile = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(
    path.join(screens, "elispore-checks-mobile.png"),
    Buffer.from(checksMobile.data, "base64"),
  )
  await click("#mobile-filter")
  await settle()
  assert.equal(
    await evaluate(`document.querySelector('#mobile-filter').getAttribute('aria-expanded')`),
    "true",
  )
  assert.ok(
    await evaluate(
      `Boolean(document.querySelector('[role=dialog][aria-label="Package filters"]'))`,
    ),
  )
  await click('[role=dialog] [data-category="Themes"]')
  assert.ok(await evaluate(`document.querySelector('#query').value.includes('topic:theme')`))
  await key("Escape", "Escape", 27)
  assert.equal(await evaluate(`document.querySelector('[role=dialog]')`), null)
  assert.equal(await evaluate(`document.activeElement.id`), "mobile-filter")
  await edit("repo:minad/vertico")
  await click("#mobile-filter")
  await click(".show-results")
  await settle()
  await evaluate(
    `document.querySelectorAll('.snippet-switch button')[1].click(); document.querySelector('.code-block').scrollIntoView({block:'center'})`,
  )
  await settle()
  assert.equal(await evaluate("document.querySelector('code').textContent"), selectedCode)
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=390`))
  const mobile = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  })
  await writeFile(path.join(scratch, "production-mobile.png"), Buffer.from(mobile.data, "base64"))
  const shots = "/home/ubuntu/shots"
  await mkdir(shots, { recursive: true })
  async function screenshot(name) {
    const result = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    })
    await writeFile(path.join(shots, name + ".png"), Buffer.from(result.data, "base64"))
  }
  await evaluate("window.scrollTo(0,0)")
  await settle()
  await screenshot("elispore-header-mobile")
  await click(".add-recipe")
  await waitFor(`document.querySelector('#why-elispore') && location.pathname==='/about/'`)
  await waitFor(`document.querySelectorAll('.about-check-rules dt').length===14`)
  assert.equal(await evaluate("document.querySelector('h1').textContent"), "Add recipe")
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"))
  assert.ok(
    await evaluate(`document.querySelector('.about-page').textContent.includes('up to 200')`),
  )
  await screenshot("elispore-about-mobile")
  await click(".back-link")
  await waitFor(`Boolean(document.querySelector('#query'))`)
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  })
  await settle()
  await screenshot("elispore-header-desktop")
  await evaluate("document.querySelector('.add-recipe').focus()")
  await key("Enter", "Enter", 13)
  await waitFor(`Boolean(document.querySelector('#why-elispore'))`)
  await screenshot("elispore-about-light")
  await send("Page.navigate", { url: origin + "/about/" })
  await waitFor(`Boolean(document.querySelector('#why-elispore'))`)
  assert.equal(
    await evaluate(`document.querySelector('.add-recipe').getAttribute('aria-current')`),
    "page",
  )
  assert.equal(
    await evaluate(
      `document.querySelector('a[href="https://github.com/melpa/melpa/blob/master/CONTRIBUTING.org#using-ai"]').textContent`,
    ),
    "MELPA’s AI guidelines",
  )
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  })
  await settle()
  await screenshot("elispore-about-dark")
  const report = JSON.parse(await readFile(path.join(dist, "checks.json"), "utf8"))
  const failedEntry = catalog.entries.find(
    (entry) =>
      entry.sources?.length === 1 &&
      entry.sources[0] === "github" &&
      report.results[`github/${entry.name}`]?.error,
  )
  assert.ok(failedEntry)
  await send("Page.navigate", {
    url: origin + "/?q=" + encodeURIComponent(`repo:${failedEntry.name}`),
  })
  await waitFor(`Boolean(document.querySelector('.repo-trigger'))`)
  await click(".repo-trigger")
  await waitFor(`Boolean(document.querySelector('.check-error'))`)
  assert.match(
    await evaluate(`document.querySelector('.check-error').textContent`),
    /Could not run checks:/,
  )
  assert.equal(await evaluate(`document.querySelector('.check-score')`), null)
  checksMode = "delayed"
  await send("Page.navigate", { url: origin + "/?q=repo:minad/vertico" })
  await waitFor(`Boolean(document.querySelector('.repo-trigger'))`)
  assert.equal(await evaluate(`document.querySelector('.check-score')`), null)
  const uncheckedRow = await measure()
  assert.ok(releaseChecks)
  releaseChecks()
  await waitFor(`Boolean(document.querySelector('.check-score'))`)
  assert.deepEqual(await measure(), uncheckedRow)
  checksMode = "invalid"
  await send("Page.navigate", { url: origin + "/?q=repo:minad/vertico" })
  await waitFor(`Boolean(document.querySelector('.repo-trigger'))`)
  await settle()
  assert.equal(await evaluate(`document.querySelector('.check-score')`), null)
  assert.deepEqual(errors, [])
  console.log(
    "Package checks passed: accessible score, all rules, versions, about rule list, error results, nonblocking delayed load with stable rows, and invalid report fallback.",
  )
  console.log(
    "Browser checks passed: production chrome, repository copy, avatars, owner/topic query sync, accordion stability, multiple expansion, errors, mobile filters, Add recipe pointer/keyboard navigation, direct about load, and light/dark screenshots.",
  )
} finally {
  socket?.close()
  browser.kill("SIGTERM")
  await exited
  await new Promise((resolve) => server.close(resolve))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
