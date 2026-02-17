'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';

interface ModelSelectorProps {
  selectedModels: string[];
  onChange: (models: string[]) => void;
}

const AVAILABLE_MODELS = [
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },

  // Anthropic
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic' },

  // Groq (free)
  { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'Groq' },
  { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'Groq' },
  { id: 'groq/moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct', provider: 'Groq' },
  { id: 'groq/openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'Groq' },
  { id: 'groq/qwen/qwen-3-32b', name: 'Qwen3 32B', provider: 'Groq' },
];

export default function ModelSelector({ selectedModels, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [demoModels, setDemoModels] = useState<string[]>([]);
  const [userKeys, setUserKeys] = useState<Record<string, boolean>>({});

  // Fetch demo models and user keys on mount
  useEffect(() => {
    // Fetch available demo models
    api.fetchDemoModels().then((response) => {
      setDemoModels(response.models.map((m) => m.id));
    });

    // Check which providers have user keys
    const keys = storage.getApiKeys();
    setUserKeys({
      openai: !!keys.openai,
      anthropic: !!keys.anthropic,
      groq: !!keys.groq,
    });
  }, []);

  const handleToggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      onChange(selectedModels.filter((m) => m !== modelId));
    } else if (selectedModels.length < 3) {
      onChange([...selectedModels, modelId]);
    }
  };

  const handleRemoveModel = (modelId: string) => {
    onChange(selectedModels.filter((m) => m !== modelId));
  };

  const getModelName = (modelId: string) => {
    return AVAILABLE_MODELS.find((m) => m.id === modelId)?.name || modelId;
  };

  const getModelProvider = (modelId: string) => {
    return AVAILABLE_MODELS.find((m) => m.id === modelId)?.provider || '';
  };

  const hasUserKey = (modelId: string) => {
    const provider = getModelProvider(modelId).toLowerCase();
    return userKeys[provider] || false;
  };

  const isDemoAvailable = (modelId: string) => {
    return demoModels.includes(modelId);
  };

  const isUsingDemo = (modelId: string) => {
    return !hasUserKey(modelId) && isDemoAvailable(modelId);
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedModels.map((modelId) => {
          const usingDemo = isUsingDemo(modelId);
          const hasKey = hasUserKey(modelId);

          return (
            <div
              key={modelId}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, var(--background))', color: 'var(--foreground)' }}
            >
              <span>{getModelName(modelId)}</span>
              {usingDemo && (
                <span
                  className="px-1.5 py-0.5 text-white text-xs rounded uppercase font-semibold"
                  style={{ background: 'var(--t-highlight)' }}
                >
                  DEMO
                </span>
              )}
              {hasKey && !usingDemo && (
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--t-success)' }} title="Using your API key"></span>
              )}
              <button
                onClick={() => handleRemoveModel(modelId)}
                className="rounded-full p-0.5 transition-colors"
                style={{ color: 'var(--muted-text)' }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {selectedModels.length < 3 && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-dashed rounded-full text-sm transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-text)' }}
          >
            <span>Add Model</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="absolute top-full left-0 mt-2 w-80 rounded-lg shadow-lg border z-20 max-h-96 overflow-y-auto"
            style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
          >
            <div className="p-2">
              {AVAILABLE_MODELS.map((model) => {
                const isSelected = selectedModels.includes(model.id);
                const isDisabled = !isSelected && selectedModels.length >= 3;
                const hasKey = hasUserKey(model.id);
                const demoAvailable = isDemoAvailable(model.id);

                return (
                  <button
                    key={model.id}
                    onClick={() => !isDisabled && handleToggleModel(model.id)}
                    disabled={isDisabled}
                    className="w-full text-left px-3 py-2 rounded-md transition-colors"
                    style={
                      isSelected
                        ? { background: 'color-mix(in srgb, var(--accent) 15%, var(--background))', color: 'var(--foreground)' }
                        : isDisabled
                        ? { color: 'var(--muted-text)', cursor: 'not-allowed', opacity: 0.5 }
                        : { color: 'var(--foreground)' }
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          {model.name}
                          {demoAvailable && (
                            <span
                              className="px-1.5 py-0.5 text-white text-xs rounded uppercase font-semibold"
                              style={{ background: 'var(--t-highlight)' }}
                            >
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-xs flex items-center gap-1" style={{ color: 'var(--muted-text)' }}>
                          {hasKey ? (
                            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--t-success)' }} title="You have a key for this provider"></span>
                          ) : (
                            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--t-danger)' }} title="No key provided"></span>
                          )}
                          {model.provider}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
