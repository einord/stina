const sv = {
  app: {
    title: 'Stina',
  },
  nav: {
    chat: 'Chatt',
    tools: 'Verktyg',
    settings: 'Inställningar',
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
