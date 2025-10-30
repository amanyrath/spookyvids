import React, { memo } from 'react';

interface TranscriptWord {
  start: number;
  end: number;
  text: string;
  isFiller?: boolean;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
}

interface Transcript {
  segments: TranscriptSegment[];
  fullText: string;
  duration: number;
  fillerWords: TranscriptWord[];
  silences: SilenceSegment[];
  summary: {
    fillerWordCount: number;
    totalSilenceDuration: number;
  };
}

interface TranscriptionPanelProps {
  transcript: Transcript | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate?: () => void;
  onWordClick?: (timestamp: number) => void;
}

function TranscriptionPanel({ 
  transcript, 
  isGenerating, 
  error, 
  onGenerate,
  onWordClick 
}: TranscriptionPanelProps) {
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Loading state
  if (isGenerating) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm text-gray-400">Transcribing video...</p>
        <p className="text-xs text-gray-500 mt-2">This may take a minute</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-red-400 text-center">{error}</p>
        {onGenerate && (
          <button 
            onClick={onGenerate}
            className="mt-4 px-4 py-2 bg-purple-900 hover:bg-purple-800 rounded text-sm transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (!transcript) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-gray-400 text-center mb-2">No transcript available</p>
        <p className="text-xs text-gray-500 text-center mb-4">
          Add clips to the timeline, then click Transcribe to generate a transcript
        </p>
        {onGenerate && (
          <button 
            onClick={onGenerate}
            className="px-4 py-2 bg-purple-900 hover:bg-purple-800 rounded text-sm transition-colors"
          >
            Generate Transcript
          </button>
        )}
      </div>
    );
  }

  // Transcript display
  return (
    <div className="flex flex-col h-full">
      {/* Summary Stats */}
      <div className="px-4 py-3 bg-[#1a1a1a] border-b border-[#3a3a3a]">
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Summary</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Filler Words:</span>
            <span className="ml-1 text-white font-medium">{transcript.summary.fillerWordCount}</span>
          </div>
          <div>
            <span className="text-gray-500">Silence:</span>
            <span className="ml-1 text-white font-medium">{formatDuration(transcript.summary.totalSilenceDuration)}</span>
          </div>
        </div>
      </div>

      {/* Transcript Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcript.segments.map((segment, segmentIndex) => (
          <div key={segmentIndex} className="space-y-1">
            {/* Timestamp */}
            <button
              onClick={() => onWordClick?.(segment.start)}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-mono"
            >
              {formatTime(segment.start)}
            </button>
            
            {/* Words */}
            <div className="text-sm leading-relaxed">
              {segment.words.map((word, wordIndex) => (
                <span key={wordIndex}>
                  <button
                    onClick={() => onWordClick?.(word.start)}
                    className={`hover:bg-[#2a2a2a] rounded px-0.5 transition-colors ${
                      word.isFiller 
                        ? 'text-gray-500 italic' 
                        : 'text-white'
                    }`}
                    title={word.isFiller ? 'Filler word' : formatTime(word.start)}
                  >
                    {word.text}
                  </button>
                  {wordIndex < segment.words.length - 1 && ' '}
                </span>
              ))}
            </div>
            
            {/* Show silence indicator if there's a significant pause after this segment */}
            {transcript.silences.some(s => 
              Math.abs(s.start - segment.end) < 0.1 && s.duration > 0.5
            ) && (
              <div className="text-xs text-gray-600 italic flex items-center gap-1 pl-2">
                <span>⋯</span>
                <span>pause</span>
                <span>({formatDuration(
                  transcript.silences.find(s => Math.abs(s.start - segment.end) < 0.1)?.duration || 0
                )})</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filler Words Legend */}
      {transcript.summary.fillerWordCount > 0 && (
        <div className="px-4 py-3 bg-[#1a1a1a] border-t border-[#3a3a3a]">
          <p className="text-xs text-gray-500">
            <span className="text-gray-500 italic">Grayed italic text</span> indicates filler words
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(TranscriptionPanel);

