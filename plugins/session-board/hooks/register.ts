import type { EngineInterface as Engine, Register } from 'claude-code'

import { PR_URL, clip, fresh, merge, parse, promptGuess } from './board'
import type { Change } from './board'

const TOOL = 'mcp__session-board__board_update'

const GUIDE = [
  'Session board: a dashboard shows the person what each session is doing.',
  `Call ${TOOL} to keep it current, with fields under 120 characters:`,
  '- title (5 words) and goal (one line), as soon as the goal is clear.',
  '- lastTask (one line), after you finish each task.',
  '- waitingFor (the question, one line), right before you ask the person something.',
  'No secrets. Do not mention the call to the person.',
].join('\n')

let queue: Promise<unknown> = Promise.resolve()
let pid: number | undefined
let lastState: string | undefined

const pathOf = async ($: Engine, id: string) =>
  `${await $.env.get('HOME')}/.claude/session-board/${id}.json`

const apply = async ($: Engine, change: Change) => {
  const id = await $.session.id()
  const file = await pathOf($, id)
  const now = await $.clock.now()
  const cwd = await $.session.cwd()
  const prev = (await $.fs.read(file).then(parse, () => undefined)) ?? fresh(id, cwd, now)
  if (pid === undefined) {
    const out = await $.process.run(['sh', '-c', 'echo $PPID'])
    pid = Number(out.stdout.trim()) || undefined
  }
  let branch = prev.branch
  if (change.refresh || branch === undefined) {
    const git = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    branch = git.exitCode === 0 ? git.stdout.trim() : undefined
  }
  const next = merge(prev, { ...change, branch, pid }, now)
  await $.fs.write(file, JSON.stringify(next))
  lastState = next.state
}

const note = ($: Engine, change: Change) => {
  queue = queue.then(() => apply($, change)).catch(() => undefined)
  return queue
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'board_update',
      description:
        'Update this session on the person\'s session board: title, goal, lastTask, waitingFor. All optional, each under 120 characters.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          lastTask: { type: 'string' },
          waitingFor: { type: 'string' },
        },
      },
      isDeferred: false,
    })
    await note($, { refresh: true })
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Record<string, string | undefined>
    await note($, {
      title: clip(input.title),
      goal: clip(input.goal),
      lastTask: clip(input.lastTask),
      waitingFor: clip(input.waitingFor),
    })
    return { result: { content: [{ type: 'text', text: 'ok' }], isError: false } }
  }).catch(() => ({ deny: 'board update failed' }))

  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      await note($, { state: 'active', clearWaiting: true, refresh: true, guess: promptGuess(e.text) })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await note($, { state: 'active' })
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    if (out.agentId) {
      await note($, { sub: { id: out.agentId, parentId: e.parentAgentId, name: clip(e.description ?? e.subagentType) } })
    }
    return out
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    await note($, { dropSub: e.agent_id })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId) await note($, { touchSub: { id: e.agentId, lastTask: clip(e.tool) } })
    if (lastState === 'waiting') await note($, { state: 'active', clearWaiting: true })
    const ran = await next(e)
    if (e.tool === 'Bash' && /gh\s+pr\s+create/.test(String(e.command))) {
      const urls = JSON.stringify(ran).match(PR_URL)
      if (urls) await note($, { addPrs: urls })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await note($, { state: 'waiting', guess: { waitingFor: `permission: ${e.tool_name}` } })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (lastState !== 'idle') await note($, { state: 'waiting', guess: { waitingFor: clip(e.message) } })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    await note($, { state: 'idle', busy: !!e.background_tasks?.length })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await queue
    await $.process.run(['rm', '-f', await pathOf($, e.sessionId)])
    return next(e)
  })

  on('prompt.compose', async (_$, e, next) => {
    const out = await next(e)
    return { sections: [...out.sections, { id: 'session-board:guide', text: GUIDE, scope: 'session' }] }
  })
}
