'use client';

import { useState, useEffect } from 'react';
import { X, Key, Check, AlertCircle } from 'lucide-react';
import { storage, type ApiKeys } from '@/lib/storage';
import { api, type ValidateKeyResponse } from '@/lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = 'openai' | 'anthropic' | 'groq';

const PROVIDERS: { id: Provider; name: string; placeholder: string }[] = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
              API Key Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--muted-text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
          {/* Security Warning */}
          <div
            className="mb-4 p-3 rounded border"
            style={{
              background: 'color-mix(in srgb, var(--t-highlight) 10%, var(--background))',
              borderColor: 'color-mix(in srgb, var(--t-highlight) 30%, var(--background))',
            }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
              ⚠️ Security Notice
            </p>
            <p className="text-sm" style={{ color: 'var(--muted-text)' }}>
              API keys are stored locally in your browser. Only use trusted devices.
              Never share your screen while keys are visible.
            </p>
          </div>

          <p className="text-sm mb-6" style={{ color: 'var(--muted-text)' }}>
            Enter your API keys to start chatting with AI models. Keys are stored locally in your browser.
          </p>

          <div className="space-y-6">
            {PROVIDERS.map((provider) => {
              const val = validation[provider.id];
              const isValidating = validating[provider.id];

              return (
                <div key={provider.id} className="space-y-2">
                  <label className="block text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {provider.name}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={keys[provider.id] || ''}
                      onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                      placeholder={provider.placeholder}
                      className="flex-1 px-3 py-2 border rounded-md"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)', borderColor: 'var(--border)' }}
                    />
                    <button
                      onClick={() => handleValidate(provider.id)}
                      disabled={!keys[provider.id] || isValidating}
                      className="px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'var(--accent)', color: 'var(--background)' }}
                    >
                      {isValidating ? 'Validating...' : 'Validate'}
                    </button>
                  </div>

                  {val && (
                    <div
                      className="flex items-center gap-2 text-sm"
                      style={{ color: val.valid ? 'var(--t-success)' : 'var(--t-danger)' }}
                    >
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
        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md transition-colors"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--muted) 70%, var(--border))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--muted)')}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
