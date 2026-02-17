'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Settings, Wifi, WifiOff, Loader2, MessageSquare, Users, Github, Coffee } from 'lucide-react';
import { api, type Message, type ChatStreamChunk } from '@/lib/api';
import { storage } from '@/lib/storage';
import ModelSelector from './ModelSelector';
import SettingsModal from './SettingsModal';
import DebateView from './DebateView';
import Markdown from './Markdown';

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
type ViewMode = 'parallel' | 'debate';

export default function ChatInterface() {
  const [trialogueMessages, setTrialogueMessages] = useState<TrialogueMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [currentResponses, setCurrentResponses] = useState<Record<string, string>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('parallel');
  const [followUpTarget, setFollowUpTarget] = useState<string | null>(null); // Model to send follow-up to
  const [demoModels, setDemoModels] = useState<Record<string, boolean>>({}); // Track which models are using demo keys
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load saved models
    const savedModels = storage.getSelectedModels();
    if (savedModels.length > 0) {
      setSelectedModels(savedModels);
    }
  }, []);

  useEffect(() => {
    storage.setSelectedModels(selectedModels);
  }, [selectedModels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trialogueMessages, currentResponses]);

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
    const demoModelsMap: Record<string, boolean> = {};

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

        // Track if this model is using demo key
        if (chunk.is_demo) {
          demoModelsMap[chunk.model] = true;
        }

        if (chunk.error) {
          responsesMap[chunk.model] = `Error: ${chunk.error}`;
        } else if (!chunk.done) {
          responsesMap[chunk.model] += chunk.content;
        }

        setCurrentResponses({ ...responsesMap });
        setDemoModels({ ...demoModelsMap });
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

  // Get messages for a specific model in parallel view
  const getMessagesForModel = (model: string): TrialogueMessage[] => {
    return trialogueMessages.filter(
      msg => msg.role === 'user' || msg.model === model
    );
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Header */}
      <header className="border-b px-6 py-4" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              Trialogue
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: 'var(--muted-text)' }}>
                Chat with multiple AI models simultaneously
              </p>
              {connectionState !== 'idle' && (
                <div className="flex items-center gap-1 text-xs">
                  {connectionState === 'connecting' && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent)' }} />
                      <span style={{ color: 'var(--accent)' }}>Connecting...</span>
                    </>
                  )}
                  {connectionState === 'streaming' && (
                    <>
                      <Wifi className="w-3 h-3" style={{ color: 'var(--t-success)' }} />
                      <span style={{ color: 'var(--t-success)' }}>Streaming</span>
                    </>
                  )}
                  {connectionState === 'error' && (
                    <>
                      <WifiOff className="w-3 h-3" style={{ color: 'var(--t-danger)' }} />
                      <span style={{ color: 'var(--t-danger)' }} title={errorMessage}>
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
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--muted-text)' }}
              title="Support on Ko-fi"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Coffee className="w-5 h-5" />
            </a>

            {/* GitHub Repository Link */}
            <a
              href="https://github.com/datdiego/trialogue"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-sm"
              style={{ color: 'var(--muted-text)' }}
              title="Star on GitHub"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Github className="w-4 h-4" />
              <span className="hidden sm:inline">Star</span>
            </a>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--muted-text)' }}
              title="Settings"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <ModelSelector
            selectedModels={selectedModels}
            onChange={setSelectedModels}
          />

          {/* View Mode Selector */}
          {selectedModels.length > 0 && (
            <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--muted)' }}>
              <button
                onClick={() => setViewMode('parallel')}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
                style={
                  viewMode === 'parallel'
                    ? { background: 'var(--background)', color: 'var(--foreground)', boxShadow: '0 1px 3px var(--border)' }
                    : { color: 'var(--muted-text)' }
                }
                title="Parallel chat view"
              >
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Parallel
              </button>
              <button
                onClick={() => setViewMode('debate')}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
                style={
                  viewMode === 'debate'
                    ? { background: 'var(--background)', color: 'var(--foreground)', boxShadow: '0 1px 3px var(--border)' }
                    : { color: 'var(--muted-text)' }
                }
                title="Multi-round debate mode"
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
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--muted-text)' }}>
            <div className="text-center">
              <p className="text-lg mb-2">Select up to 3 models to start chatting</p>
              <p className="text-sm">Configure your API keys in Settings</p>
            </div>
          </div>
        ) : viewMode === 'debate' ? (
          // Debate View - Multi-round debate with independent answers, review, and consensus
          <DebateView
            selectedModels={selectedModels}
          />
        ) : (
          // Parallel View - Each model in its own column
          <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-y-auto">
            {selectedModels.map((model) => (
              <div
                key={model}
                className="rounded-lg border flex flex-col"
                style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
              >
                <div
                  className="px-4 py-3 border-b font-medium flex items-center justify-between"
                  style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                >
                  <div className="flex items-center gap-2">
                    <span>{model}</span>
                    {demoModels[model] && (
                      <span
                        className="px-1.5 py-0.5 text-white text-xs rounded uppercase font-semibold"
                        style={{ background: 'var(--t-highlight)' }}
                      >
                        DEMO
                      </span>
                    )}
                  </div>
                  {!isStreaming && (
                    <button
                      onClick={() => setFollowUpTarget(model)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={
                        followUpTarget === model
                          ? { background: 'var(--accent)', color: 'var(--background)' }
                          : { background: 'var(--muted)', color: 'var(--muted-text)', border: '1px solid var(--border)' }
                      }
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
                      className="rounded-lg p-3 text-sm"
                      style={
                        msg.role === 'user'
                          ? { background: 'color-mix(in srgb, var(--accent) 15%, var(--background))', color: 'var(--foreground)' }
                          : { background: 'var(--muted)', color: 'var(--foreground)' }
                      }
                    >
                      {msg.role === 'user' ? (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      ) : (
                        <Markdown content={msg.content} />
                      )}
                    </div>
                  ))}

                  {isStreaming && currentResponses[model] && (
                    <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                      <Markdown content={currentResponses[model]} />
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
      <div className="border-t px-6 py-4" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        {/* Follow-up indicator */}
        {followUpTarget && (
          <div
            className="mb-3 flex items-center justify-between rounded-lg px-4 py-2 border"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--background))', borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--background))' }}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                Sending follow-up to: <strong>{followUpTarget}</strong>
              </span>
            </div>
            <button
              onClick={() => setFollowUpTarget(null)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ background: 'color-mix(in srgb, var(--accent) 20%, var(--background))', color: 'var(--foreground)' }}
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
            className="flex-1 px-4 py-3 border rounded-lg resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border)' }}
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || selectedModels.length === 0 || isStreaming}
            className="px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--background)' }}
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
