#!/usr/bin/env node
// Builds the Session Board page from ~/.claude/session-board/*.json (written by the session-board mod).
// Usage: session-board.mjs [--out <file>]   Prints the output path.
// SESSION_BOARD_LABELS=a,b shows a chip on PRs that carry those labels.
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const DIR = process.env.SESSION_BOARD_DIR ?? join(homedir(), '.claude', 'session-board')
const LABELS = (process.env.SESSION_BOARD_LABELS ?? '').split(',').map(l => l.trim()).filter(Boolean)
const STALE_MS = 12 * 60 * 60 * 1000
const HIDDEN_TITLE = 'Session board'
const ORDER = { waiting: 0, active: 1, idle: 2 }
const PR_REF = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/
const THREADS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved isOutdated}}}}}'
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

const outIdx = process.argv.indexOf('--out')
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : join(DIR, 'board.html')

const esc = text =>
  String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const isAlive = pid => {
  if (!pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const readRows = async now => {
  const names = await readdir(DIR).catch(() => [])
  const rows = []
  for (const name of names.filter(n => n.endsWith('.json'))) {
    try {
      const row = JSON.parse(await readFile(join(DIR, name), 'utf8'))
      if (typeof row.sessionId !== 'string') continue
      if (row.title === HIDDEN_TITLE || !isAlive(row.pid)) continue
      if (row.state !== 'waiting' && now - row.updatedAt > STALE_MS) continue
      rows.push(row)
    } catch {
      continue
    }
  }
  return rows.sort(
    (a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || (a.state === 'waiting' ? a.stateSince - b.stateSince : b.updatedAt - a.updatedAt),
  )
}

const gh = async args => (await run('gh', args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout

const ciOf = rollup => {
  if (!rollup?.length) return 'none'
  if (rollup.some(c => FAILED.has(c.conclusion) || FAILED.has(c.state))) return 'fail'
  if (rollup.some(c => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING' || c.state === 'EXPECTED')) return 'pending'
  return 'pass'
}

const fetchPr = async url => {
  const match = PR_REF.exec(url)
  if (!match) return { url, error: true }
  const [, owner, name, number] = match
  const repo = `${owner}/${name}`
  try {
    const [view, threads] = await Promise.all([
      gh(['pr', 'view', number, '-R', repo, '--json', 'title,state,isDraft,reviewDecision,labels,statusCheckRollup']),
      gh(['api', 'graphql', '-f', `query=${THREADS_QUERY}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${number}`]),
    ])
    const pr = JSON.parse(view)
    const nodes = JSON.parse(threads).data.repository.pullRequest.reviewThreads.nodes
    return {
      url,
      ref: `${name}#${number}`,
      title: pr.title,
      state: pr.state,
      isDraft: pr.isDraft,
      review: pr.reviewDecision || '',
      ci: ciOf(pr.statusCheckRollup),
      labels: pr.labels.map(l => l.name).filter(n => LABELS.includes(n)),
      openThreads: nodes.filter(n => !n.isResolved && !n.isOutdated).length,
    }
  } catch {
    return { url, ref: `${name}#${number}`, error: true }
  }
}

const mapPool = async (items, size, fn) => {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const age = ms => {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 1) return 'now'
  if (min < 60) return `${min} min`
  const hours = Math.floor(min / 60)
  return hours < 24 ? `${hours} h ${min % 60} min` : `${Math.floor(hours / 24)} d`
}

const REVIEW = { APPROVED: ['ok', 'Approved'], CHANGES_REQUESTED: ['bad', 'Changes requested'], REVIEW_REQUIRED: ['warn', 'Review needed'] }
const CI = { pass: ['ok', 'CI pass'], fail: ['bad', 'CI failing'], pending: ['warn', 'CI running'], none: ['mute', 'No CI'] }

const chip = (kind, text) => `<span class="chip ${kind}">${esc(text)}</span>`

const prHtml = pr => {
  const href = PR_REF.test(pr.url) ? ` href="${esc(pr.url)}" target="_blank" rel="noopener"` : ''
  const ref = `<a class="ref"${href}>${esc(pr.ref ?? pr.url)}</a>`
  if (pr.error) return `<li class="pr">${ref}${chip('mute', 'status unavailable')}</li>`
  if (pr.state !== 'OPEN') return `<li class="pr done">${ref}<span class="ptitle">${esc(pr.title)}</span>${chip('mute', pr.state.toLowerCase())}</li>`
  const [rk, rt] = REVIEW[pr.review] ?? ['mute', 'No review yet']
  const [ck, ct] = CI[pr.ci]
  const chips = [
    pr.isDraft ? chip('mute', 'Draft') : '',
    chip(ck, ct),
    chip(rk, rt),
    pr.openThreads ? chip('warn', `${pr.openThreads} open ${pr.openThreads === 1 ? 'thread' : 'threads'}`) : '',
    ...pr.labels.map(l => chip('ok', l)),
  ].join('')
  return `<li class="pr">${ref}<span class="ptitle">${esc(pr.title)}</span><span class="chips">${chips}</span></li>`
}

const field = (label, value, guess) =>
  value ? `<p class="field"><span class="label">${label}</span><span class="${guess ? 'guess' : ''}">${esc(value)}</span></p>` : ''

const MAX_DEPTH = 3

const subsHtml = (subs, parent, depth) => {
  const kids = subs.filter(s => (s.parentId && subs.some(p => p.id === s.parentId) ? s.parentId : undefined) === parent)
  if (!kids.length) return ''
  const items = kids.map(s => {
    const task = s.lastTask ? `<span class="subtask">${esc(s.lastTask)}</span>` : ''
    return `<li><span class="dot ${s.state === 'active' ? 'active' : 'idle'}"></span><span class="subname">${esc(s.name || 'subagent')}</span>${task}${depth < MAX_DEPTH ? subsHtml(subs, s.id, depth + 1) : ''}</li>`
  })
  return `<ul class="subs">${items.join('')}</ul>`
}

const rowHtml = (row, prs, now) => {
  const title = row.title || basename(row.cwd)
  const waitingFor = row.waitingFor || row.guess?.waitingFor
  const state = row.state in ORDER ? row.state : 'idle'
  const stateText = { waiting: 'Waiting for you', active: 'Working', idle: 'Idle' }[state]
  return `<article class="session ${state}">
  <div class="head"><span class="pill ${state}">${stateText}</span><span class="since">${age(now - row.stateSince)}</span><h2>${esc(title)}</h2></div>
  ${waitingFor ? `<p class="ask ${row.waitingFor ? '' : 'guess'}">${esc(waitingFor)}</p>` : ''}
  ${field('Goal', row.goal || row.guess?.goal, !row.goal)}
  ${field('Last task', row.lastTask || row.guess?.lastTask, !row.lastTask)}
  <p class="where"><code>${esc(basename(row.cwd))}</code>${row.branch ? `<code class="branch">${esc(row.branch)}</code>` : ''}</p>
  ${subsHtml(row.subs ?? [], undefined, 1)}
  ${prs.length ? `<ul class="prs">${prs.map(prHtml).join('')}</ul>` : ''}
</article>`
}

const CSS = `
:root{--bg:#f5f6f8;--surface:#fff;--fg:#1b2230;--mute:#5d6778;--line:#dde1e8;--ok:#1a7f4b;--ok-bg:#e3f4ea;--warn:#8a5a00;--warn-bg:#fdf0d5;--bad:#b3261e;--bad-bg:#fbe4e2;--accent:#2f5bd8;--stripe-active:#1a7f4b;--stripe-idle:#aab2c0;--stripe-waiting:#d98a00;--sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12161d;--surface:#1b212b;--fg:#e6e9ef;--mute:#9aa4b5;--line:#2c3441;--ok:#5fcf93;--ok-bg:#16301f;--warn:#f0b955;--warn-bg:#352a10;--bad:#ff8c84;--bad-bg:#3a1b19;--accent:#8aa7ff;--stripe-active:#5fcf93;--stripe-idle:#5b6578;--stripe-waiting:#f0b955;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12161d;--surface:#1b212b;--fg:#e6e9ef;--mute:#9aa4b5;--line:#2c3441;--ok:#5fcf93;--ok-bg:#16301f;--warn:#f0b955;--warn-bg:#352a10;--bad:#ff8c84;--bad-bg:#3a1b19;--accent:#8aa7ff;--stripe-active:#5fcf93;--stripe-idle:#5b6578;--stripe-waiting:#f0b955;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.45 var(--sans);padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
h1{font-size:22px;font-weight:600;margin:0}
.stamp{color:var(--mute);font-size:13px;font-variant-numeric:tabular-nums}
.summary{display:flex;flex-wrap:wrap;gap:8px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:8px 12px;min-width:0;display:flex;gap:8px;align-items:baseline}
.stat b{font-size:20px;font-variant-numeric:tabular-nums}
.stat span{color:var(--mute);font-size:13px}
.stat.hot b{color:var(--warn)}
.stat.bad b{color:var(--bad)}
.banner{background:var(--bad-bg);color:var(--bad);border-radius:6px;padding:10px 12px}
.banner code{font-family:var(--mono)}
.list{display:flex;flex-direction:column;gap:12px}
.session{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--stripe-idle);border-radius:6px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.session.active{border-left-color:var(--stripe-active)}
.session.waiting{border-left-color:var(--stripe-waiting)}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.head h2{font-size:16px;font-weight:600;margin:0;flex:1 1 200px;min-width:0;overflow-wrap:anywhere}
.pill{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
.pill.waiting{background:var(--warn-bg);color:var(--warn)}
.pill.active{background:var(--ok-bg);color:var(--ok)}
.pill.idle{background:var(--bg);color:var(--mute)}
.since{color:var(--mute);font-size:13px;font-variant-numeric:tabular-nums}
.ask{margin:0;padding:6px 10px;background:var(--warn-bg);color:var(--warn);border-radius:4px;font-weight:500;overflow-wrap:anywhere}
.field{margin:0;display:flex;gap:10px;min-width:0}
.field>span:last-child{min-width:0;overflow-wrap:anywhere}
.label{flex:0 0 72px;color:var(--mute);font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding-top:2px}
.guess{font-style:italic;color:var(--mute)}
.where{margin:0;display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--mute);font-size:12px}
code{font-family:var(--mono);overflow-wrap:anywhere;min-width:0}
.branch{color:var(--accent)}
.prs{list-style:none;margin:4px 0 0;padding:8px 0 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px}
.subs{list-style:none;margin:0;padding:0 0 0 14px;border-left:1px solid var(--line);display:flex;flex-direction:column;gap:4px;min-width:0}
.subs li{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0}
.subs .subs{flex-basis:100%}
.dot{width:8px;height:8px;border-radius:50%;background:var(--stripe-idle);flex:none}
.dot.active{background:var(--stripe-active)}
.subname{font-weight:500;font-size:14px}
.subtask{color:var(--mute);font-size:13px;overflow-wrap:anywhere;min-width:0}
.pr{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}
.pr.done{color:var(--mute)}
.ref{font-family:var(--mono);font-size:13px;color:var(--accent);text-decoration:none}
.ref:hover,.ref:focus-visible{text-decoration:underline}
.ptitle{flex:1 1 160px;min-width:0;overflow-wrap:anywhere;font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{font-size:12px;padding:1px 7px;border-radius:4px;white-space:nowrap}
.chip.ok{background:var(--ok-bg);color:var(--ok)}
.chip.warn{background:var(--warn-bg);color:var(--warn)}
.chip.bad{background:var(--bad-bg);color:var(--bad)}
.chip.mute{background:var(--bg);color:var(--mute)}
.empty{color:var(--mute);padding:24px 0}
`

const main = async () => {
  const now = Date.now()
  await mkdir(DIR, { recursive: true })
  const rows = await readRows(now)
  const isGhOk = await gh(['auth', 'status']).then(() => true, () => false)
  const urls = [...new Set(rows.flatMap(r => r.prs ?? []))]
  const fetched = isGhOk ? await mapPool(urls, 4, fetchPr) : urls.map(url => ({ url, ref: PR_REF.exec(url)?.slice(2).join('#') ?? url, error: true }))
  const byUrl = new Map(fetched.map(pr => [pr.url, pr]))
  const open = fetched.filter(pr => pr.state === 'OPEN')
  const count = state => rows.filter(r => r.state === state).length
  const time = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const stats = [
    ['Waiting for you', count('waiting'), count('waiting') ? 'hot' : ''],
    ['Working', count('active'), ''],
    ['Idle', count('idle'), ''],
    ['Subagents running', rows.reduce((n, r) => n + (r.subs ?? []).filter(s => s.state === 'active').length, 0), ''],
    ['PRs failing CI', open.filter(p => p.ci === 'fail').length, open.some(p => p.ci === 'fail') ? 'bad' : ''],
  ]
  const html = `<title>Session Board</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>${CSS}</style>
<main class="wrap">
<header><h1>Session Board</h1><span class="stamp">Updated ${time} · refreshes every 10 min</span></header>
<section class="summary">${stats.map(([label, n, kind]) => `<div class="stat ${kind}"><b>${n}</b><span>${label}</span></div>`).join('')}</section>
${isGhOk ? '' : '<div class="banner">GitHub login expired, so PR status is missing. Run <code>gh auth login</code>.</div>'}
<section class="list">${rows.length ? rows.map(r => rowHtml(r, (r.prs ?? []).map(u => byUrl.get(u)).filter(Boolean), now)).join('\n') : '<p class="empty">No sessions are reporting yet. Start a session with the session-board mod loaded.</p>'}</section>
</main>
`
  await writeFile(OUT, html)
  console.log(OUT)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
