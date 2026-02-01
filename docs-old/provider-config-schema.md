# Provider Configuration Schema

This document describes the schema-driven approach for AI provider configuration in Stina extensions.

## Problem Statement

AI provider extensions need to collect configuration from users (e.g., server URLs, API keys). Previously, this required hardcoding extension-specific logic in the main application:

```typescript
// BAD: Hardcoded extension knowledge in app code
const needsUrlConfig = computed(() => providerId.value === 'ollama')
```

This approach violates separation of concerns and doesn't scale as more providers are added.

## Solution: Declarative Config Schema

Extensions declare their configuration requirements in `manifest.json` using a JSON Schema-inspired format. The application renders appropriate UI controls based on this schema, with no extension-specific code.

### Benefits

| Aspect | Benefit |
|--------|---------|
| **Security** | 100% declarative, no extension code executes in UI layer |
| **Separation** | Application renders based on schema, no hardcoded extension names |
| **TUI compatibility** | Easy to implement text inputs, password fields, checkboxes |
| **Validation** | Host can validate before sending data to extension |
| **Flexibility** | Different providers can have completely different settings |
| **Future-proof** | New types can be added to schema without breaking existing extensions |

### Why Not Vue Components from Extensions?

| Risk | Explanation |
|------|-------------|
| **Security** | Vue components execute arbitrary code outside Worker sandbox |
| **XSS** | Extensions could potentially inject scripts |
| **Inconsistent UX** | Each extension gets its own style/behavior |
| **TUI impossible** | Cannot render in terminal |
| **Version conflict** | Vue version in extension vs application |

## Schema Definition

### ProviderConfigSchema

```typescript
interface ProviderConfigSchema {
  /** Property definitions */
  properties: Record<string, ProviderConfigProperty>
  /** Display order of properties in UI (optional) */
  order?: string[]
}
```

### ProviderConfigProperty

```typescript
interface ProviderConfigProperty {
  /** Property type - determines UI control */
  type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'url'

  /** Display label */
  title: string

  /** Help text shown below the input */
  description?: string

  /** Default value */
  default?: unknown

  /** Whether the field is required */
  required?: boolean

  /** Placeholder text for input fields */
  placeholder?: string

  /** For 'select' type: static options */
  options?: Array<{ value: string; label: string }>

  /** Validation rules */
  validation?: {
    pattern?: string      // Regex pattern
    minLength?: number    // Minimum string length
    maxLength?: number    // Maximum string length
    min?: number          // Minimum number value
    max?: number          // Maximum number value
  }
}
```

## Property Types

| Type | UI Control | Description |
|------|------------|-------------|
| `string` | Text input | Generic text field |
| `url` | URL input | Text field with URL validation |
| `password` | Password input | Masked text field for secrets |
| `number` | Number input | Numeric input with optional min/max |
| `boolean` | Toggle/Checkbox | On/off switch |
| `select` | Dropdown | Selection from static options |

## Examples

### Ollama Provider (Local Server)

```json
{
  "contributes": {
    "providers": [{
      "id": "ollama",
      "name": "Ollama",
      "description": "Local AI models via Ollama",
      "suggestedDefaultModel": "llama3.2:8b",
      "defaultSettings": {
        "url": "http://localhost:11434"
      },
      "configSchema": {
        "order": ["url"],
        "properties": {
          "url": {
            "type": "url",
            "title": "Server URL",
            "description": "URL to your Ollama server",
            "placeholder": "http://localhost:11434",
            "default": "http://localhost:11434",
            "required": true
          }
        }
      }
    }]
  }
}
```

### OpenAI-style Provider (API Key)

```json
{
  "contributes": {
    "providers": [{
      "id": "openai",
      "name": "OpenAI",
      "configSchema": {
        "order": ["apiKey", "organization", "baseUrl"],
        "properties": {
          "apiKey": {
            "type": "password",
            "title": "API Key",
            "description": "Your OpenAI API key from platform.openai.com",
            "required": true,
            "placeholder": "sk-..."
          },
          "organization": {
            "type": "string",
            "title": "Organization ID",
            "description": "Optional organization ID for API requests",
            "required": false,
            "placeholder": "org-..."
          },
          "baseUrl": {
            "type": "url",
            "title": "API Base URL",
            "description": "Override for custom API endpoints",
            "default": "https://api.openai.com/v1",
            "required": false
          }
        }
      }
    }]
  }
}
```

