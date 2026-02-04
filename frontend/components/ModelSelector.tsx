'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface ModelSelectorProps {
  selectedModels: string[];
  onChange: (models: string[]) => void;
}

const AVAILABLE_MODELS = [
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },

  // Anthropic
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic' },

  // Google
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'Google' },

  // Groq
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'Groq' },
  { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', provider: 'Groq' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'Groq' },
];

export default function ModelSelector({ selectedModels, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedModels.map((modelId) => (
          <div
            key={modelId}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded-full text-sm"
          >
            <span>{getModelName(modelId)}</span>
            <button
              onClick={() => handleRemoveModel(modelId)}
              className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

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
                    <div className="font-medium">{model.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {model.provider}
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
