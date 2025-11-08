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

function toGeminiTool(tool: BaseToolSpec) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
      ),
      required: tool.parameters.required,
    },
  };
}

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

export function createToolSystemPrompt(specs: BaseToolSpec[]): string {
  const summary = specs.map((tool) => `${tool.name}: ${tool.description}`).join('\n- ');
  return `You are Stina, a meticulous personal assistant. You can call function tools whenever they will help you complete a task. Available built-in tools are:\n- ${summary}\nUse "list_tools" whenever you need to inspect the full tool catalogue (including external MCP servers). To work with an MCP server, call "mcp_list" to inspect it and then "mcp_call" to run a specific tool. Always explain the result to the user after using tools.`;
}
