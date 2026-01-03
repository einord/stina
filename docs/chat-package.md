# Chat Package Documentation

## Översikt

`packages/chat` är kärnan i Stinas chattfunktionalitet. Paketet orkestrerar konversationer mellan användaren och AI-assistenten Stina, men skickar inte själva meddelanden till AI-providers – det hanteras av extensions.

### Huvudfunktioner

- **Conversation Management**: Skapa och hantera konversationer med flera interaktioner
- **Message Types**: Stöd för user, stina, thinking, tools, instruction och information messages
- **Streaming**: Platform-neutral streaming av AI-svar via EventEmitter
- **Provider Abstraction**: Definierar interface för AI-providers (implementeras av extensions)
- **Database Persistence**: SQLite-lagring via Drizzle ORM
- **Internationalization**: System prompt översatt via i18n

## Arkitektur

### Designbeslut

#### 1. Hybrid Database Approach

**Rationale**: Balans mellan normalisering och praktiskhet.

```
Conversations (tabell)
  ↓ 1:N
Interactions (tabell)
  ↓ innehåller
Messages (JSON-kolumn)
```

**Fördelar**:
- Conversations & Interactions som tabeller → effektiv indexering, queries, CASCADE deletes
- Messages som JSON → naturlig ordning, enkel att arbeta med, minimal JOIN-komplexitet
- Information messages separat → visas alltid först i UI

**Schema**:
```typescript
conversations {
  id: string (PK)
  title: string?
  createdAt: timestamp
  active: boolean
  metadata: json
}

interactions {
  id: string (PK)
  conversationId: string (FK → conversations.id, CASCADE)
  createdAt: timestamp
  aborted: boolean
  messages: json              // Array av Message
  informationMessages: json   // Array av InformationMessage
  metadata: json
}
```

#### 2. Platform-Neutral Streaming

**Problem**: Streaming måste fungera i Web, Electron, API och TUI.

**Lösning**: `ChatStreamService` baserad på Node's EventEmitter.

- Vue kan wrappa i `reactive()` för reaktiv state
- API/TUI kan lyssna direkt på events
- Inga Vue-specifika beroenden i core

**Event Flow**:
```
Provider → StreamEvent → ChatStreamService → Events → UI
                         (accumulation)      (emittar)
```

#### 3. Provider Abstraction via Extensions

AI-providers registreras via extension-systemet med `contributes.aiProviders`.

**Benefits**:
- Användaren kan välja provider (Anthropic, OpenAI, Ollama, etc.)
- Chat-paketet är oberoende av specifika AI-tjänster
- `EchoProvider` som default fallback för testning

#### 4. Internationalized System Prompt

System prompt översätts baserat på användarens språkinställning.

```typescript
getSystemPrompt() → i18n.translate('chat.system_prompt')
```

- Hjälper Stina att svara på rätt språk
- Kan overridas via Settings (app.systemPrompt)
- Innehåller STINA_NO_REPLY-instruktionen

## Paketstruktur

```
packages/chat/src/
├── index.ts                      # Huvudexporter
│
├── constants/
│   ├── messageTypes.ts           # STINA_NO_REPLY constant
│   └── systemPrompt.ts           # getSystemPrompt() med i18n
│
├── types/
│   ├── message.ts                # Message interfaces
│   ├── interaction.ts            # Interaction interface
│   ├── conversation.ts           # Conversation interface
│   └── provider.ts               # AIProvider & StreamEvent
│
├── services/
│   ├── ConversationService.ts    # CRUD för conversations/interactions
│   └── ChatStreamService.ts      # EventEmitter för streaming
│
├── providers/
│   ├── ProviderRegistry.ts       # Singleton registry
│   └── EchoProvider.ts           # Default fallback provider
│
└── db/
    ├── index.ts                  # DB exports
    ├── schema.ts                 # Drizzle schema
    ├── repository.ts             # Database operations
    └── migrations/
        └── 0001_create_chat_tables.sql
```

## Datamodell

### Message Types

```typescript
type MessageType =
  | 'user'          // Användarens meddelande
  | 'stina'         // Stinas svar
  | 'thinking'      // Stinas interna resonemang
  | 'tools'         // Verktygsanrop (kan innehålla flera tools)
  | 'instruction'   // System-instruktioner (ej synliga för användare)
  | 'information'   // Informationsmeddelanden (visas alltid först)
```

