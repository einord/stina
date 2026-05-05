# @stina/dev-test-extension

Internal dev-only extension for the Stina monorepo. It registers no tools,
no actions, no providers — its only purpose is to declare
`contributes.thread_hints` in its manifest so developers can visually verify
the §05 ExtensionThreadHints rendering pipeline without going through the
sibling-repo install dance.

Install with `pnpm dev:install-test-ext` from the stina root, then seed
`typical-morning` to see threads rendered with the dev-test hints (plum
bordered card + 🧪 icon + "DEV" badge).

Do not include in production builds or release artifacts.
