'use client';

import { useState } from 'react';
import { Send, ChevronDown, ChevronUp, Loader2, Users, MessageSquare, GitCompare, CheckCircle2 } from 'lucide-react';
import { api, type DebateRound } from '@/lib/api';
import { storage } from '@/lib/storage';
import Markdown from './Markdown';

interface DebateViewProps {
  selectedModels: string[];
}

type DebateState = 'idle' | 'round1' | 'round2' | 'round3' | 'complete' | 'error';

interface RoundResponses {
  [model: string]: string;
}

// Per-model accent colors using CSS variables — no hardcoded hex
const MODEL_ACCENTS = [
  { bg: 'color-mix(in srgb, var(--secondary) 15%, var(--background))', border: 'color-mix(in srgb, var(--secondary) 30%, var(--background))', text: 'var(--foreground)' },
  { bg: 'color-mix(in srgb, var(--t-success) 12%, var(--background))', border: 'color-mix(in srgb, var(--t-success) 25%, var(--background))', text: 'var(--foreground)' },
  { bg: 'color-mix(in srgb, var(--t-highlight) 12%, var(--background))', border: 'color-mix(in srgb, var(--t-highlight) 25%, var(--background))', text: 'var(--foreground)' },
];

export default function DebateView({ selectedModels }: DebateViewProps) {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<DebateState>('idle');
  const [currentRound, setCurrentRound] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Responses for each round
  const [round1Responses, setRound1Responses] = useState<RoundResponses>({});
  const [round2Responses, setRound2Responses] = useState<RoundResponses>({});
  const [round3Responses, setRound3Responses] = useState<RoundResponses>({});

  // Current streaming buffers
  const [currentBuffers, setCurrentBuffers] = useState<RoundResponses>({});

  // Collapsible section state
  const [expandedSections, setExpandedSections] = useState({
    round1: true,
    round2: true,
    round3: true,
  });

  // Track which models are using demo keys
  const [demoModels, setDemoModels] = useState<Record<string, boolean>>({});

  const handleStartDebate = async () => {
    if (!question.trim() || selectedModels.length < 2) return;

    // Reset state
    setRound1Responses({});
    setRound2Responses({});
    setRound3Responses({});
    setCurrentBuffers({});
    setDemoModels({});
    setErrorMessage('');
    setState('round1');
    setCurrentRound(1);

    const apiKeysRaw = storage.getApiKeys();
    const apiKeys: Record<string, string> = Object.fromEntries(
      Object.entries(apiKeysRaw).filter(([_, v]) => v !== undefined) as [string, string][]
    );

    try {
      const round1Map: RoundResponses = {};
      const round2Map: RoundResponses = {};
      const round3Map: RoundResponses = {};
      const buffers: RoundResponses = {};
      const demoMap: Record<string, boolean> = {};

      for await (const chunk of api.streamDebate(
        {
          question: question.trim(),
          models: selectedModels,
          temperature: 0.7,
          max_tokens: 1000,
        },
        apiKeys
      )) {
        // Track demo models
        if (chunk.is_demo) {
          demoMap[chunk.model] = true;
        }

        // Update state based on round
        if (chunk.round === 1 && state !== 'round1') {
          setState('round1');
          setCurrentRound(1);
        } else if (chunk.round === 2 && state !== 'round2') {
          setState('round2');
          setCurrentRound(2);
        } else if (chunk.round === 3 && state !== 'round3') {
          setState('round3');
          setCurrentRound(3);
        }

        if (chunk.error) {
          setErrorMessage(chunk.error);
          setState('error');
          break;
        }

        // Initialize buffer if needed
        if (!buffers[chunk.model]) {
          buffers[chunk.model] = '';
        }

        // Update buffer
        if (!chunk.done) {
          buffers[chunk.model] += chunk.content;
          setCurrentBuffers({ ...buffers });
        } else {
          // Move to completed responses
          if (chunk.round === 1) {
            round1Map[chunk.model] = buffers[chunk.model];
            setRound1Responses({ ...round1Map });
          } else if (chunk.round === 2) {
            round2Map[chunk.model] = buffers[chunk.model];
            setRound2Responses({ ...round2Map });
          } else if (chunk.round === 3) {
            round3Map[chunk.model] = buffers[chunk.model];
            setRound3Responses({ ...round3Map });
          }
          buffers[chunk.model] = '';
          setCurrentBuffers({ ...buffers });
        }

        setDemoModels({ ...demoMap });
      }

      setState('complete');
      setCurrentRound(0);
    } catch (error) {
      console.error('Debate error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setState('error');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartDebate();
    }
  };

  const toggleSection = (section: 'round1' | 'round2' | 'round3') => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

  const getModelAccent = (index: number) => MODEL_ACCENTS[index % MODEL_ACCENTS.length];

  const getRoundIcon = (round: number, active: boolean) => {
    if (round === 1) return <MessageSquare className={`w-5 h-5 ${active ? 'animate-pulse' : ''}`} />;
    if (round === 2) return <GitCompare className={`w-5 h-5 ${active ? 'animate-pulse' : ''}`} />;
    if (round === 3) return <Users className={`w-5 h-5 ${active ? 'animate-pulse' : ''}`} />;
    return null;
  };

  const isStreaming = state === 'round1' || state === 'round2' || state === 'round3';
  const hasStarted = state !== 'idle';

  return (
    <div className="h-full flex flex-col">
      {/* Input Area */}
      <div className="border-b px-6 py-4" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        {!hasStarted ? (
          <>
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                Multi-Round Debate
              </h2>
              <p className="text-sm" style={{ color: 'var(--muted-text)' }}>
                Models will answer independently, review each other&apos;s responses, and generate a consensus
              </p>
            </div>

            <div className="flex gap-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask a question to start a debate between models..."
                disabled={selectedModels.length < 2 || isStreaming}
                className="flex-1 px-4 py-3 border rounded-lg resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border)' }}
                rows={3}
              />
              <button
                onClick={handleStartDebate}
                disabled={!question.trim() || selectedModels.length < 2 || isStreaming}
                className="px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                style={{ background: 'var(--accent)', color: 'var(--background)' }}
              >
                <Send className="w-5 h-5" />
                Start Debate
              </button>
            </div>

            {selectedModels.length < 2 && (
              <div className="mt-2 text-sm" style={{ color: 'var(--t-highlight)' }}>
                Select at least 2 models to start a debate
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border"
              style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--background))', borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--background))' }}
            >
              {isStreaming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Round {currentRound} of 3
                  </span>
                </>
              ) : state === 'complete' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--t-success)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Debate Complete
                  </span>
                </>
              ) : null}
            </div>
            <button
              onClick={() => {
                setState('idle');
                setQuestion('');
                setRound1Responses({});
                setRound2Responses({});
                setRound3Responses({});
                setCurrentBuffers({});
              }}
              className="ml-4 text-sm transition-colors"
              style={{ color: 'var(--muted-text)' }}
            >
              Start New Debate
            </button>
          </div>
        )}
      </div>

      {/* Debate Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {errorMessage && (
            <div
              className="rounded-lg p-4 border"
              style={{ background: 'color-mix(in srgb, var(--t-danger) 10%, var(--background))', borderColor: 'color-mix(in srgb, var(--t-danger) 25%, var(--background))' }}
            >
              <p className="text-sm" style={{ color: 'var(--t-danger)' }}>{errorMessage}</p>
            </div>
          )}

          {hasStarted && (
            <>
              {/* Question Display */}
              <div
                className="rounded-lg p-4 border"
                style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--background))', borderColor: 'color-mix(in srgb, var(--accent) 25%, var(--background))' }}
              >
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--accent)' }}>
                  Debate Question:
                </div>
                <div className="whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>
                  {question}
                </div>
              </div>

              {/* Round 1: Independent Answers */}
              <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                <button
                  onClick={() => toggleSection('round1')}
                  className="w-full px-4 py-3 flex items-center justify-between transition-colors"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--muted) 70%, var(--border))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--muted)')}
                >
                  <div className="flex items-center gap-2">
                    {getRoundIcon(1, currentRound === 1)}
                    <span className="font-medium">Round 1: Independent Answers</span>
                    {Object.keys(round1Responses).length > 0 && (
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'color-mix(in srgb, var(--t-success) 15%, var(--background))', color: 'var(--t-success)' }}
                      >
                        {Object.keys(round1Responses).length}/{selectedModels.length}
                      </span>
                    )}
                  </div>
                  {expandedSections.round1 ? (
                    <ChevronUp className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
                  ) : (
                    <ChevronDown className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
                  )}
                </button>

                {expandedSections.round1 && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedModels.map((model, idx) => {
                      const accent = getModelAccent(idx);
                      return (
                        <div
                          key={model}
                          className="rounded-lg border p-4"
                          style={{ background: accent.bg, borderColor: accent.border }}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span className="font-medium" style={{ color: accent.text }}>
                              {model}
                            </span>
                            {demoModels[model] && (
                              <span
                                className="px-1.5 py-0.5 text-white text-xs rounded uppercase font-semibold"
                                style={{ background: 'var(--t-highlight)' }}
                              >
                                DEMO
                              </span>
                            )}
                          </div>
                          <div className="text-sm" style={{ color: accent.text }}>
                            {round1Responses[model] ? (
                              <Markdown content={round1Responses[model]} />
                            ) : currentBuffers[model] ? (
                              <>
                                <Markdown content={currentBuffers[model]} />
                                {currentRound === 1 && <span className="animate-pulse">▋</span>}
                              </>
                            ) : (
                              <span className="italic" style={{ color: 'var(--muted-text)' }}>
                                Waiting for response...
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Round 2: Review & Critique */}
              {(Object.keys(round2Responses).length > 0 || currentRound >= 2) && (
                <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => toggleSection('round2')}
                    className="w-full px-4 py-3 flex items-center justify-between transition-colors"
                    style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--muted) 70%, var(--border))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--muted)')}
                  >
                    <div className="flex items-center gap-2">
                      {getRoundIcon(2, currentRound === 2)}
                      <span className="font-medium">Round 2: Review & Critique</span>
                      {Object.keys(round2Responses).length > 0 && (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: 'color-mix(in srgb, var(--t-success) 15%, var(--background))', color: 'var(--t-success)' }}
                        >
                          {Object.keys(round2Responses).length}/{selectedModels.length}
                        </span>
                      )}
                    </div>
                    {expandedSections.round2 ? (
                      <ChevronUp className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
                    ) : (
                      <ChevronDown className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
                    )}
                  </button>

                  {expandedSections.round2 && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedModels.map((model, idx) => {
                        const accent = getModelAccent(idx);
                        return (
                          <div
                            key={model}
                            className="rounded-lg border p-4"
                            style={{ background: accent.bg, borderColor: accent.border }}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="font-medium" style={{ color: accent.text }}>
                                {model}
                              </span>
                              {demoModels[model] && (
                                <span
                                  className="px-1.5 py-0.5 text-white text-xs rounded uppercase font-semibold"
                                  style={{ background: 'var(--t-highlight)' }}
                                >
                                  DEMO
                                </span>
                              )}
                            </div>
                            <div className="text-sm" style={{ color: accent.text }}>
                              {round2Responses[model] ? (
                                <Markdown content={round2Responses[model]} />
                              ) : (currentRound === 2 && currentBuffers[model]) ? (
                                <>
                                  <Markdown content={currentBuffers[model]} />
                                  <span className="animate-pulse">▋</span>
                                </>
                              ) : (
                                <span className="italic" style={{ color: 'var(--muted-text)' }}>
                                  Waiting for review...
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Round 3: Consensus */}
              {(Object.keys(round3Responses).length > 0 || currentRound >= 3) && (
                <div
                  className="rounded-lg border-2 overflow-hidden"
                  style={{ background: 'var(--background)', borderColor: 'color-mix(in srgb, var(--t-success) 40%, var(--background))' }}
                >
                  <button
                    onClick={() => toggleSection('round3')}
                    className="w-full px-4 py-3 flex items-center justify-between transition-colors"
                    style={{ background: 'color-mix(in srgb, var(--t-success) 10%, var(--background))', color: 'var(--foreground)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--t-success) 18%, var(--background))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--t-success) 10%, var(--background))')}
                  >
                    <div className="flex items-center gap-2">
                      {getRoundIcon(3, currentRound === 3)}
                      <span className="font-medium">Round 3: Consensus Summary</span>
                      {Object.keys(round3Responses).length > 0 && (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: 'color-mix(in srgb, var(--t-success) 15%, var(--background))', color: 'var(--t-success)' }}
                        >
                          {Object.keys(round3Responses).length}/{selectedModels.length}
                        </span>
                      )}
                    </div>
                    {expandedSections.round3 ? (
                      <ChevronUp className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
                    ) : (
                      <ChevronDown className="w-5 h-5" style={{ color: 'var(--muted-text)' }} />
                    )}
                  </button>

                  {expandedSections.round3 && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedModels.map((model, idx) => {
                        const accent = getModelAccent(idx);
                        return (
                          <div
                            key={model}
                            className="rounded-lg border p-4"
                            style={{ background: accent.bg, borderColor: accent.border }}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="font-medium" style={{ color: accent.text }}>
                                {model}
                              </span>
                              {demoModels[model] && (
                                <span
                                  className="px-1.5 py-0.5 text-white text-xs rounded uppercase font-semibold"
                                  style={{ background: 'var(--t-highlight)' }}
                                >
                                  DEMO
                                </span>
                              )}
                            </div>
                            <div className="text-sm" style={{ color: accent.text }}>
                              {round3Responses[model] ? (
                                <Markdown content={round3Responses[model]} />
                              ) : (currentRound === 3 && currentBuffers[model]) ? (
                                <>
                                  <Markdown content={currentBuffers[model]} />
                                  <span className="animate-pulse">▋</span>
                                </>
                              ) : (
                                <span className="italic" style={{ color: 'var(--muted-text)' }}>
                                  Waiting for consensus...
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