### Message Flow

En typisk interaction:

```javascript
{
  id: "inter_123",
  conversationId: "conv_456",
  informationMessages: [
    { text: "Ny konversation", metadata: { createdAt: "..." } }
  ],
  messages: [
    { type: "instruction", text: "Dagens datum är 25 dec...", ... },
    { type: "user", text: "Hur ser dagen ut?", ... },
    { type: "thinking", text: "User wants agenda summary...", ... },
    {
      type: "tools",
      tools: [
        {
          name: "todo_list",
          payload: '{"limit": 100}',
          result: '[{"title": "Köpa lunch", ...}]',
          metadata: { ... }
        }
      ],
      metadata: { ... }
    },
    { type: "thinking", text: "Only one task, suggest now...", ... },
    { type: "stina", text: "Du har bara en sak på agendan...", ... }
  ],
  aborted: false,
  metadata: { createdAt: "..." }
}
```

### STINA_NO_REPLY

Om Stina inte har något att tillföra svarar hon med exakt `__STINA_NO_REPLY__`. I detta fall skapas inget stina-meddelande.

```typescript
export const STINA_NO_REPLY = '__STINA_NO_REPLY__'
```

## Provider System

### AIProvider Interface

```typescript
interface AIProvider {
  id: string          // "anthropic", "openai", "echo", etc.
  name: string        // Display name

  sendMessage(
    messages: Message[],
    systemPrompt: string,
    onEvent: (event: StreamEvent) => void
  ): Promise<void>
}
```

### StreamEvent Types

Provider emittar events under körning:

```typescript
type StreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; payload: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'content'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: Error }
```

### Extension Registration

Extensions registrerar providers via manifest:

```typescript
// Extension manifest
{
  "contributes": {
    "aiProviders": [
      {
        "id": "anthropic",
        "name": "Anthropic Claude",
        "factory": "providers/anthropic.js"
      }
    ]
  }
}
```

### EchoProvider (Default Fallback)

Om ingen provider är konfigurerad används `EchoProvider`:

```typescript
import { echoProvider, providerRegistry } from '@stina/chat'

// Registreras automatiskt
providerRegistry.register(echoProvider)
```

- Returnerar användarens meddelande tillbaka
- Simulerar streaming
- Användbar för testning och demo

## Services

### ConversationService

Platform-neutral business logic för conversations/interactions.

```typescript
import { conversationService } from '@stina/chat'

// Skapa ny conversation
const conv = conversationService.createConversation("Min chatt")

// Skapa ny interaction
const interaction = conversationService.createInteraction(conv.id)

// Lägg till meddelande
conversationService.addMessage(interaction, {
  type: 'user',
  text: 'Hej!',
  metadata: { createdAt: new Date().toISOString() }
})

// Avbryt interaction
conversationService.abortInteraction(interaction)
```

### ChatStreamService

EventEmitter för streaming från providers.

```typescript
import { ChatStreamService } from '@stina/chat'

const streamService = new ChatStreamService()

// Lyssna på events
streamService.on('thinking-update', (text) => {
  console.log('Stina tänker:', text)
})

streamService.on('content-update', (text) => {
  console.log('Stina svarar:', text)
})

streamService.on('stream-complete', (messages) => {
  console.log('Färdiga meddelanden:', messages)
})

// Mata in events från provider
provider.sendMessage(messages, systemPrompt, (event) => {
  streamService.handleStreamEvent(event)
})
```

**Events**:
- `thinking-update` - Ny thinking-text
- `content-update` - Ny content-text
- `tool-start` - Verktyg startar
- `tool-complete` - Verktyg klart
- `stream-complete` - Stream klar, returnerar Message[]
- `stream-error` - Fel uppstod

### ConversationRepository

Database operations för conversations/interactions.

