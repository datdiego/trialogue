'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Settings, Moon, Sun, Wifi, WifiOff, Loader2, MessageSquare, GitCompare, Users, Github, Coffee } from 'lucide-react';
import { api, type Message, type ChatStreamChunk } from '@/lib/api';
import { storage } from '@/lib/storage';
import ModelSelector from './ModelSelector';
import SettingsModal from './SettingsModal';
import DebateView from './DebateView';

interface ModelResponse {
  model: string;
  content: string;
  done: boolean;
  error?: string;
}

// Enhanced message structure that tracks which model responded
interface TrialogueMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string; // For assistant messages, which model generated it
  timestamp: number;
  parentId?: string; // For threading/follow-ups
}

type ConnectionState = 'idle' | 'connecting' | 'streaming' | 'error';
type ViewMode = 'parallel' | 'comparison' | 'debate';

export default function ChatInterface() {
  const [trialogueMessages, setTrialogueMessages] = useState<TrialogueMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [currentResponses, setCurrentResponses] = useState<Record<string, string>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('parallel');
  const [followUpTarget, setFollowUpTarget] = useState<string | null>(null); // Model to send follow-up to
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
  }, [trialogueMessages, currentResponses]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    storage.setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
  };

  const handleSend = async () => {
    if (!input.trim() || selectedModels.length === 0 || isStreaming) return;

    // Generate unique ID for the user message
    const userMessageId = `msg-${Date.now()}`;
    const userMessage: TrialogueMessage = {
      id: userMessageId,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    // Add user message
    const updatedMessages = [...trialogueMessages, userMessage];
    setTrialogueMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    setCurrentResponses({});
    setConnectionState('connecting');
    setErrorMessage('');

    const apiKeysRaw = storage.getApiKeys();
    const apiKeys: Record<string, string> = Object.fromEntries(
      Object.entries(apiKeysRaw).filter(([_, v]) => v !== undefined) as [string, string][]
    );
    const responsesMap: Record<string, string> = {};

    // Determine which models to query
    const targetModels = followUpTarget ? [followUpTarget] : selectedModels;

    // Build conversation history for API
    const apiMessages: Message[] = buildApiMessages(updatedMessages, followUpTarget);

    try {
      setConnectionState('streaming');

      for await (const chunk of api.streamChat(
        {
          messages: apiMessages,
          models: targetModels,
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

      // Add assistant responses as trialogue messages
      const assistantMessages: TrialogueMessage[] = targetModels.map((model) => ({
        id: `msg-${Date.now()}-${model}`,
        role: 'assistant',
        content: responsesMap[model] || 'No response',
        model: model,
        timestamp: Date.now(),
        parentId: userMessageId,
      }));

      setTrialogueMessages([...updatedMessages, ...assistantMessages]);
      setCurrentResponses({});
      setConnectionState('idle');
      setFollowUpTarget(null); // Reset follow-up target
    } catch (error) {
      console.error('Chat error:', error);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(errorMsg);
      setConnectionState('error');

      // Add error messages
      const errorMessages: TrialogueMessage[] = targetModels.map((model) => ({
        id: `msg-${Date.now()}-${model}-error`,
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        model: model,
        timestamp: Date.now(),
        parentId: userMessageId,
      }));
      setTrialogueMessages([...updatedMessages, ...errorMessages]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Build API messages from trialogue messages
  const buildApiMessages = (messages: TrialogueMessage[], targetModel: string | null): Message[] => {
    if (!targetModel) {
      // For parallel queries, include all messages
      return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // For follow-ups, include only messages from user and target model
    return messages
      .filter(msg => msg.role === 'user' || msg.model === targetModel)
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
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

  // Get messages for a specific model in parallel view
  const getMessagesForModel = (model: string): TrialogueMessage[] => {
    return trialogueMessages.filter(
      msg => msg.role === 'user' || msg.model === model
    );
  };

  // Get the last user message
  const getLastUserMessage = (): TrialogueMessage | null => {
    for (let i = trialogueMessages.length - 1; i >= 0; i--) {
      if (trialogueMessages[i].role === 'user') {
        return trialogueMessages[i];
      }
    }
    return null;
  };

  // Get assistant responses for the last user message
  const getLastResponses = (): TrialogueMessage[] => {
    const lastUserMsg = getLastUserMessage();
    if (!lastUserMsg) return [];

    return trialogueMessages.filter(
      msg => msg.role === 'assistant' && msg.parentId === lastUserMsg.id
    );
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
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Chat with multiple AI models simultaneously
              </p>
              {connectionState !== 'idle' && (
                <div className="flex items-center gap-1 text-xs">
                  {connectionState === 'connecting' && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                      <span className="text-blue-500">Connecting...</span>
                    </>
                  )}
                  {connectionState === 'streaming' && (
                    <>
                      <Wifi className="w-3 h-3 text-green-500" />
                      <span className="text-green-500">Streaming</span>
                    </>
                  )}
                  {connectionState === 'error' && (
                    <>
                      <WifiOff className="w-3 h-3 text-red-500" />
                      <span className="text-red-500" title={errorMessage}>
                        Connection Error
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Ko-fi Donation Button */}
            <a
              href="https://ko-fi.com/datdiego"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Support on Ko-fi"
            >
              <Coffee className="w-5 h-5 text-gray-700 dark:text-gray-300 hover:text-orange-500 dark:hover:text-orange-400" />
            </a>

            {/* GitHub Repository Link */}
            <a
              href="https://github.com/datdiego/trialogue"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm"
              title="Star on GitHub"
            >
              <Github className="w-4 h-4 text-gray-700 dark:text-gray-300" />
              <span className="text-gray-700 dark:text-gray-300 hidden sm:inline">Star</span>
            </a>

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

        <div className="mt-4 flex items-center gap-4">
          <ModelSelector
            selectedModels={selectedModels}
            onChange={setSelectedModels}
          />

          {/* View Mode Selector */}
          {selectedModels.length > 0 && trialogueMessages.length > 0 && (
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('parallel')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'parallel'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title="Parallel view"
              >
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Parallel
              </button>
              <button
                onClick={() => setViewMode('comparison')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'comparison'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title="Comparison view"
              >
                <GitCompare className="w-4 h-4 inline mr-1" />
                Compare
              </button>
              <button
                onClick={() => setViewMode('debate')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'debate'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title="Debate view"
              >
                <Users className="w-4 h-4 inline mr-1" />
                Debate
              </button>
            </div>
          )}
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
        ) : viewMode === 'debate' ? (
          // Debate View - Threaded conversation view
          <DebateView
            messages={trialogueMessages}
            selectedModels={selectedModels}
            onAskModel={(model, question) => {
              setFollowUpTarget(model);
              setInput(question);
              setViewMode('parallel');
            }}
            darkMode={darkMode}
          />
        ) : viewMode === 'parallel' ? (
          // Parallel View - Each model in its own column
          <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-y-auto">
            {selectedModels.map((model) => (
              <div
                key={model}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col"
              >
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 font-medium text-gray-900 dark:text-gray-100 flex items-center justify-between">
                  <span>{model}</span>
                  {!isStreaming && (
                    <button
                      onClick={() => setFollowUpTarget(model)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        followUpTarget === model
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                      title="Ask follow-up to this model only"
                    >
                      {followUpTarget === model ? 'Follow-up active' : 'Follow-up'}
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {getMessagesForModel(model).map((msg) => (
                    <div
                      key={msg.id}
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
        ) : (
          // Comparison View - Side-by-side comparison of last responses
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* User Question */}
              {getLastUserMessage() && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Question:
                  </div>
                  <div className="text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                    {getLastUserMessage()?.content}
                  </div>
                </div>
              )}

              {/* Model Responses Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getLastResponses().map((response) => (
                  <div
                    key={response.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col"
                  >
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                      <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {response.model}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(response.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex-1 p-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                        {response.content}
                      </div>
                    </div>
                    {!isStreaming && (
                      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => {
                            setFollowUpTarget(response.model || null);
                            setViewMode('parallel');
                          }}
                          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors w-full"
                        >
                          Ask Follow-up
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming responses in comparison view */}
                {isStreaming && Object.entries(currentResponses).map(([model, content]) => (
                  <div
                    key={model}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col"
                  >
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 font-medium text-gray-900 dark:text-gray-100">
                      {model}
                    </div>
                    <div className="flex-1 p-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                        {content}
                        <span className="animate-pulse">▋</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        {/* Follow-up indicator */}
        {followUpTarget && (
          <div className="mb-3 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-900 dark:text-blue-100">
                Sending follow-up to: <strong>{followUpTarget}</strong>
              </span>
            </div>
            <button
              onClick={() => setFollowUpTarget(null)}
              className="text-xs px-2 py-1 bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 rounded hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              followUpTarget
                ? `Ask a follow-up question to ${followUpTarget}...`
                : selectedModels.length > 0
                ? "Type your message..."
                : "Select models first..."
            }
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
            {followUpTarget ? 'Follow-up' : 'Send'}
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
