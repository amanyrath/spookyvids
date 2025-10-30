import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isThinking?: boolean;
  toolCalls?: Array<{
    name: string;
    status: 'pending' | 'executing' | 'completed' | 'error';
    result?: string;
  }>;
}

interface AgentPanelProps {
  onSendMessage?: (message: string) => Promise<void>;
  isProcessing?: boolean;
}

function AgentPanel({ 
  onSendMessage,
  isProcessing = false
}: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Greetings, mortal! I am your ghoulish creative partner. Tell me what frightful effects you wish to add to your video, and I shall conjure up the perfect spooky atmosphere...',
      timestamp: Date.now(),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [localProcessing, setLocalProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const isInitialMountRef = useRef<boolean>(true);

  // Auto-scroll to bottom when messages update (only when new messages are added, not on initial mount)
  useEffect(() => {
    // Skip scroll on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    // Only scroll if messages actually increased (new message added)
    if (messages.length > prevMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages]);

  // Listen for AI responses from main process
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleAgentResponse = (event: any, data: any) => {
      console.log('Agent response received:', data);
      
      if (data.type === 'message') {
        // Add assistant message
        const newMessage: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: data.content,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, newMessage]);
        setLocalProcessing(false);
      } else if (data.type === 'thinking') {
        // Show thinking indicator
        setMessages(prev => {
          const filtered = prev.filter(m => !m.isThinking);
          return [...filtered, {
            id: `thinking-${Date.now()}`,
            role: 'assistant',
            content: data.content || 'Thinking...',
            timestamp: Date.now(),
            isThinking: true,
          }];
        });
      } else if (data.type === 'tool_call') {
        // Show tool execution status
        setMessages(prev => {
          const filtered = prev.filter(m => !m.isThinking);
          return [...filtered, {
            id: `tool-${Date.now()}`,
            role: 'system',
            content: data.content,
            timestamp: Date.now(),
          }];
        });
      } else if (data.type === 'error') {
        // Show error message
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${data.content}`,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setLocalProcessing(false);
      }
    };

    // Setup listener
    const cleanup = (window.electronAPI as any).onAgentResponse?.(handleAgentResponse);
    
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const handleSend = async () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || localProcessing || isProcessing) return;

    // Add user message to chat
    const userMessage: Message = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      content: trimmedValue,
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLocalProcessing(true);

    // Send to AI agent
    if (onSendMessage) {
      try {
        await onSendMessage(trimmedValue);
      } catch (error) {
        console.error('Error sending message:', error);
        setLocalProcessing(false);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'system',
          content: 'Failed to send message to AI agent.',
          timestamp: Date.now(),
        }]);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const quickSuggestions = [
    { text: 'Add ghosts', type: 'ghost' },
    { text: 'Add tombstones', type: 'tombstone' },
    { text: 'Add monsters', type: 'monster' },
    { text: 'Make it more frightful', type: null },
  ];

  const handleQuickSuggestion = async (suggestion: { text: string; type: string | null }) => {
    // For asset-related suggestions, send a message that prioritizes existing assets
    if (suggestion.type && onSendMessage) {
      try {
        // Send message that instructs AI to check assets folder first
        const message = `Use existing ${suggestion.type} assets from the assets folder. If none exist in the folder, search for and download one. Add the ${suggestion.type} to the first clip.`;
        
        // Add user message to chat immediately
        const userMessage: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'user',
          content: message,
          timestamp: Date.now(),
        };
        
        setMessages(prev => [...prev, userMessage]);
        setLocalProcessing(true);
        
        // Send to AI agent via App.tsx (which will include timeline clips)
        await onSendMessage(message);
        return;
      } catch (error) {
        console.error('Error with quick suggestion:', error);
        setLocalProcessing(false);
        // Fall through to regular input if API fails
        setInputValue(suggestion.text);
        inputRef.current?.focus();
        return;
      }
    }
    
    // For non-asset suggestions, just set the input
    setInputValue(suggestion.text);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] overflow-hidden">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-purple-900 text-white'
                  : message.role === 'system'
                  ? 'bg-[#2a2a2a] text-gray-400 text-sm'
                  : 'bg-[#2a2a2a] text-white'
              } ${message.isThinking ? 'animate-pulse' : ''}`}
            >
              {message.role === 'assistant' && !message.isThinking && (
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                  <span className="text-xs font-semibold text-purple-400">Ghoulish Agent</span>
                </div>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              {!message.isThinking && (
                <p className="text-xs text-gray-500 mt-1">{formatTimestamp(message.timestamp)}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions - Show only if no messages from user yet */}
      {messages.filter(m => m.role === 'user').length === 0 && (
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">Try asking:</p>
          <div className="grid grid-cols-1 gap-2">
            {quickSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleQuickSuggestion(suggestion)}
                className="text-left text-xs px-3 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded transition-colors text-gray-300"
              >
                {suggestion.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-[#3a3a3a] p-4 flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what frightful effects you want..."
            disabled={localProcessing || isProcessing}
            className="flex-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || localProcessing || isProcessing}
            className="px-4 py-2 bg-purple-900 hover:bg-purple-800 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {localProcessing || isProcessing ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Thinking</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span>Send</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

export default AgentPanel;

