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

  // Google
  { id: 'gemini/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
  { id: 'gemini/gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },

  // Groq (free)
  { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'Groq' },
  { id: 'groq/mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'Groq' },
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
      google: !!keys.google,
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
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded-full text-sm"
            >
              <span>{getModelName(modelId)}</span>
              {usingDemo && (
                <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded uppercase font-semibold">
                  DEMO
                </span>
              )}
              {hasKey && !usingDemo && (
                <span className="w-2 h-2 bg-green-500 rounded-full" title="Using your API key"></span>
              )}
              <button
                onClick={() => handleRemoveModel(modelId)}
                className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {selectedModels.length < 3 && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full text-sm hover:border-gray-400 dark:hover:border-gray-500"
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
          <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 max-h-96 overflow-y-auto">
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
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100'
                        : isDisabled
                        ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          {model.name}
                          {demoAvailable && (
                            <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded uppercase font-semibold">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          {hasKey ? (
                            <span className="w-2 h-2 bg-green-500 rounded-full" title="You have a key for this provider"></span>
                          ) : (
                            <span className="w-2 h-2 bg-red-500 rounded-full" title="No key provided"></span>
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
