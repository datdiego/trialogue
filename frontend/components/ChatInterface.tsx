'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Settings, Moon, Sun } from 'lucide-react';
import { api, type Message, type ChatStreamChunk } from '@/lib/api';
import { storage } from '@/lib/storage';
import ModelSelector from './ModelSelector';
import SettingsModal from './SettingsModal';

interface ModelResponse {
  model: string;
  content: string;
  done: boolean;
  error?: string;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [currentResponses, setCurrentResponses] = useState<Record<string, string>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load saved models
    const savedModels = storage.getSelectedModels();
    if (savedModels.length > 0) {
      setSelectedModels(savedModels);
    }

    // Load dark mode preference
    const savedDarkMode = storage.getDarkMode();
    if (savedDarkMode !== null) {
      setDarkMode(savedDarkMode);
      document.documentElement.classList.toggle('dark', savedDarkMode);
    } else {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  useEffect(() => {
    storage.setSelectedModels(selectedModels);
  }, [selectedModels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponses]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    storage.setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
  };

  const handleSend = async () => {
    if (!input.trim() || selectedModels.length === 0 || isStreaming) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setCurrentResponses({});

    const apiKeysRaw = storage.getApiKeys();
    const apiKeys: Record<string, string> = Object.fromEntries(
      Object.entries(apiKeysRaw).filter(([_, v]) => v !== undefined) as [string, string][]
    );
    const responsesMap: Record<string, string> = {};

    try {
      for await (const chunk of api.streamChat(
        {
          messages: newMessages,
          models: selectedModels,
          stream: true,
        },
        apiKeys
      )) {
        if (!responsesMap[chunk.model]) {
          responsesMap[chunk.model] = '';
        }

        if (chunk.error) {
          responsesMap[chunk.model] = `Error: ${chunk.error}`;
        } else if (!chunk.done) {
          responsesMap[chunk.model] += chunk.content;
        }

        setCurrentResponses({ ...responsesMap });
      }

      // Add assistant responses to messages
      const assistantMessages: Message[] = selectedModels.map((model) => ({
        role: 'assistant',
        content: responsesMap[model] || 'No response',
      }));

      setMessages([...newMessages, ...assistantMessages]);
      setCurrentResponses({});
    } catch (error) {
      console.error('Chat error:', error);
      // Add error messages
      const errorMessages: Message[] = selectedModels.map(() => ({
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
      setMessages([...newMessages, ...errorMessages]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getModelName = (index: number) => {
    return selectedModels[index] || `Model ${index + 1}`;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Trialogue
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Chat with multiple AI models simultaneously
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              ) : (
                <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              )}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <ModelSelector
            selectedModels={selectedModels}
            onChange={setSelectedModels}
          />
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden">
        {selectedModels.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">Select up to 3 models to start chatting</p>
              <p className="text-sm">Configure your API keys in Settings</p>
            </div>
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-y-auto">
            {selectedModels.map((model, index) => (
              <div
                key={model}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col"
              >
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 font-medium text-gray-900 dark:text-gray-100">
                  {model}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages
                    .filter((_, i) => i % (selectedModels.length + 1) === 0 || (i % (selectedModels.length + 1)) === index + 1)
                    .map((msg, msgIndex) => (
                      <div
                        key={msgIndex}
                        className={`${
                          msg.role === 'user'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                        } rounded-lg p-3 text-sm whitespace-pre-wrap`}
                      >
                        {msg.content}
                      </div>
                    ))}

                  {isStreaming && currentResponses[model] && (
                    <div className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-3 text-sm whitespace-pre-wrap">
                      {currentResponses[model]}
                      <span className="animate-pulse">▋</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={selectedModels.length > 0 ? "Type your message..." : "Select models first..."}
            disabled={selectedModels.length === 0 || isStreaming}
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || selectedModels.length === 0 || isStreaming}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            Send
          </button>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
