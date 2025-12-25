const en = {
  app: {
    title: 'Stina',
  },
  nav: {
    chat: 'Chat',
    tools: 'Tools',
    settings: 'Settings',
  },
  chat: {
    instruction: 'Instruction',
    you: 'You',
    assistant: 'Assistant',
    system: 'System',
    new_chat: 'New Chat',
    start_new_chat: 'Start new chat',
    retry_last: 'Retry last',
    thinking: 'Stina is thinking...',
    in_queue: 'In Queue:',
    remove_from_queue: 'Remove from queue',
    input_placeholder: 'Message Stina...',
  },
  greeting: {
    default_name: 'world',
    message: 'Hello, {{name}}!',
  },
  home: {
    title: 'Say Hello',
    name_placeholder: 'Enter your name',
    greet_button: 'Greet',
    loading: 'Loading...',
    error_generic: 'An error occurred',
  },
  cli: {
    description: 'Stina AI Assistant CLI',
    hello_command_description: 'Get a greeting',
    hello_name_option: 'Name to greet',
    hello_time_label: 'Time',
    theme_command_description: 'Show current theme',
    theme_list_option: 'List available themes',
    theme_list_title: 'Available themes:',
    theme_item: '- {{id}}: {{label}}',
    theme_current: 'Current theme: {{theme}}',
  },
} satisfies Record<string, unknown>

export default en
