'use client';

import { useState } from 'react';
import { Send, ChevronDown, ChevronUp, Loader2, Users, MessageSquare, GitCompare, CheckCircle2 } from 'lucide-react';
import { api, type DebateRound } from '@/lib/api';
import { storage } from '@/lib/storage';

interface DebateViewProps {
  selectedModels: string[];
  darkMode: boolean;
}

type DebateState = 'idle' | 'round1' | 'round2' | 'round3' | 'complete' | 'error';

interface RoundResponses {
  [model: string]: string;
}

export default function DebateView({ selectedModels, darkMode }: DebateViewProps) {
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

  const getModelColor = (index: number) => {
    const colors = [
      'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700',
      'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700',
      'bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700',
    ];
    return colors[index % colors.length];
  };

  const getModelTextColor = (index: number) => {
    const colors = [
      'text-purple-900 dark:text-purple-100',
      'text-green-900 dark:text-green-100',
      'text-orange-900 dark:text-orange-100',
    ];
    return colors[index % colors.length];
  };

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
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        {!hasStarted ? (
          <>
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Multi-Round Debate
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Models will answer independently, review each other's responses, and generate a consensus
              </p>
            </div>

            <div className="flex gap-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask a question to start a debate between models..."
                disabled={selectedModels.length < 2 || isStreaming}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                rows={3}
              />
              <button
                onClick={handleStartDebate}
                disabled={!question.trim() || selectedModels.length < 2 || isStreaming}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-5 h-5" />
                Start Debate
              </button>
            </div>

            {selectedModels.length < 2 && (
              <div className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                Select at least 2 models to start a debate
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              {isStreaming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Round {currentRound} of 3
                  </span>
                </>
              ) : state === 'complete' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
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
              className="ml-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
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
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-900 dark:text-red-100 text-sm">{errorMessage}</p>
            </div>
          )}

          {hasStarted && (
            <>
              {/* Question Display */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Debate Question:
                </div>
                <div className="text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                  {question}
                </div>
              </div>

              {/* Round 1: Independent Answers */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => toggleSection('round1')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-750 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {getRoundIcon(1, currentRound === 1)}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Round 1: Independent Answers
                    </span>
                    {Object.keys(round1Responses).length > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        {Object.keys(round1Responses).length}/{selectedModels.length}
                      </span>
                    )}
                  </div>
                  {expandedSections.round1 ? (
                    <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  )}
                </button>

                {expandedSections.round1 && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedModels.map((model, idx) => (
                      <div
                        key={model}
                        className={`rounded-lg border p-4 ${getModelColor(idx)}`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`font-medium ${getModelTextColor(idx)}`}>
                            {model}
                          </span>
                          {demoModels[model] && (
                            <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded uppercase font-semibold">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className={`text-sm ${getModelTextColor(idx)} whitespace-pre-wrap`}>
                          {round1Responses[model] || currentBuffers[model] || (
                            <span className="text-gray-500 dark:text-gray-400 italic">
                              Waiting for response...
                            </span>
                          )}
                          {currentRound === 1 && currentBuffers[model] && (
                            <span className="animate-pulse">▋</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Round 2: Review & Critique */}
              {(Object.keys(round2Responses).length > 0 || currentRound >= 2) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => toggleSection('round2')}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-750 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {getRoundIcon(2, currentRound === 2)}
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Round 2: Review & Critique
                      </span>
                      {Object.keys(round2Responses).length > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                          {Object.keys(round2Responses).length}/{selectedModels.length}
                        </span>
                      )}
                    </div>
                    {expandedSections.round2 ? (
                      <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </button>

                  {expandedSections.round2 && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedModels.map((model, idx) => (
                        <div
                          key={model}
                          className={`rounded-lg border p-4 ${getModelColor(idx)}`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`font-medium ${getModelTextColor(idx)}`}>
                              {model}
                            </span>
                            {demoModels[model] && (
                              <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded uppercase font-semibold">
                                DEMO
                              </span>
                            )}
                          </div>
                          <div className={`text-sm ${getModelTextColor(idx)} whitespace-pre-wrap`}>
                            {round2Responses[model] || (currentRound === 2 && currentBuffers[model]) || (
                              <span className="text-gray-500 dark:text-gray-400 italic">
                                Waiting for review...
                              </span>
                            )}
                            {currentRound === 2 && currentBuffers[model] && (
                              <span className="animate-pulse">▋</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Round 3: Consensus */}
              {(Object.keys(round3Responses).length > 0 || currentRound >= 3) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-green-300 dark:border-green-700 overflow-hidden">
                  <button
                    onClick={() => toggleSection('round3')}
                    className="w-full px-4 py-3 bg-green-50 dark:bg-green-900/20 flex items-center justify-between hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {getRoundIcon(3, currentRound === 3)}
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Round 3: Consensus Summary
                      </span>
                      {Object.keys(round3Responses).length > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                          {Object.keys(round3Responses).length}/{selectedModels.length}
                        </span>
                      )}
                    </div>
                    {expandedSections.round3 ? (
                      <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </button>

                  {expandedSections.round3 && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedModels.map((model, idx) => (
                        <div
                          key={model}
                          className={`rounded-lg border p-4 ${getModelColor(idx)}`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`font-medium ${getModelTextColor(idx)}`}>
                              {model}
                            </span>
                            {demoModels[model] && (
                              <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded uppercase font-semibold">
                                DEMO
                              </span>
                            )}
                          </div>
                          <div className={`text-sm ${getModelTextColor(idx)} whitespace-pre-wrap`}>
                            {round3Responses[model] || (currentRound === 3 && currentBuffers[model]) || (
                              <span className="text-gray-500 dark:text-gray-400 italic">
                                Waiting for consensus...
                              </span>
                            )}
                            {currentRound === 3 && currentBuffers[model] && (
                              <span className="animate-pulse">▋</span>
                            )}
                          </div>
                        </div>
                      ))}
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
