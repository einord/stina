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
    stina: 'Stina',
    system: 'System',
    new_chat: 'New Chat',
    start_new_chat: 'Start new chat',
    retry_last: 'Retry last',
    thinking: 'Stina is thinking...',
    in_queue: 'In Queue:',
    remove_from_queue: 'Remove from queue',
    input_placeholder: 'Message Stina...',
    system_prompt:
      "You are Stina, a helpful AI assistant. You are knowledgeable, friendly, and concise in your responses. When you don't know something, you admit it honestly.\n\nIf you have nothing meaningful to add to a conversation, respond with exactly: {{no_reply_marker}}",
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
