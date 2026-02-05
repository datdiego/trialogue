/**
 * Backend API Client
 * Handles communication with the FastAPI backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, 5xx errors, rate limits)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true; // Network error
  }
  if (error instanceof Error && error.message.includes('HTTP 429')) {
    return true; // Rate limit
  }
  if (error instanceof Error && error.message.match(/HTTP 5\d\d/)) {
    return true; // Server error
  }
  return false;
}

/**
 * Retry wrapper for async operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown;
  let delayMs = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === RETRY_CONFIG.maxRetries || !isRetryableError(error)) {
        break;
      }

      console.warn(
        `${context} failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delayMs}ms...`,
        error
      );

      await sleep(delayMs);
      delayMs = Math.min(delayMs * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
    }
  }

  throw lastError;
}

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

    // Use retry logic for the initial connection
    const response = await withRetry(async () => {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...request, stream: true }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return res;
    }, 'Chat API request');

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
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
    } finally {
      reader.releaseLock();
    }
  },

  /**
   * Validate an API key for a specific provider
   */
  async validateKey(request: ValidateKeyRequest): Promise<ValidateKeyResponse> {
    try {
      return await withRetry(async () => {
        const response = await fetch(`${API_BASE_URL}/api/validate-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }

        return await response.json();
      }, 'API key validation');
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