### Provider with Select Options

```json
{
  "contributes": {
    "providers": [{
      "id": "azure-openai",
      "name": "Azure OpenAI",
      "configSchema": {
        "order": ["endpoint", "apiKey", "apiVersion"],
        "properties": {
          "endpoint": {
            "type": "url",
            "title": "Endpoint",
            "description": "Your Azure OpenAI resource endpoint",
            "required": true,
            "placeholder": "https://your-resource.openai.azure.com"
          },
          "apiKey": {
            "type": "password",
            "title": "API Key",
            "required": true
          },
          "apiVersion": {
            "type": "select",
            "title": "API Version",
            "default": "2024-02-01",
            "options": [
              { "value": "2024-02-01", "label": "2024-02-01 (Latest)" },
              { "value": "2023-12-01-preview", "label": "2023-12-01-preview" },
              { "value": "2023-05-15", "label": "2023-05-15" }
            ]
          }
        }
      }
    }]
  }
}
```

## Model Selection

Model selection is handled **separately** from the config schema:

1. User fills in provider settings (URL, API key, etc.)
2. Application calls `provider.getModels(options)` with those settings
3. Provider extension returns available models
4. Application displays model combobox (always present, not part of schema)
5. Selected model + settings are saved to `ModelConfig`

This separation allows the model list to be dynamic based on the provider settings.

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   manifest.json │────▶│  Extension Host │────▶│    UI (Vue)     │
│   configSchema  │     │  (validates &   │     │  (renders form  │
│                 │     │   exposes)      │     │   from schema)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  User Input     │
                                                │  (settings)     │
                                                └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        ▼                                ▼                                ▼
                ┌───────────────┐               ┌───────────────┐               ┌───────────────┐
                │ getModels()   │               │ ModelConfig   │               │    chat()     │
                │ with settings │               │ saved to DB   │               │ with settings │
                └───────────────┘               └───────────────┘               └───────────────┘
```

## Validation

The application validates user input based on the schema:

1. **Required fields**: Must have a non-empty value
2. **Type validation**: URLs must be valid, numbers must be numeric
3. **Pattern matching**: If `validation.pattern` is set, value must match regex
4. **Length limits**: `minLength`, `maxLength` for strings
5. **Range limits**: `min`, `max` for numbers

Validation errors are displayed inline with the form fields.

## TUI Implementation

For the terminal UI (TUI), the same schema drives a text-based form:

```
┌─ Configure Ollama ───────────────────────────────────┐
│                                                      │
│  Server URL: [http://localhost:11434_____________]   │
│  URL to your Ollama server                           │
│                                                      │
│  Model: [llama3.2:8b▼]                               │
│                                                      │
│  Name: [My Ollama Model___________________________]  │
│                                                      │
│  [ ] Set as default                                  │
│                                                      │
│               [Cancel]  [Save]                       │
└──────────────────────────────────────────────────────┘
```

## Implementation Checklist

- [x] Document design (this file)
- [ ] Extend `ProviderDefinition` in `@stina/extension-api`
- [ ] Update `ManifestValidator` to validate `configSchema`
- [ ] Expose provider metadata from `ExtensionHost`
- [ ] Create `ProviderConfigForm.vue` component
- [ ] Update `Ai.EditModelModal.vue` to use schema-driven form
- [ ] Update ollama-extension with `configSchema`

## Future Considerations

### Dynamic Options

In the future, we may add support for dynamic select options that are fetched from the extension:

```json
{
  "type": "select",
  "title": "Region",
  "dynamicOptionsSource": "getRegions"
}
```

This would call an extension method to populate options, but requires careful security consideration.

### Conditional Fields

We may add `showWhen` for fields that depend on other values:

```json
{
  "proxyUrl": {
    "type": "url",
    "title": "Proxy URL",
    "showWhen": { "field": "useProxy", "equals": true }
  }
}
```

### Field Groups

For complex providers, grouping related fields:

```json
{
  "groups": [
    { "id": "auth", "title": "Authentication", "fields": ["apiKey", "organization"] },
    { "id": "advanced", "title": "Advanced", "fields": ["baseUrl", "timeout"] }
  ]
}
```
