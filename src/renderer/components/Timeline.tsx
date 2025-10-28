import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TimelineProps {
  currentFile: string | null;
  duration: number;
  inTime: number;
  outTime: number;
  playheadTime: number;
  onTimeUpdate: (inTime: number, outTime: number, playheadTime: number, skipHistory?: boolean) => void;
}

function Timeline({ currentFile, duration, inTime, outTime, playheadTime, onTimeUpdate }: TimelineProps) {
  const [isDragging, setIsDragging] = useState<'in' | 'out' | 'playhead' | 'clip' | null>(null);
  const [dragStartState, setDragStartState] = useState<{ inTime: number; outTime: number; playheadTime: number; clickOffset: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
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

  // Sync scroll between ruler and timeline
  const handleRulerScroll = useCallback(() => {
    if (scrollContainerRef.current && rulerRef.current) {
      scrollContainerRef.current.scrollLeft = rulerRef.current.scrollLeft;
    }
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (scrollContainerRef.current && rulerRef.current) {
      rulerRef.current.scrollLeft = scrollContainerRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const timeline = scrollContainerRef.current;
    if (timeline) {
      timeline.addEventListener('scroll', handleTimelineScroll);
      return () => timeline.removeEventListener('scroll', handleTimelineScroll);
    }
  }, [handleTimelineScroll]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollOffset;
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
    } else if (isDragging === 'clip' && dragStartState) {
      // Calculate the offset from the original position
      const clipDuration = dragStartState.outTime - dragStartState.inTime;
      
      // Calculate what time the mouse is pointing at
      const mouseTime = pixelToTime(x);
      
      // Calculate the new start position, accounting for the original click position within the clip
      const newInTime = Math.max(0, Math.min(mouseTime - dragStartState.clickOffset, duration - clipDuration));
      const newOutTime = newInTime + clipDuration;
      
      // Keep the playhead at its original position when moving the clip
      const newPlayheadTime = dragStartState.playheadTime;
      
      onTimeUpdate(newInTime, newOutTime, newPlayheadTime, true); // skipHistory during drag
    }
  }, [isDragging, inTime, outTime, playheadTime, duration, onTimeUpdate, dragStartState]);

  useEffect(() => {
    if (isDragging) {
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
  
  // Calculate the minimum width for the scrollable container
  const timelineWidth = timelineRef.current?.clientWidth || 1;
  const minWidth = Math.max(timelineWidth, timeToPixel(duration));

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
      <div 
        ref={rulerRef}
        className="h-10 bg-[#252525] border-b border-[#3a3a3a] relative overflow-x-auto overflow-y-hidden"
        style={{ minWidth: `${minWidth}px` }}
        onScroll={handleRulerScroll}
      >
        {(() => {
          // Calculate optimal time intervals based on zoom level
          const pixelsPerSecond = (timelineWidth / duration) * scale;
          let interval: number;
          
          if (pixelsPerSecond < 20) interval = 5; // Show every 5 seconds
          else if (pixelsPerSecond < 50) interval = 2; // Show every 2 seconds
          else if (pixelsPerSecond < 100) interval = 1; // Show every 1 second
          else if (pixelsPerSecond < 200) interval = 0.5; // Show every 0.5 seconds
          else interval = 0.25; // Show every 0.25 seconds
          
          const marks: Array<{ time: number; x: number; isMajor: boolean }> = [];
          for (let t = 0; t <= duration; t += interval) {
            const x = timeToPixel(t);
            marks.push({ time: t, x, isMajor: Math.floor(t) === t });
          }
          
          return (
            <>
              {/* Grid lines */}
              {marks.map((mark, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-[#333333]"
                  style={{ left: `${mark.x}px` }}
                />
              ))}
              
              {/* Time labels */}
              {marks.filter(m => m.isMajor || duration < 5).map((mark, i) => (
                <div
                  key={i}
                  className="absolute top-0 left-0 right-0 h-full flex items-center"
                  style={{ left: `${mark.x}px`, transform: 'translateX(-50%)' }}
                >
                  <span className="text-xs text-gray-400 font-mono px-1">
                    {mark.time % 1 === 0 ? `${mark.time.toFixed(0)}s` : `${mark.time.toFixed(2)}s`}
                  </span>
                </div>
              ))}
            </>
          );
        })()}
      </div>

      {/* Timeline Tracks */}
      <div className="flex-1 p-4" ref={timelineRef}>
        <div 
          ref={scrollContainerRef} 
          className="w-full h-full bg-[#1a1a1a] rounded border border-[#2a2a2a] relative overflow-x-auto overflow-y-hidden"
          style={{ minWidth: `${minWidth}px` }}
        >
          {/* Clip Bar */}
          <div
            className="h-8 bg-purple-900 rounded cursor-move"
            style={{
              position: 'absolute',
              left: `${clipStart}px`,
              width: `${clipWidth}px`,
              top: '50%',
              transform: 'translateY(-50%)'
            }}
            onMouseDown={(e) => {
              // Only start dragging if we didn't click on the handles or playhead
              const target = e.target as HTMLElement;
              const isHandle = target.closest('.cursor-ew-resize');
              const isPlayhead = target.closest('.cursor-col-resize');
              
              if (!isHandle && !isPlayhead) {
                e.stopPropagation();
                const rect = timelineRef.current?.getBoundingClientRect();
                if (rect) {
                  const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
                  const x = e.clientX - rect.left + scrollOffset;
                  const mouseTime = pixelToTime(x);
                  const clickOffset = mouseTime - inTime;
                  setDragStartState({ inTime, outTime, playheadTime, clickOffset });
                  setIsDragging('clip');
                }
              }
            }}
          >
          {/* Start Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragStartState({ inTime, outTime, playheadTime, clickOffset: 0 });
              setIsDragging('in');
            }}
            className="absolute left-0 top-0 bottom-0 w-3 bg-purple-700 hover:bg-purple-600 cursor-ew-resize rounded-l z-10"
            style={{ minWidth: '8px' }}
          />

          {/* End Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragStartState({ inTime, outTime, playheadTime, clickOffset: 0 });
              setIsDragging('out');
            }}
            className="absolute right-0 top-0 bottom-0 w-3 bg-purple-700 hover:bg-purple-600 cursor-ew-resize rounded-r z-10"
            style={{ minWidth: '8px' }}
          />
          </div>

          {/* Playhead */}
          <div
            onMouseDown={() => {
              setDragStartState({ inTime, outTime, playheadTime, clickOffset: 0 });
              setIsDragging('playhead');
            }}
            className="absolute w-0.5 h-full bg-red-500 cursor-col-resize z-20"
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
