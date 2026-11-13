import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { once } from "node:events"
import path from "node:path"
const scratch = path.resolve(".claude-dev/scratch")
await mkdir(scratch, { recursive: true })
const dist = path.resolve("dist")
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
    const file = path.resolve(dist, "." + (pathname === "/" ? "/index.html" : pathname))
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
  await send("Page.navigate", { url: origin + "/?q=repo:minad/vertico" })
  await waitFor(
    `document.querySelector('.package') && document.querySelector('#count').textContent==='1 repository'`,
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
  assert.equal(await evaluate(`document.querySelector('details').open`), false)
  await edit("user:minad")
  await waitFor(`document.querySelectorAll('.package').length>1`)
  const measure = () =>
    evaluate(
      `(()=>{const s=document.querySelector('summary'),r=s.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    )
  const before = await measure()
  for (const expected of [true, false, true]) {
    await evaluate(`document.querySelector('summary').click()`)
    await settle()
    assert.equal(await evaluate(`document.querySelector('details').open`), expected)
    const after = await measure()
    for (const key of Object.keys(before))
      assert.ok(Math.abs(before[key] - after[key]) < 0.01, `${key} changed on toggle`)
  }
  await evaluate(`document.querySelectorAll('summary')[1].click()`)
  await settle()
  assert.equal(await evaluate(`document.querySelectorAll('details[open]').length`), 2)
  await evaluate(`document.querySelector('[data-category=Completion]').click()`)
  await settle()
  assert.ok(await evaluate(`document.querySelector('#query').value.includes('topic:completion')`))
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
  await evaluate(`document.querySelector('summary').click()`)
  await settle()
  if (!(await evaluate("document.querySelector('details').open")))
    await evaluate("document.querySelector('summary').click()")
  await settle()
  await waitFor("document.querySelector('.avatar-link img').naturalWidth > 0")
  assert.equal(
    await evaluate("document.querySelector('code').textContent"),
    '(leaf vertico\n  :vc (:url "https://github.com/minad/vertico"))',
  )
  assert.equal(
    await evaluate(`document.querySelector('.snippet-switch button').getAttribute('aria-pressed')`),
    "true",
  )
  const snippetRow = await measure()
  await evaluate(`document.querySelectorAll('.snippet-switch button')[1].click()`)
  await settle()
  const selectedCode = '(use-package vertico\n  :vc (:url "https://github.com/minad/vertico"))'
  assert.equal(await evaluate("document.querySelector('code').textContent"), selectedCode)
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.snippet-switch button')[1].getAttribute('aria-pressed')`,
    ),
    "true",
  )
  assert.equal(await evaluate(`document.querySelector('details').open`), true)
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
  await evaluate(`document.querySelector('#mobile-filter').click()`)
  await settle()
  assert.equal(
    await evaluate(`document.querySelector('#mobile-filter').getAttribute('aria-expanded')`),
    "true",
  )
  assert.notEqual(
    await evaluate(`getComputedStyle(document.querySelector('aside')).display`),
    "none",
  )
  await evaluate(`document.querySelector('#mobile-filter').click()`)
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
  assert.deepEqual(errors, [])
  console.log(
    "Browser checks passed: production chrome, repository copy, avatars, owner/topic query sync, accordion stability, multiple expansion, errors, and mobile filters.",
  )
} finally {
  socket?.close()
  browser.kill("SIGTERM")
  await exited
  await new Promise((resolve) => server.close(resolve))
  await rm(profile, { recursive: true, force: true })
}
