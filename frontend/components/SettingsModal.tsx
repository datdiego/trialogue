'use client';

import { useState, useEffect } from 'react';
import { X, Key, Check, AlertCircle } from 'lucide-react';
import { storage, type ApiKeys } from '@/lib/storage';
import { api, type ValidateKeyResponse } from '@/lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = 'openai' | 'anthropic' | 'google' | 'groq';

const PROVIDERS: { id: Provider; name: string; placeholder: string }[] = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AI...' },
  { id: 'groq', name: 'Groq', placeholder: 'gsk_...' },
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [keys, setKeys] = useState<ApiKeys>({});
  const [validating, setValidating] = useState<Record<Provider, boolean>>({} as Record<Provider, boolean>);
  const [validation, setValidation] = useState<Record<Provider, ValidateKeyResponse | null>>({} as Record<Provider, ValidateKeyResponse | null>);

  useEffect(() => {
    if (isOpen) {
      setKeys(storage.getApiKeys());
    }
  }, [isOpen]);

  const handleKeyChange = (provider: Provider, value: string) => {
    setKeys({ ...keys, [provider]: value });
    setValidation({ ...validation, [provider]: null });
  };

  const handleSave = (provider: Provider) => {
    const key = keys[provider];
    if (key) {
      storage.setApiKey(provider, key);
    } else {
      storage.removeApiKey(provider);
    }
  };

  const handleValidate = async (provider: Provider) => {
    const key = keys[provider];
    if (!key) return;

    setValidating({ ...validating, [provider]: true });

    try {
      const result = await api.validateKey({ provider, key });
      setValidation({ ...validation, [provider]: result });

      if (result.valid) {
        handleSave(provider);
      }
    } catch (error) {
      setValidation({
        ...validation,
        [provider]: {
          valid: false,
          error: error instanceof Error ? error.message : 'Validation failed'
        }
      });
    } finally {
      setValidating({ ...validating, [provider]: false });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              API Key Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Enter your API keys to start chatting with AI models. Keys are stored locally in your browser.
          </p>

          <div className="space-y-6">
            {PROVIDERS.map((provider) => {
              const val = validation[provider.id];
              const isValidating = validating[provider.id];

              return (
                <div key={provider.id} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {provider.name}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={keys[provider.id] || ''}
                      onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                      placeholder={provider.placeholder}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => handleValidate(provider.id)}
                      disabled={!keys[provider.id] || isValidating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isValidating ? 'Validating...' : 'Validate'}
                    </button>
                  </div>

                  {val && (
                    <div className={`flex items-center gap-2 text-sm ${val.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {val.valid ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Valid - {val.models?.length || 0} models available</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          <span>{val.error || 'Invalid API key'}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