```typescript
import { ConversationRepository } from '@stina/chat/db'
import { getDb } from '@stina/adapters-node'

const repo = new ConversationRepository(getDb())

// Spara conversation
await repo.saveConversation(conversation)

// Spara interaction
await repo.saveInteraction(interaction)

// Hämta conversation med alla interactions
const conv = await repo.getConversation(id)

// Lista aktiva conversations
const active = await repo.listActiveConversations()

// Uppdatera titel
await repo.updateConversationTitle(id, "Ny titel")

// Arkivera conversation
await repo.archiveConversation(id)
```

## Vue Integration

### ChatView.integration.ts

Vue composable för ChatView-komponenten.

```typescript
import { useChatIntegration } from '@stina/ui-vue/components/views/ChatView.integration'

// I ChatView.vue
const {
  currentConversation,
  currentInteraction,
  isStreaming,
  streamingContent,
  streamingThinking,
  streamingTools,
  sendMessage,
  startConversation
} = useChatIntegration({
  settingsStore,
  providerId: 'anthropic'
})
```

**Reactive state**:
- `currentConversation` - Aktuell conversation
- `currentInteraction` - Aktuell interaction
- `isStreaming` - Om streaming pågår
- `streamingContent` - Stinas text (live)
- `streamingThinking` - Stinas tankar (live)
- `streamingTools` - Verktyg som används (live)

**Methods**:
- `sendMessage(text)` - Skicka meddelande
- `startConversation()` - Starta ny conversation

## API & Shared Types

### DTOs (packages/shared)

```typescript
interface ChatMessageDTO {
  type: 'user' | 'stina' | 'thinking' | 'tools' | 'instruction' | 'information'
  text?: string
  tools?: Array<{
    name: string
    payload: string
    result: string
  }>
  createdAt: string
}

interface ChatInteractionDTO {
  id: string
  messages: ChatMessageDTO[]
  informationMessages: Array<{ text: string; createdAt: string }>
  createdAt: string
}

interface ChatConversationSummaryDTO {
  id: string
  title?: string
  lastMessage?: string
  lastMessageAt: string
  active: boolean
}

interface ChatConversationDTO {
  id: string
  title?: string
  interactions: ChatInteractionDTO[]
  active: boolean
  createdAt: string
}
```

### ApiClient Extension

```typescript
// packages/ui-vue/src/composables/useApi.ts
interface ApiClient {
  chat: {
    listConversations(): Promise<ChatConversationSummaryDTO[]>
    getConversation(id: string): Promise<ChatConversationDTO>
    sendMessage(conversationId: string | null, message: string): Promise<void>
    archiveConversation(id: string): Promise<void>
  }
}
```

## Migrations

### Multi-Path Support

Chat-paketet introducerar multi-path migrations:

```typescript
// App initialization
import { runMigrations } from '@stina/adapters-node'
import { getChatMigrationsPath } from '@stina/chat/db'

runMigrations(db, [
  getChatMigrationsPath(),
  // Framtida: getFooMigrationsPath(),
])
```

### Naming Convention

- Format: `NNNN_description.sql`
- Example: `0001_create_chat_tables.sql`
- Prefix i DB: `chat/0001_create_chat_tables.sql`

Detta undviker kollisioner mellan olika pakets migrations.

## Internationalization

### System Prompt Translations

**Svenska** (`sv.json`):
```json
{
  "chat": {
    "system_prompt": "Du är Stina, en hjälpsam AI-assistent. Du är kunnig, vänlig och koncis i dina svar. När du inte vet något erkänner du det ärligt.\n\nOm du inte har något meningsfullt att tillföra i en konversation, svara med exakt: {no_reply_marker}"
  }
}
```

**Engelska** (`en.json`):
```json
{
  "chat": {
    "system_prompt": "You are Stina, a helpful AI assistant. You are knowledgeable, friendly, and concise in your responses. When you don't know something, you admit it honestly.\n\nIf you have nothing meaningful to add to a conversation, respond with exactly: {no_reply_marker}"
  }
}
```

### Usage

```typescript
import { getSystemPrompt } from '@stina/chat'
import { settingsStore } from '@stina/adapters-node'

const prompt = getSystemPrompt(settingsStore)
// → Returnerar översatt prompt baserat på användarens språk
// → Kan overridas via settingsStore.get('app', 'systemPrompt')
```

## Error Handling

### Error Codes

