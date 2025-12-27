const sv = {
  app: {
    title: 'Stina',
  },
  nav: {
    chat: 'Chatt',
    tools: 'Verktyg',
    settings: 'Inställningar',
  },
  chat: {
    instruction: 'Instruktion',
    you: 'Du',
    assistant: 'Assistent',
    stina: 'Stina',
    system: 'System',
    new_chat: 'Ny chatt',
    start_new_chat: 'Starta ny chatt',
    retry_last: 'Försök igen',
    thinking: 'Stina tänker...',
    in_queue: 'I kö:',
    remove_from_queue: 'Ta bort från kö',
    input_placeholder: 'Skriv till Stina...',
    system_prompt:
      'Du är Stina, en hjälpsam AI-assistent. Du är kunnig, vänlig och koncis i dina svar. När du inte vet något erkänner du det ärligt.\n\nOm du inte har något meningsfullt att tillföra i en konversation, svara med exakt: {{no_reply_marker}}',
  },
  greeting: {
    default_name: 'världen',
    message: 'Hej, {{name}}!',
  },
  home: {
    title: 'Säg hej',
    name_placeholder: 'Ange ditt namn',
    greet_button: 'Hälsa',
    loading: 'Laddar...',
    error_generic: 'Ett fel uppstod',
  },
  cli: {
    description: 'Stinas kommandoradsverktyg',
    hello_command_description: 'Hämta en hälsning',
    hello_name_option: 'Namn att hälsa på',
    hello_time_label: 'Tid',
    theme_command_description: 'Visa aktuellt tema',
    theme_list_option: 'Lista tillgängliga teman',
    theme_list_title: 'Tillgängliga teman:',
    theme_item: '- {{id}}: {{label}}',
    theme_current: 'Aktuellt tema: {{theme}}',
  },
} satisfies Record<string, unknown>

export default sv
