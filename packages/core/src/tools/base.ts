export type JsonSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProperty =
  | {
      type: 'string' | 'number' | 'integer' | 'boolean';
      description?: string;
    }
  | {
      type: 'object';
      properties?: Record<string, JsonSchemaProperty>;
      required?: string[];
      additionalProperties?: boolean;
      description?: string;
    }
  | {
      type: 'array';
      items?: JsonSchemaProperty;
      description?: string;
    };

export type BaseToolSpec = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

export type ToolHandler = (args: unknown) => Promise<unknown>;

export type ToolDefinition = {
  spec: BaseToolSpec;
  handler: ToolHandler;
};

/**
 * Converts an internal tool spec to the OpenAI-compatible JSON schema.
 */
function toOpenAITool(tool: BaseToolSpec) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/**
 * Converts an internal tool spec to the Anthropic tool format.
 */
function toAnthropicTool(tool: BaseToolSpec) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

type GeminiSchema =
  | { type: 'STRING' | 'NUMBER' | 'BOOLEAN'; description?: string }
  | { type: 'ARRAY'; items?: GeminiSchema; description?: string }
  | {
      type: 'OBJECT';
      properties?: Record<string, GeminiSchema>;
      required?: string[];
      description?: string;
    }
  | { type: 'ANY'; description?: string };

/**
 * Recursively maps JSON schema properties to the Gemini schema format.
 */
function toGeminiSchema(property?: JsonSchemaProperty): GeminiSchema {
  if (!property || typeof property !== 'object' || !('type' in property)) {
    return { type: 'ANY' };
  }
  switch (property.type) {
    case 'string':
      return { type: 'STRING', description: property.description };
    case 'number':
    case 'integer':
      return { type: 'NUMBER', description: property.description };
    case 'boolean':
      return { type: 'BOOLEAN', description: property.description };
    case 'array':
      return {
        type: 'ARRAY',
        description: property.description,
        items: property.items ? toGeminiSchema(property.items) : { type: 'ANY' },
      };
    case 'object': {
      const props: Record<string, GeminiSchema> = {};
      const entries = Object.entries(property.properties ?? {});
      for (const [key, value] of entries) {
        props[key] = toGeminiSchema(value);
      }
      return {
        type: 'OBJECT',
        description: property.description,
        properties: props,
        required: property.required,
      };
    }
    default:
      return { type: 'ANY', description: (property as { description?: string }).description };
  }
}

/**
 * Shapes a tool definition into Gemini's function declaration payload.
 */
function toGeminiTool(tool: BaseToolSpec) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, value]) => [
          key,
          toGeminiSchema(value),
        ]),
      ),
      required: tool.parameters.required,
    },
  };
}

/**
 * Builds provider-specific tool spec bundles from base definitions.
 * Feed these results directly into LLM API requests.
 */
export function createToolSpecs(specs: BaseToolSpec[]) {
  return {
    openai: specs.map(toOpenAITool),
    ollama: specs.map(toOpenAITool),
    anthropic: specs.map(toAnthropicTool),
    gemini: [
      {
        functionDeclarations: specs.map(toGeminiTool),
      },
    ],
  } as const;
}

/**
 * Generates the instruction block describing available tools to the LLM.
 * This prompt is designed to maximize tool usage accuracy by being clear and actionable.
 * @param specs All builtin tool specifications to summarize.
 */
export function createToolSystemPrompt(specs: BaseToolSpec[]): string {
  const summary = specs
    .map((tool) => {
      // Extract the first sentence of description for brevity
      const desc = tool.description.split('\n')[0].replace(/\*\*/g, '');
      return `• ${tool.name} - ${desc}`;
    })
    .join('\n');

  return `You are Stina, a helpful AI assistant with access to tools that let you take actions.

# IMPORTANT: TOOL AVAILABILITY

You have ALREADY been shown all available tools at the start of this session.
Review the tool list in the conversation history above to see what you can do.

HOWEVER: If the user asks about a capability or service that wasn't in that list:
- Call list_tools again to refresh your view (tools may have been added/removed)
- Common examples: "Can you access Slack?", "Do you have GitHub integration?"

# CRITICAL RULES FOR TOOL USAGE

1. **ACT, DON'T EXPLAIN**: When a user asks you to do something, IMMEDIATELY call the appropriate tool.
   ❌ WRONG: "You can add it using todo_add with..."
   ✅ RIGHT: [call todo_add directly]

2. **TOOL-FIRST APPROACH**: If there's a tool for it, use it. Never write code examples or explanations about how to use tools.
   
3. **AFTER CALLING A TOOL**: Briefly confirm what you did in natural language.
   Example: "Added 'buy milk' to your todo list." or "Here's what's on your list:"

4. **WHEN TOOLS SEEM MISSING**: 
   • First, check the tool list shown at the start of this session
   • If user mentions a service (Slack, GitHub, etc.) that wasn't listed, call list_tools to refresh
   • The tool landscape may change - always verify before saying "I can't do that"

5. **MCP TOOLS WORKFLOW**:
   - You've already seen available MCP tools in the session start message
   - Use mcp_call to invoke external tools: mcp_call(server="slack", tool="slack_chat_postMessage", args={...})
   - If unsure about parameters, the tool list shows required fields

# CORE TOOLS (More may be available via MCP - check session start)

${summary}

# RESPONSE PATTERNS

✅ CORRECT - Direct tool action:
User: "Add buy milk to my list"
Assistant: [calls todo_add]
Assistant: "Added 'buy milk' to your todo list."

✅ CORRECT - Using MCP tools:
User: "Send a message to Jonte on Slack saying hello"
Assistant: [reviews tools from session start, sees slack_users_search and slack_chat_postMessage]
Assistant: [calls mcp_call with slack_users_search to find Jonte]
Assistant: [calls mcp_call with slack_chat_postMessage]
Assistant: "Sent message to Jonte on Slack."

✅ CORRECT - Verifying new capabilities:
User: "Can you search the web?"
Assistant: [calls list_tools to check for search capabilities]
Assistant: "Yes! I found a brave_search tool. What would you like me to search for?"

❌ INCORRECT - Claiming inability without checking session tools:
User: "Send a message to Jonte on Slack"
Assistant: "I don't have the ability to send Slack messages"
(You should check the tool list from session start first!)

Remember: Check your available tools (shown at session start) before claiming you can't do something!`;
}
