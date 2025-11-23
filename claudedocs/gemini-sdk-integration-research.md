# Gemini SDK Integration Research & Recommendations

**Date**: 2025-11-23
**Branch**: feature/gemini-sdk-integration
**Confidence Level**: HIGH (95%)

## Executive Summary

Google's Gemini SDK provides a unified interface for AI model integration. **Critical**: The new `@google/genai` package (GA May 2025) replaces the deprecated `@google/generative-ai` (EOL November 30, 2025).

## Quick Start

### Installation
```bash
npm i @google/genai
```

### Environment Setup
```bash
# Set API key (get from https://aistudio.google.com)
export GEMINI_API_KEY="your-api-key"
```

### Basic Implementation
```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Your prompt here"
});

console.log(response.text);
```

---

## Key Findings

### 1. SDK Architecture

The SDK provides organized submodules:
- `ai.models` - Model queries and metadata
- `ai.caches` - Context caching for cost reduction
- `ai.chats` - Stateful multi-turn conversations
- `ai.files` - File upload for multimodal prompts
- `ai.live` - Real-time text/audio/video interaction

### 2. Model Selection

**Gemini 2.5 Flash** (Recommended)
- **Speed**: 270.6 tokens/sec, 0.40s first token latency
- **Context**: 1M tokens, 65K max output
- **Pricing**: $0.15/M input, $0.60/M output
- **Best for**: Price-performance balance, high-throughput tasks

**Gemini 2.5 Pro** (Advanced)
- **Speed**: 147.7 tokens/sec, 36.54s first token latency
- **Context**: 1M tokens (2M coming soon), 65K max output
- **Pricing**: $1.25/M input, $10/M output
- **Best for**: Complex reasoning, coding, mathematics

### 3. Core Capabilities

#### Chat/Conversation
```typescript
const chat = ai.chats.create({
  model: 'gemini-2.5-flash',
  systemInstruction: "You are a helpful assistant"
});

const response = await chat.sendMessage({
  message: 'Your question here'
});
```

#### Streaming Responses
```typescript
const response = await ai.models.generateContentStream({
  model: "gemini-2.5-flash",
  contents: "Write a long story"
});

for await (const chunk of response.stream) {
  console.log(chunk.text());
}
```

#### Function Calling
```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Turn on the lights',
  config: {
    tools: [{ functionDeclarations: [lightControlFunction] }]
  }
});
```

#### Multimodal (Images/Audio/Video)
```typescript
import { GoogleAIFileManager } from '@google/generative-ai/files';

const fileManager = new GoogleAIFileManager(API_KEY);
const uploadResult = await fileManager.uploadFile(imagePath, {
  mimeType: 'image/jpeg'
});

const result = await model.generateContent({
  contents: [{
    role: "user",
    parts: [
      { text: "Describe this image" },
      { fileData: { fileUri: uploadResult.file.uri, mimeType: 'image/jpeg' }}
    ]
  }]
});
```

---

## Integration Recommendations for Stina Project

### 1. Architecture Pattern

```
[Client] → [Backend API] → [Gemini SDK] → [Gemini API]
          (API key here)
```

**Security**: Never expose API keys in client-side code.

### 2. Error Handling (Essential)

```typescript
async function callGeminiWithRetry(request: any, maxRetries = 3) {
  let delay = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      if (error.status === 429 && attempt < maxRetries - 1) {
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
}
```

**Why**: Rate limits (HTTP 429) are common. Exponential backoff with jitter prevents retry storms.

### 3. Cost Optimization

**Context Caching** (75% savings on cached tokens):
```typescript
// Structure prompts: static content first, dynamic last
const staticContext = "...long document or context...";
const dynamicQuery = "user's specific question";

// Minimum requirements:
// - Flash: 1,024 tokens
// - Pro: 4,096 tokens
```

**Auto-caching**: Gemini 2.5+ models have implicit caching enabled automatically.

### 4. Security Checklist

- ✅ Store API key in environment variables
- ✅ Never commit keys to git (add to `.gitignore`)
- ✅ Server-side proxy for client requests
- ✅ Restrict API keys by IP/domain in Google Cloud Console
- ✅ Implement request rate limiting
- ✅ Log API usage for auditing

### 5. Production Deployment

**Development**:
- Use API keys from Google AI Studio
- Environment: `GEMINI_API_KEY`

**Production**:
- Migrate to Vertex AI
- Use Application Default Credentials
- Implement OAuth for stricter access control
- Monitor usage in Google Cloud Console

---

## Implementation Roadmap

### Phase 1: Basic Integration
1. Install `@google/genai`
2. Set up API key management
3. Create basic text generation endpoint
4. Implement error handling with retry logic

### Phase 2: Advanced Features
1. Add streaming support for better UX
2. Implement chat/conversation state
3. Add function calling capabilities
4. Set up context caching for cost reduction

### Phase 3: Production Hardening
1. Implement comprehensive error handling
2. Add request rate limiting
3. Set up monitoring and logging
4. Performance optimization
5. Security audit

### Phase 4: Multimodal (Optional)
1. File upload support
2. Image analysis capabilities
3. Audio/video processing
4. Live API integration

---

## Key Considerations for Stina

### 1. Use Case Analysis
- What AI features does Stina need?
- Text generation? Chat? Image analysis? Function calling?
- Expected request volume and latency requirements?

### 2. Cost Estimation
- **Flash**: $0.15/M input + $0.60/M output
- **Pro**: $1.25/M input + $10/M output
- Context caching: 75% reduction on cached tokens
- Calculate based on expected token usage

### 3. Integration Points
- Where in the Stina architecture should Gemini be integrated?
- Backend API? Microservice? Standalone service?
- Data flow and state management?

### 4. Testing Strategy
- Unit tests for API calls
- Integration tests for error handling
- Load testing for rate limits
- Cost monitoring in development

---

## Resources

**Official Documentation**:
- [Gemini API Quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [SDK Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview)
- [API Reference](https://googleapis.github.io/js-genai/release_docs/index.html)

**GitHub**:
- [googleapis/js-genai](https://github.com/googleapis/js-genai)
- [Google Gemini Cookbook](https://github.com/google-gemini/cookbook)

**NPM**:
- [@google/genai](https://www.npmjs.com/package/@google/genai)

**API Keys**:
- [Get API Key - Google AI Studio](https://aistudio.google.com)

---

## Next Steps

1. **Define Use Case**: Determine specific AI features needed for Stina
2. **Prototype**: Create minimal implementation with basic text generation
3. **Cost Analysis**: Estimate token usage and monthly costs
4. **Integration Design**: Plan where Gemini fits in Stina's architecture
5. **Security Review**: Ensure API key management meets security standards
6. **Testing**: Implement comprehensive error handling and rate limit testing
7. **Documentation**: Update Stina docs with Gemini integration details

---

**Research Completed By**: Claude Code (Deep Research Agent)
**Confidence Level**: 95% (All findings based on official Google documentation)
