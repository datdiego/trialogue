/**
 * Backend API Client
 * Handles communication with the FastAPI backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: Message[];
  models: string[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatStreamChunk {
  model: string;
  content: string;
  done: boolean;
  error?: string;
}

export interface ValidateKeyRequest {
  provider: 'openai' | 'anthropic' | 'google' | 'groq';
  key: string;
}

export interface ValidateKeyResponse {
  valid: boolean;
  models?: string[];
  error?: string;
}

export const api = {
  baseUrl: API_BASE_URL,

  /**
   * Stream chat responses from multiple models
   */
  async *streamChat(
    request: ChatRequest,
    apiKeys: Record<string, string>
  ): AsyncGenerator<ChatStreamChunk> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API keys as headers
    if (apiKeys.openai) headers['X-OpenAI-Key'] = apiKeys.openai;
    if (apiKeys.anthropic) headers['X-Anthropic-Key'] = apiKeys.anthropic;
    if (apiKeys.google) headers['X-Google-Key'] = apiKeys.google;
    if (apiKeys.groq) headers['X-Groq-Key'] = apiKeys.groq;

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const chunk: ChatStreamChunk = JSON.parse(data);
            yield chunk;
          } catch (error) {
            console.error('Failed to parse SSE data:', error);
          }
        }
      }
    }
  },

  /**
   * Validate an API key for a specific provider
   */
  async validateKey(request: ValidateKeyRequest): Promise<ValidateKeyResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/validate-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return await response.json();
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