```typescript
// packages/core/src/errors/AppError.ts
enum ErrorCode {
  CHAT_CONVERSATION_NOT_FOUND = 'CHAT_CONVERSATION_NOT_FOUND',
  CHAT_INTERACTION_NOT_FOUND = 'CHAT_INTERACTION_NOT_FOUND',
  CHAT_PROVIDER_NOT_FOUND = 'CHAT_PROVIDER_NOT_FOUND',
  CHAT_PROVIDER_ERROR = 'CHAT_PROVIDER_ERROR',
  CHAT_STREAM_ERROR = 'CHAT_STREAM_ERROR',
}
```

### Usage

```typescript
import { AppError, ErrorCode } from '@stina/core'

throw new AppError(
  ErrorCode.CHAT_PROVIDER_NOT_FOUND,
  `Provider ${providerId} not found`,
  { providerId }
)
```

## Exempel: Komplett Flöde

### 1. Skapa Conversation

```typescript
import { conversationService } from '@stina/chat'

const conversation = conversationService.createConversation()
```

### 2. Skapa Interaction och Lägg Till User Message

```typescript
const interaction = conversationService.createInteraction(conversation.id)

conversationService.addMessage(interaction, {
  type: 'user',
  text: 'Vad är klockan?',
  metadata: { createdAt: new Date().toISOString() }
})
```

### 3. Hämta Provider och Skicka

```typescript
import { providerRegistry, getSystemPrompt } from '@stina/chat'

const provider = providerRegistry.get('anthropic')
const systemPrompt = getSystemPrompt()

await provider.sendMessage(
  interaction.messages,
  systemPrompt,
  (event) => streamService.handleStreamEvent(event)
)
```

### 4. Stream Events → Messages

```typescript
streamService.on('stream-complete', (messages) => {
  // Lägg till messages i interaction
  messages.forEach((msg) => {
    conversationService.addMessage(interaction, msg)
  })

  // Spara till DB
  await repo.saveInteraction(interaction)
})
```

## Framtida Utveckling

### Planerade Features

- **Provider Implementations**: Anthropic, OpenAI, Ollama via extensions
- **Conversation Search**: Full-text search med SQLite FTS5
- **Message Editing**: Edit history och message versions
- **Conversation Branching**: Forka conversations från specifika punkter
- **Export/Import**: JSON export/import av conversations
- **Analytics**: Usage statistics, token counting, cost tracking

### Utbyggnadsmöjligheter

- **Voice Input**: Integration med speech-to-text
- **Image Support**: Multimodal providers
- **Code Execution**: Sandboxed code interpreter
- **Memory System**: Långsiktig konversationsminne
- **RAG Integration**: Kunskapsbasinmatning

## Best Practices

### 1. Använd Singleton Services

```typescript
// ✓ Good
import { conversationService } from '@stina/chat'

// ✗ Avoid
import { ConversationService } from '@stina/chat'
const service = new ConversationService()
```

### 2. Hantera Streaming Errors

```typescript
streamService.on('stream-error', (error) => {
  console.error('Stream error:', error)
  // Markera interaction som aborted
  conversationService.abortInteraction(interaction)
})
```

### 3. Validera Provider Finns

```typescript
const provider = providerRegistry.get(providerId)
if (!provider) {
  throw new AppError(
    ErrorCode.CHAT_PROVIDER_NOT_FOUND,
    `Provider ${providerId} not found`
  )
}
```

### 4. Spara Till DB Efter Interaction

```typescript
// Lägg till messages från stream
streamService.on('stream-complete', async (messages) => {
  messages.forEach((msg) => addMessage(interaction, msg))

  // Spara till DB
  await repo.saveInteraction(interaction)
  conversation.interactions.push(interaction)
  await repo.saveConversation(conversation)
})
```

## Dependencies

```json
{
  "dependencies": {
    "@stina/core": "workspace:*",
    "@stina/shared": "workspace:*",
    "@stina/i18n": "workspace:*",
    "nanoid": "^5.0.0",
    "drizzle-orm": "^0.36.0"
  }
}
```

## Related Documentation

- [Architecture](./architecture.md) - Overall system architecture
- [Extensions](./extensions.md) - Extension system
- [Database](./database.md) - Database patterns
- [agents.md](../agents.md) - Development guidelines
