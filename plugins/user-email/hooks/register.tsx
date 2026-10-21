import type { Register } from 'claude-code'

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    try {
      const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (await $.env.get('HOME'))
      const { oauthAccount } = JSON.parse(await $.fs.read(`${dir}/.claude.json`))
      const email = oauthAccount?.emailAddress

      if (!email) {
        return beneath
      }

      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column" alignItems="flex-end">
          {beneath}
          <Text dimColor>{email}</Text>
        </Box>
      )
    } catch {
      return beneath
    }
  })
}
