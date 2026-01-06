# Changelog

## [0.6.5](https://github.com/einord/stina/compare/stina-v0.6.4...stina-v0.6.5) (2026-01-06)


### Bug Fixes

* continue trying to fix the electron windows build ([#63](https://github.com/einord/stina/issues/63)) ([b361f05](https://github.com/einord/stina/commit/b361f051d8f87ad94efff0042022535cd4dbf797))

## [0.6.4](https://github.com/einord/stina/compare/stina-v0.6.3...stina-v0.6.4) (2026-01-06)


### Bug Fixes

* set npm_execpath for pnpm in Electron build workflow ([#61](https://github.com/einord/stina/issues/61)) ([9b5b9a9](https://github.com/einord/stina/commit/9b5b9a99ba021dbce7d27b8ab385e273281b5f91))

## [0.6.3](https://github.com/einord/stina/compare/stina-v0.6.2...stina-v0.6.3) (2026-01-06)


### Bug Fixes

* add chat mappers path to Vite configuration and update extension API repository details ([#59](https://github.com/einord/stina/issues/59)) ([90580ef](https://github.com/einord/stina/commit/90580ef58a57d2efcd617e94238d32f424373b8d))

## [0.6.2](https://github.com/einord/stina/compare/stina-v0.6.1...stina-v0.6.2) (2026-01-06)


### Bug Fixes

* update workflows and configurations for improved ci/cd and dependency management ([#57](https://github.com/einord/stina/issues/57)) ([b7e3d24](https://github.com/einord/stina/commit/b7e3d2446e965e52683ce4ed1858287ff66d0af9))

## [0.6.1](https://github.com/einord/stina/compare/stina-v0.6.0...stina-v0.6.1) (2026-01-06)


### Bug Fixes

* Updated release scripts ([1b09e97](https://github.com/einord/stina/commit/1b09e975ae55e05effd243ea7e009962ec3e66a5))

## [0.6.0](https://github.com/einord/stina/compare/stina-v0.5.0...stina-v0.6.0) (2026-01-06)


### Features

* Add AddServerForm and ToolServerCard components; enhance ToolsView for better server management ([1923edf](https://github.com/einord/stina/commit/1923edfbfd59a22ca54f0800d8278e4044aabef1))
* Add advanced settings component for debug mode configuration and enhance IPC for debug features ([9fe66de](https://github.com/einord/stina/commit/9fe66dea5419273b1c570b587079d8cac23014ea))
* add chat icon button to SideNav component ([f21a6a0](https://github.com/einord/stina/commit/f21a6a0223b139e44b82b64fda3f027f11684374))
* add core, crypto, mcp, and settings packages with initial implementations ([b65d673](https://github.com/einord/stina/commit/b65d67350d3ef1aba9959f76b6b5699e1cfac2b0))
* Add documentation comments to core functions and providers ([2340b66](https://github.com/einord/stina/commit/2340b660d6544f5389c76fce855a76aee955fea4))
* add functionality to manage todo panel visibility state with IPC integration ([cfb04e5](https://github.com/einord/stina/commit/cfb04e5da42cbb4eebdb159473dbc9398f41a855))
* add functionality to manage todo panel width with IPC integration ([4a85d4b](https://github.com/einord/stina/commit/4a85d4b3c7f72b2b3644f31539c7ed59edd06d92))
* add icon and avatar generation script with multiple sizes and update assets ([425bf62](https://github.com/einord/stina/commit/425bf628b48bd22a06d26642f10effeaf05f8639))
* add idle system messages and settings integration to ChatManager ([ed3713e](https://github.com/einord/stina/commit/ed3713ede1a91469dd4841f54fdc4930ce8aaa44))
* Add internationalization guidelines for user text and AI prompts in AGENTS.md ([39f81b8](https://github.com/einord/stina/commit/39f81b8438261611854bead9b690be10fd595b46))
* Add internationalization support for chat, tools, and settings components with localization strings ([0ba6f66](https://github.com/einord/stina/commit/0ba6f6632ad49ac6d14c88b3f3ff589fc8105bdf))
* add logging for tool invocations and format argument previews ([ec0d2d0](https://github.com/einord/stina/commit/ec0d2d0fd21d5ab14de1f2c4f92cb806d0688eca))
* add logging functionality with setToolLogger and logToolMessage ([2cd037a](https://github.com/einord/stina/commit/2cd037ad0c062315ab06158171334fbd03cad567))
* Add memory editing and deletion functionality with UI updates ([613b765](https://github.com/einord/stina/commit/613b765355294ccdd6f3421c6d191dca55923e19))
* Add memory management tools and UI integration for user memories ([88ccfa5](https://github.com/einord/stina/commit/88ccfa5783b7c72d9c7ae51950703b18550e73c0))
* add normalizeToolArgs utility function and update tool call handling in Ollama and OpenAI providers ([ae811de](https://github.com/einord/stina/commit/ae811de33d59a13f653992ad65b409bbe178dc85))
* add recurring todo templates functionality ([#23](https://github.com/einord/stina/issues/23)) ([c1b244a](https://github.com/einord/stina/commit/c1b244a0c1161277c1a40ec26f6d2bc44aa757b2))
* Add settings management components and enhance internationalization support ([816566f](https://github.com/einord/stina/commit/816566f703c1400da637a9d62bb0fb24ad31cabe))
* add streaming support for GeminiProvider with SSE handling ([4cfa9ff](https://github.com/einord/stina/commit/4cfa9ffa6b8a5066fa4a77676b5e488e0203a61a))
* add tests for parseDueAt function and export it for testing ([f167cb0](https://github.com/einord/stina/commit/f167cb023fd65d555fa154efa797d2311a9d94f8))
* add timestamp display to chat messages with formatting options ([cd85b9d](https://github.com/einord/stina/commit/cd85b9dbc2af170a3b4326ed60cb215fe7560c57))
* add todo comments functionality with API integration and UI updates ([28cb742](https://github.com/einord/stina/commit/28cb742b59a94fc965c69a11f906fa48285afa01))
* Add user profile management with settings UI and IPC integration ([1939deb](https://github.com/einord/stina/commit/1939deb3ad3187b6e8657e326cb4dc7a0e7a1266))
* add warning handling for tools-disabled scenario and update UI accordingly ([817b432](https://github.com/einord/stina/commit/817b432bd4d2f06f9b59d38d992ca3e8151457e3))
* **chat:** implement conversation tracking and synchronization across components ([01df318](https://github.com/einord/stina/commit/01df3184527c82f9ec38db0bf5252e3a81d649e9))
* **chat:** increase memory retrieval limit to enhance context awareness ([8422978](https://github.com/einord/stina/commit/8422978a5d077299b6a66f2d11b006859aa416d2))
* **chat:** update message rendering to filter out instruction messages and enhance user prompts in Swedish ([fd4fb7e](https://github.com/einord/stina/commit/fd4fb7e58416bf4ae159ab121f857b9213ea2256))
* consolidate settings imports and remove unused imports for cleaner code ([efc4e5d](https://github.com/einord/stina/commit/efc4e5d5ddb70ea39b3e97546ebb80c0fd813771))
* **email:** implement email handling with IMAP and SMTP support ([#48](https://github.com/einord/stina/issues/48)) ([b9badb8](https://github.com/einord/stina/commit/b9badb8a20d8ceffca374751ad816c67e276d24c))
* enhance chat UI with icon components and update navigation buttons ([c016fb6](https://github.com/einord/stina/commit/c016fb6571a13d6ca7f4c91e889ec0b38839cf83))
* enhance ChatBubble to render markdown content and update ChatView to pass text prop ([480cef0](https://github.com/einord/stina/commit/480cef03d32ccae761f5801ad3c175bccda0b25d))
* enhance CLI and Electron apps with store integration and new todo features ([6e8be20](https://github.com/einord/stina/commit/6e8be2062a910691d60135968bf56b0ce1f93dff))
* Enhance internationalization support by adding localization strings and validation script for i18n files ([0dbf6ca](https://github.com/einord/stina/commit/0dbf6ca0dddd53c13e6b12a50914d4f3ebcf98f9))
* enhance layout styles with min-height adjustments for better responsiveness ([8b46bbe](https://github.com/einord/stina/commit/8b46bbeb57abf1508ce66e56af163e9647ec0662))
* Enhance MCP server management with stdio support; add connection type selection in AddServerForm ([ad6c5a9](https://github.com/einord/stina/commit/ad6c5a97ff9fbf516a8ed13c47b53d2440aed9e1))
* Enhance memory management with title support and improved retrieval functions ([e3ce5bf](https://github.com/einord/stina/commit/e3ce5bfa5081119721d34730f2eb7fea43fc71f8))
* enhance message display with debug and info labels in chat views ([7a5e999](https://github.com/einord/stina/commit/7a5e9993d5a1cf71fbf24299f906f0ec987e58bb))
* enhance navigation rendering and status updates in TUI ([6a3febe](https://github.com/einord/stina/commit/6a3febe200563fd8a1609666d21c04acd2977991))
* Enhance provider configuration handling by ensuring only fields with actual values are included and removing empty fields ([19e2d13](https://github.com/einord/stina/commit/19e2d1370cf4c1e1c142776747f05f1b6daa4357))
* enhance todo update functionality to support title-based identification and improve error handling ([46a179b](https://github.com/einord/stina/commit/46a179b04bed4357233a2127049515b759463242))
* Enhance tool call parsing by adding balanced JSON extraction and cleanup strategies ([2225b92](https://github.com/einord/stina/commit/2225b9206ecd9316ca4782ff46e7499def512b40))
* enhance tool invocation and error handling in MCPClient and tools integration ([e3cc028](https://github.com/einord/stina/commit/e3cc0287a7baf0d63f782830227f6d344fcfcd9c))
* enhance TUI layout with todos visibility and update status management ([6fd471e](https://github.com/einord/stina/commit/6fd471ef866900fb938ca1cc3b6865cca4ddb468))
* **gemini:** implement Gemini SDK integration and fix streaming UI ([108b028](https://github.com/einord/stina/commit/108b0282e05b86121e3c24bcd641818f55dd2762))
* **gemini:** implement Gemini SDK integration and fix streaming UI ([5fdece6](https://github.com/einord/stina/commit/5fdece6b0e68847f3899324c34678b6eff0d62e0))
* **i18n:** enhance instructions for AI assistant to improve user interaction and tool usage ([06bfe2b](https://github.com/einord/stina/commit/06bfe2b7c655ca8923a3374af20bddc04a99199e))
* **i18n:** update memory list prompts for improved user guidance in English and Swedish ([8422978](https://github.com/einord/stina/commit/8422978a5d077299b6a66f2d11b006859aa416d2))
* implement AI provider settings management with UI and IPC integration ([0b197cc](https://github.com/einord/stina/commit/0b197cc4faeb199e6cc4e5cd1a90bb2bf07bb2c6))
* implement chat application with theming, layout, and multiple views ([6e07de4](https://github.com/einord/stina/commit/6e07de4693a28a9b8038e810fd1493422e4f14a3))
* implement chat auto-scroll functionality and enhance scrolling controls ([3c812e1](https://github.com/einord/stina/commit/3c812e16c5309085b5d62dad2956e7790f7e0be5))
* implement chat functionality with message handling, toolbar, and IPC integration ([e238762](https://github.com/einord/stina/commit/e238762849aa4b5cae38f3ef15efa0e35f195dfc))
* Implement internationalization support with i18n module and update CLI, TUI, and chat components for localization ([d511261](https://github.com/einord/stina/commit/d5112611db7dd19268357474c31363d92d6fa933))
* Implement language selection and settings management with localization support ([370e602](https://github.com/einord/stina/commit/370e60208226c15d0f2df341e5ca464d974aff70))
* implement MCP server management with UI integration and WebSocket client ([42df00b](https://github.com/einord/stina/commit/42df00bce84e85d699da274917dd6df9c845dff0))
* implement streaming cancellation and abort handling in chat providers and UI components ([fc18892](https://github.com/einord/stina/commit/fc188928cce1d8da692766c938cb09e819b5cdf2))
* implement streaming support for chat providers and enhance ChatView for real-time updates ([ddaca9d](https://github.com/einord/stina/commit/ddaca9d173d1396b3a39f4206dd0c5a888aced05))
* Implement text-based tool call parsing and cleanup functions ([bf7f932](https://github.com/einord/stina/commit/bf7f932206a1a6b720f3a5df1d5829bd69696bde))
* implement todo change listener for immediate cache refresh on mutations ([31cbe7f](https://github.com/einord/stina/commit/31cbe7f5e58f4b7a27c1b627a28a45794014dd50))
* implement todo management with panel, API, and database integration ([da6c5d7](https://github.com/einord/stina/commit/da6c5d77efed3e8616ef245257183fd06cbe52ff))
* integrate chat functionality with ChatManager and providers ([0e8a1f5](https://github.com/einord/stina/commit/0e8a1f54948fe65496f90cc15b74922ffb1f8259))
* integrate toolSystemPrompt into message handling for Anthropic, Gemini, Ollama, and OpenAI providers ([c2382d1](https://github.com/einord/stina/commit/c2382d14a897d4bbf10bc1b8ad3d094b553446aa))
* **logging:** change log message role from 'info' to 'tool' for better categorization ([b8b3f46](https://github.com/einord/stina/commit/b8b3f46aafc5cb12bc4783a38881201f9a146459))
* **nav:** implement NavButton component and integrate into SideNav and SettingsSidebar ([207bda2](https://github.com/einord/stina/commit/207bda29496add75e5d4fd32ab71d0d3d5825b15))
* **nav:** refactor navigation components and introduce SimpleButton for improved UI consistency ([24dd2e4](https://github.com/einord/stina/commit/24dd2e4e5fd0725ceabd96ef59fe4c1ad83e008b))
* Normalize MCP tools format to BaseToolSpec in listMCPTools and listStdioMCPTools functions ([7c4725b](https://github.com/einord/stina/commit/7c4725b4ba4c65ca78d4a3c37d4d22a7d98b482c))
* **ollama:** improve logging format for message initialization and history retrieval ([02d3efe](https://github.com/einord/stina/commit/02d3efe5a7d7e7e6533e72d2481cd00c3e929a30))
* **openai:** add detailed logging for request data in OpenAIProvider ([e295842](https://github.com/einord/stina/commit/e295842dfda904cf8fc591afa2f10045c502848c))
* **openai:** enhance OpenAIProvider with conversation ID handling and improve message processing ([1e0227d](https://github.com/einord/stina/commit/1e0227da1209c11919dcdab7a4018faa6f5d45a1))
* **providers:** refactor conversation handling in Anthropic, Gemini, and Ollama providers to utilize current conversation ID ([78d7603](https://github.com/einord/stina/commit/78d760334c4873e9e9d129ce230aa1a1e1356570))
* refactor chat message handling to support interactions ([be627b8](https://github.com/einord/stina/commit/be627b8d0b6c7c7dc6d89496490388ea795a6f1b))
* refactor chat view structure and update import paths ([d686614](https://github.com/einord/stina/commit/d68661423257b1e5649ab3366290ccd75bc1a05a))
* refactor provider architecture and implement tool specifications for enhanced functionality ([2e12853](https://github.com/einord/stina/commit/2e12853bba3e441e5588402716212742aaab9cb4))
* refactor tool handling by introducing built-in tools and updating tool specifications ([171f947](https://github.com/einord/stina/commit/171f94792d9c62a6b05335f820885157c7a12ff6))
* refactor TUI layout and status management, enhance theme handling ([579f3fa](https://github.com/einord/stina/commit/579f3fa1e5f42868571affd4fb96491c84a9c59d))
* Refresh MCP tool cache at session start and update tool specs retrieval across providers ([d9f27e9](https://github.com/einord/stina/commit/d9f27e961b7b0199785fbd1ace18766fec57cbed))
* Remove overflow properties from layout components for improved responsiveness ([c2415c5](https://github.com/einord/stina/commit/c2415c511278ebc199e737942577579201e40ca2))
* reorganize imports for consistency and clarity across multiple files ([77a93e3](https://github.com/einord/stina/commit/77a93e3cf6319e2ac3831a0eefdc40dbddf9cae7))
* **styles:** update background colors to use --empty-bg variable for consistency across components ([6364a0b](https://github.com/einord/stina/commit/6364a0bcc01aea07f2184ece7668486532e18375))
* Tandoor recipe agent integration with smart shopping ([#4](https://github.com/einord/stina/issues/4)) ([da03332](https://github.com/einord/stina/commit/da03332f1b65ac6ad5459d2b4df173c159c0a3a8))
* **todos:** add support for timepoint reminders and all-day todos ([#20](https://github.com/einord/stina/issues/20)) ([d3262dd](https://github.com/einord/stina/commit/d3262dd27c974bf3c4146ac54f014770a540d46b))
* **tools:** add memory, profile, and todo management tools ([ca55e98](https://github.com/einord/stina/commit/ca55e9804922a8a5817d652c9ebe90f86bf23de5))
* **tools:** enhance MCP tool handling and improve documentation for tool definitions ([8d21aec](https://github.com/einord/stina/commit/8d21aec807fb4ff77cc800847abf7873a4ca8e3c))
* **tools:** normalize MCP tool specifications to comply with OpenAI's requirements ([99e368a](https://github.com/einord/stina/commit/99e368ab10dada3c6def5fa591fcb320995ca6ac))
* update chat session handling to rely on chat-changed event for view updates ([269e5d5](https://github.com/einord/stina/commit/269e5d5308b59f060190f43debfacc3357df56fc))
* Update ChatRole type to include 'error' and enhance OpenAIProvider fetch requests with structured data ([ed2b24a](https://github.com/einord/stina/commit/ed2b24ae5681f7bbd52afe100047cd37d9917550))
* update ChatView to enhance message rendering and add styling for info messages ([5b12983](https://github.com/einord/stina/commit/5b12983245815e8fa61e47f55af0090db7c2a20c))
* update Electron main process and Vue component with logging, change preload format to CommonJS ([7a8b4a3](https://github.com/einord/stina/commit/7a8b4a3b6efb807074209be4c1784c7a44fb7b24))
* Update Electron preload and main scripts for improved path handling and logging ([ce99df6](https://github.com/einord/stina/commit/ce99df69e10d1eb17c0b6824727ccebf824323e5))
* update import paths to include file extensions for consistency ([870c164](https://github.com/einord/stina/commit/870c164156f852d3e03a5effcd0ed5fcc57d142b))
* update todos display format and improve menu toggle logic ([116f080](https://github.com/einord/stina/commit/116f08051c38c78e48dac75e5c5217e78fcc0a62))
* Update tool usage instructions for Stina assistant to improve clarity and guidance ([2260471](https://github.com/einord/stina/commit/226047150ee62a096ff2b021605eaee2ee75e99b))
* update VSCode settings and improve component type declarations for consistency ([a94f0b4](https://github.com/einord/stina/commit/a94f0b427f89f397f94b0b8cb042a1162b605fe3))
* **workspace:** Rewrote the entire application ([47aff08](https://github.com/einord/stina/commit/47aff0889d85cc05acdd29f016202b215574d452))


### Bug Fixes

* Format template code for better readability in AddProviderModal.vue and AISettings.vue ([2a64922](https://github.com/einord/stina/commit/2a6492209aae90a2b3d3e9f5363effc26b781d06))
* **gemini:** address PR review feedback ([78b552c](https://github.com/einord/stina/commit/78b552cb59c820204600fcdb91b83be0c8d64f33))
* **pr:** address all comments from reviewer ([3900bf8](https://github.com/einord/stina/commit/3900bf886d9336d58709e574035195c9771e363e))
* Remove unnecessary blank line in AddProviderModal.vue ([1e64e14](https://github.com/einord/stina/commit/1e64e14ce02da5c79ec95854a4b58bfe4b3274fe))
* Remove unnecessary blank lines in formatToolDiscoveryMessage and extractServerTools functions ([453b335](https://github.com/einord/stina/commit/453b33511fa31336150318cdb07287a3bd15f4cb))
* **theme:** change default value of appBackgroundTest token from pink to grey ([47aff08](https://github.com/einord/stina/commit/47aff0889d85cc05acdd29f016202b215574d452))
* **ui-vue:** update ApiClient interface to include optional reloadThemes method ([47aff08](https://github.com/einord/stina/commit/47aff0889d85cc05acdd29f016202b215574d452))
* Update preload file extension from .cjs to .js in Electron configuration ([d41a11a](https://github.com/einord/stina/commit/d41a11ad14c47b13ed6f66c052aef9845358b844))
* **workspace:** remove ignoredBuiltDependencies for electron and esbuild ([47aff08](https://github.com/einord/stina/commit/47aff0889d85cc05acdd29f016202b215574d452))
