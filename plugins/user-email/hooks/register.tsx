import type { Register } from 'claude-code'

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (await $.env.get('HOME'))
      const { oauthAccount } = JSON.parse(await $.fs.read(`${dir}/.claude.json`))
      const email = oauthAccount?.emailAddress

      if (!email) {
        return next(e)
      }

      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box justifyContent="flex-end">
          <Text dimColor>{email}</Text>
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
