import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Clip {
  id: string;
  parentId?: string;
  filePath: string;
  fileName: string;
  metadata: any;
  inTime: number;
  outTime: number;
  isSplit: boolean;
}

interface TimelineProps {
  currentFile: string | null;
  duration: number;
  inTime: number;
  outTime: number;
  playheadTime: number;
  onTimeUpdate: (inTime: number, outTime: number, playheadTime: number, skipHistory?: boolean) => void;
  clips?: Map<string, Clip>;
  activeClipId?: string | null;
}

function Timeline({ currentFile, duration, inTime, outTime, playheadTime, onTimeUpdate, clips, activeClipId }: TimelineProps) {
  const [isDragging, setIsDragging] = useState<'in' | 'out' | 'playhead' | null>(null);
  const [dragStartState, setDragStartState] = useState<{ inTime: number; outTime: number; playheadTime: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Pixel to time conversion
  const pixelToTime = (pixels: number): number => {
    const timelineWidth = timelineRef.current?.clientWidth || 1;
    return (pixels / timelineWidth) * duration / scale;
  };

  // Time to pixel conversion
  const timeToPixel = (time: number): number => {
    const timelineWidth = timelineRef.current?.clientWidth || 1;
    return (time / duration) * timelineWidth * scale;
  };

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x);

    if (isDragging === 'in') {
      const newInTime = Math.max(0, Math.min(time, outTime - 0.5));
      onTimeUpdate(newInTime, outTime, playheadTime, true); // skipHistory during drag
    } else if (isDragging === 'out') {
      const newOutTime = Math.min(duration, Math.max(time, inTime + 0.5));
      onTimeUpdate(inTime, newOutTime, playheadTime, true); // skipHistory during drag
    } else if (isDragging === 'playhead') {
      const clampedTime = Math.max(inTime, Math.min(time, outTime));
      onTimeUpdate(inTime, outTime, clampedTime, true); // skipHistory during drag
    }
  }, [isDragging, inTime, outTime, playheadTime, duration, onTimeUpdate]);

  useEffect(() => {
    if (isDragging) {
      // Save the state at the start of drag for history
      const startState = { inTime, outTime, playheadTime };
      
      window.addEventListener('mousemove', handleMouseMove);
      const handleMouseUp = () => {
        setIsDragging(null);
        setDragStartState(null);
        // Only now, add to history
        onTimeUpdate(inTime, outTime, playheadTime, false);
      };
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, inTime, outTime, playheadTime, onTimeUpdate]);

  if (!currentFile || duration === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a]">
          <h3 className="text-sm font-semibold text-white">Timeline</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">No video loaded</p>
        </div>
      </div>
    );
  }

  const clipStart = timeToPixel(inTime);
  const clipWidth = timeToPixel(outTime - inTime);
  const playheadX = timeToPixel(playheadTime);

  return (
    <div className="h-full flex flex-col">
      {/* Timeline Header with Zoom Controls */}
      <div className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a]">
        <h3 className="text-sm font-semibold text-white">Timeline</h3>
        <div className="flex items-center gap-4">
          {/* Keyboard shortcuts hint */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">⌘Z</kbd>
            <span>Undo</span>
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">⌘⇧Z</kbd>
            <span>Redo</span>
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">← →</kbd>
            <span>Scrub</span>
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">Space</kbd>
            <span>Play</span>
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">⌘T</kbd>
            <span>Split</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setScale(Math.min(2, scale + 0.1))}
              className="px-3 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs transition-colors"
            >
              +
            </button>
            <span className="text-xs text-gray-400 font-mono">Zoom: {scale.toFixed(1)}x</span>
            <button 
              onClick={() => setScale(Math.max(0.1, scale - 0.1))}
              className="px-3 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs transition-colors"
            >
              -
            </button>
          </div>
        </div>
      </div>

      {/* Time Ruler */}
      <div className="h-10 bg-[#252525] border-b border-[#3a3a3a] px-6 flex items-center">
        <div className="flex gap-8 text-xs text-gray-400 font-mono">
          <span>0s</span>
          <span>{duration > 5 ? '5s' : ''}</span>
          <span>{duration > 10 ? '10s' : ''}</span>
          <span>{duration > 15 ? '15s' : ''}</span>
          <span>{duration > 20 ? '20s' : ''}</span>
          <span>{duration > 25 ? '25s' : ''}</span>
          <span>{Math.ceil(duration)}s</span>
        </div>
      </div>

      {/* Timeline Tracks */}
      <div className="flex-1 p-4" ref={timelineRef}>
        <div className="w-full h-full bg-[#1a1a1a] rounded border border-[#2a2a2a] relative overflow-hidden">
          {/* Clip Bar */}
          <div
            className="absolute h-8 bg-blue-600 rounded"
            style={{
              left: `${clipStart}px`,
              width: `${clipWidth}px`,
              top: '50%',
              transform: 'translateY(-50%)'
            }}
          >
          {/* Start Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragStartState({ inTime, outTime, playheadTime });
              setIsDragging('in');
            }}
            className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize rounded-l"
          />

          {/* End Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragStartState({ inTime, outTime, playheadTime });
              setIsDragging('out');
            }}
            className="absolute right-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize rounded-r"
          />
          </div>

          {/* Playhead */}
          <div
            onMouseDown={() => {
              setDragStartState({ inTime, outTime, playheadTime });
              setIsDragging('playhead');
            }}
            className="absolute w-0.5 h-full bg-red-500 cursor-col-resize"
            style={{ left: `${playheadX}px` }}
          >
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
