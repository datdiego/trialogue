'use client';

import { MessageSquare } from 'lucide-react';

interface TrialogueMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  parentId?: string;
}

interface DebateViewProps {
  messages: TrialogueMessage[];
  selectedModels: string[];
  onAskModel: (model: string, question: string) => void;
  darkMode: boolean;
}

export default function DebateView({
  messages,
  selectedModels,
  onAskModel,
  darkMode,
}: DebateViewProps) {
  // Group messages by conversation thread
  const getConversationThreads = () => {
    const threads: { [key: string]: TrialogueMessage[] } = {};

    messages.forEach((msg) => {
      if (msg.role === 'user') {
        threads[msg.id] = [msg];
      } else if (msg.parentId && threads[msg.parentId]) {
        threads[msg.parentId].push(msg);
      }
    });

    return Object.values(threads);
  };

  const threads = getConversationThreads();

  const getModelColor = (model?: string) => {
    if (!model) return 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700';

    // Generate consistent colors for models
    const colors = [
      'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700',
      'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700',
      'bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700',
    ];

    const index = selectedModels.indexOf(model);
    return colors[index % colors.length];
  };

  const getModelTextColor = (model?: string) => {
    if (!model) return 'text-blue-900 dark:text-blue-100';

    const colors = [
      'text-purple-900 dark:text-purple-100',
      'text-green-900 dark:text-green-100',
      'text-orange-900 dark:text-orange-100',
    ];

    const index = selectedModels.indexOf(model);
    return colors[index % colors.length];
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Debate View
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            View conversation threads showing how models respond to each other
          </p>
        </div>

        {threads.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-12">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No conversation threads yet. Start by asking a question!</p>
          </div>
        ) : (
          threads.map((thread, threadIdx) => (
            <div
              key={thread[0].id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Thread Header */}
              <div className="bg-gray-50 dark:bg-gray-750 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Thread {threadIdx + 1}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(thread[0].timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Thread Messages */}
              <div className="p-4 space-y-4">
                {thread.map((msg, msgIdx) => (
                  <div key={msg.id} className="flex gap-3">
                    {/* Avatar/Icon */}
                    <div className="flex-shrink-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : getModelColor(msg.model)
                        }`}
                      >
                        {msg.role === 'user'
                          ? 'U'
                          : msg.model?.substring(0, 1).toUpperCase()}
                      </div>
                    </div>

                    {/* Message Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {msg.role === 'user' ? 'You' : msg.model}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div
                        className={`rounded-lg border p-3 text-sm whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-gray-900 dark:text-gray-100'
                            : `${getModelColor(msg.model)} ${getModelTextColor(msg.model)}`
                        }`}
                      >
                        {msg.content}
                      </div>

                      {/* Quick Actions for Assistant Messages */}
                      {msg.role === 'assistant' && msgIdx === thread.length - 1 && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => {
                              // Find other models in this thread to ask them about this response
                              const otherModels = selectedModels.filter(
                                (m) => m !== msg.model
                              );
                              if (otherModels.length > 0) {
                                const question = `What do you think about ${msg.model}'s response: "${msg.content.substring(0, 100)}..."`;
                                onAskModel(otherModels[0], question);
                              }
                            }}
                            className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                          >
                            Get other opinions
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
