import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TimelineClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata: any;
  startTime: number;
  duration: number;
  inTime: number;
  outTime: number;
}

interface DragData {
  clipId?: string;
  originalStartTime?: number;
  newStartTime?: number;
  insertIndex?: number;
}

interface TimelineProps {
  timelineClips: TimelineClip[];
  focusedClipId: string | null;
  playheadTime: number;
  onClipTrimUpdate: (clipId: string, inTime: number, outTime: number, skipHistory?: boolean) => void;
  onClipFocus: (clipId: string | null) => void;
  onPlayheadUpdate: (time: number) => void;
  onClipReorder: (newClips: TimelineClip[]) => void;
  onClipDrop: (filePath: string, fileName: string, metadata: any, insertIndex?: number) => void;
}

function Timeline({ 
  timelineClips, 
  focusedClipId, 
  playheadTime, 
  onClipTrimUpdate, 
  onClipFocus, 
  onPlayheadUpdate, 
  onClipReorder, 
  onClipDrop 
}: TimelineProps) {
  const [isDragging, setIsDragging] = useState<'in' | 'out' | 'playhead' | 'clip' | null>(null);
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [, forceUpdate] = useState(0); // For forcing re-renders during trim drag
  
  // Store trim values during drag to avoid constant state updates
  const trimDragRef = useRef<{ clipId: string; inTime: number; outTime: number } | null>(null);
  
  // Store the initial mouse offset when starting a drag to prevent "jumping"
  const dragOffsetRef = useRef<number>(0);


  // Calculate total duration
  const totalDuration = timelineClips.length > 0
    ? timelineClips[timelineClips.length - 1].startTime + 
      (timelineClips[timelineClips.length - 1].outTime - timelineClips[timelineClips.length - 1].inTime)
    : 0;

  // Pixel to time conversion
  const pixelToTime = (pixels: number): number => {
    const timelineWidth = timelineRef.current?.clientWidth || 1;
    if (totalDuration === 0) return 0;
    return (pixels / timelineWidth) * totalDuration / scale;
  };

  // Time to pixel conversion
  const timeToPixel = (time: number): number => {
    const timelineWidth = timelineRef.current?.clientWidth || 1;
    if (totalDuration === 0) return 0;
    return (time / totalDuration) * timelineWidth * scale;
  };

  // Handle drop from media library
  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const data = e.dataTransfer.getData('application/json');
      
      if (data) {
        const clipData = JSON.parse(data);
        
        // Determine insertion position
        const rect = timelineRef.current?.getBoundingClientRect();
        
        if (rect) {
          const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
          const x = e.clientX - rect.left + scrollOffset;
          const dropTime = pixelToTime(x);
          
          // Find insertion index based on drop time
          let insertIndex = timelineClips.length;
          for (let i = 0; i < timelineClips.length; i++) {
            if (dropTime < timelineClips[i].startTime) {
              insertIndex = i;
              break;
            }
          }
          
          onClipDrop(clipData.filePath, clipData.fileName, clipData.metadata, insertIndex);
      } else {
        // Call with no insert index (add to end)
          onClipDrop(clipData.filePath, clipData.fileName, clipData.metadata);
        }
      }
    } catch (error) {
      console.error(error);
    }
    
    setDropIndicatorPosition(null);
  };

  const handleTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    
    // Show drop indicator
    const rect = timelineRef.current?.getBoundingClientRect();
    if (rect) {
      const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
      const x = e.clientX - rect.left + scrollOffset;
      const dropTime = pixelToTime(x);
      
      // Find insertion position
      let insertIndex = timelineClips.length;
      for (let i = 0; i < timelineClips.length; i++) {
        if (dropTime < timelineClips[i].startTime) {
          insertIndex = i;
          break;
        }
      }
      
      setDropIndicatorPosition(insertIndex);
    }
  };

  const handleTimelineDragLeave = () => {
    setDropIndicatorPosition(null);
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
    if (!isDragging || !timelineRef.current || !dragData) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollOffset;
    const timelineTime = pixelToTime(x) - dragOffsetRef.current; // Apply offset

    if (isDragging === 'playhead') {
      const clampedTime = Math.max(0, Math.min(timelineTime, totalDuration));
      onPlayheadUpdate(clampedTime);
    } else if (isDragging === 'clip' && dragData?.clipId) {
      // Dragging entire clip to reposition
      const draggedClip = timelineClips.find(c => c.id === dragData.clipId);
      if (draggedClip) {
        const newStartTime = Math.max(0, timelineTime);
        
        // Calculate what the insertion index would be
        const otherClips = timelineClips.filter(c => c.id !== dragData.clipId);
        let insertIndex = 0;
        for (let i = 0; i < otherClips.length; i++) {
          const clipMiddle = otherClips[i].startTime + (otherClips[i].outTime - otherClips[i].inTime) / 2;
          if (newStartTime > clipMiddle) {
            insertIndex = i + 1;
          } else {
            break;
          }
        }
        
        // Calculate where this clip would actually be placed (sequentially)
        let calculatedStartTime = 0;
        for (let i = 0; i < insertIndex; i++) {
          calculatedStartTime += (otherClips[i].outTime - otherClips[i].inTime);
        }
        
        // Store both the raw mouse position and the calculated snap position
        setDragData(prev => ({ ...prev, newStartTime: calculatedStartTime, insertIndex }));
        forceUpdate(n => n + 1); // Force re-render for visual feedback
      }
    } else if (isDragging === 'in' && dragData.clipId) {
      // Dragging start trim handle (LEFT) - adjust inTime
      const clip = timelineClips.find(c => c.id === dragData.clipId);
      if (clip && clip.metadata?.duration) {
        // Calculate how much of the source video to show from the mouse position
        const offsetFromClipStart = timelineTime - clip.startTime;
        
        // The new inTime is the source video time at this offset
        const newInTime = clip.inTime + offsetFromClipStart;
        
        // Clamp to valid range
        const clampedInTime = Math.max(0, Math.min(newInTime, clip.outTime - 0.5, clip.metadata.duration - 0.5));
        
        // Store in ref instead of updating state
        trimDragRef.current = { clipId: dragData.clipId, inTime: clampedInTime, outTime: clip.outTime };
        // Force re-render to show visual feedback
        forceUpdate(n => n + 1);
      }
    } else if (isDragging === 'out' && dragData.clipId) {
      // Dragging end trim handle (RIGHT) - adjust outTime, keep START position fixed
      const clip = timelineClips.find(c => c.id === dragData.clipId);
      if (clip && clip.metadata?.duration) {
        // The new duration is from clip start to mouse position
        const newDuration = timelineTime - clip.startTime;
        
        // Calculate new outTime
        const newOutTime = clip.inTime + newDuration;
        
        // Clamp to valid range
        const clampedOutTime = Math.max(0.5, Math.min(newOutTime, clip.metadata.duration));
        const finalOutTime = Math.max(clampedOutTime, clip.inTime + 0.5);
        
        // Store in ref instead of updating state
        trimDragRef.current = { clipId: dragData.clipId, inTime: clip.inTime, outTime: finalOutTime };
        // Force re-render to show visual feedback
        forceUpdate(n => n + 1);
      }
    }
  }, [isDragging, totalDuration, onPlayheadUpdate, pixelToTime, dragData, timelineClips, onClipTrimUpdate]);

  useEffect(() => {
    if (isDragging) {
      // Prevent default drag behavior and text selection
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging === 'playhead' ? 'col-resize' : isDragging === 'clip' ? 'move' : 'ew-resize';
      
      window.addEventListener('mousemove', handleMouseMove);
      const handleMouseUp = () => {
        // Apply trim values from ref to state when drag ends
        if ((isDragging === 'in' || isDragging === 'out') && trimDragRef.current) {
          console.log('Applying trim on mouse up:', trimDragRef.current);
          onClipTrimUpdate(
            trimDragRef.current.clipId, 
            trimDragRef.current.inTime, 
            trimDragRef.current.outTime, 
            false // Add to history
          );
          trimDragRef.current = null;
        }
        
        // Apply clip repositioning when drag ends
        if (isDragging === 'clip' && dragData?.clipId && dragData?.newStartTime !== undefined) {
          console.log('Applying clip reposition on mouse up:', dragData);
          
          // Find the clip being dragged
          const draggedClipIndex = timelineClips.findIndex(c => c.id === dragData.clipId);
          const draggedClip = timelineClips[draggedClipIndex];
          
          if (draggedClip) {
            // Remove the dragged clip from the array
            const otherClips = timelineClips.filter(c => c.id !== dragData.clipId);
            
            // Find insertion index based on the new start time
            let insertIndex = 0;
            for (let i = 0; i < otherClips.length; i++) {
              const clipMiddle = otherClips[i].startTime + (otherClips[i].outTime - otherClips[i].inTime) / 2;
              if (dragData.newStartTime > clipMiddle) {
                insertIndex = i + 1;
              } else {
                break;
              }
            }
            
            // Insert clip at new position
            const reorderedClips = [
              ...otherClips.slice(0, insertIndex),
              draggedClip,
              ...otherClips.slice(insertIndex)
            ];
            
            // Recalculate startTime for all clips sequentially (no overlaps, no gaps)
            let currentTime = 0;
            const finalClips = reorderedClips.map(clip => {
              const updatedClip = { ...clip, startTime: currentTime };
              currentTime += (clip.outTime - clip.inTime);
              return updatedClip;
            });
            
            console.log('Reordered clips:', finalClips);
            onClipReorder(finalClips);
          }
        }
        
        setIsDragging(null);
        setDragData(null);
        dragOffsetRef.current = 0; // Clear offset
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      window.addEventListener('mouseup', handleMouseUp);
      
      // Prevent scrolling during drag
      const preventScroll = (e: WheelEvent) => {
        e.preventDefault();
      };
      window.addEventListener('wheel', preventScroll, { passive: false });
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('wheel', preventScroll);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, handleMouseMove]);

  if (timelineClips.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a]">
          <h3 className="text-sm font-semibold text-white">Timeline</h3>
        </div>
        <div 
          className="flex-1 flex items-center justify-center"
          onDrop={handleTimelineDrop}
          onDragOver={handleTimelineDragOver}
          onDragLeave={handleTimelineDragLeave}
        >
          <p className="text-gray-500 text-sm">Drag clips here to start editing</p>
        </div>
      </div>
    );
  }

  const playheadX = timeToPixel(playheadTime);
  
  // Calculate the minimum width for the scrollable container
  const timelineWidth = timelineRef.current?.clientWidth || 1;
  const minWidth = Math.max(timelineWidth, timeToPixel(totalDuration));

  return (
    <div 
      className="h-full flex flex-col"
      onWheel={(e) => {
        // Block ALL wheel zoom behaviors on the entire timeline component
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {/* Timeline Header with Zoom Controls */}
      <div 
        className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a]"
        onWheel={(e) => {
          // Prevent zoom in header
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
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
          const pixelsPerSecond = (timelineWidth / totalDuration) * scale;
          let interval: number;
          
          if (pixelsPerSecond < 20) interval = 5;
          else if (pixelsPerSecond < 50) interval = 2;
          else if (pixelsPerSecond < 100) interval = 1;
          else if (pixelsPerSecond < 200) interval = 0.5;
          else interval = 0.25;
          
          const marks: Array<{ time: number; x: number; isMajor: boolean }> = [];
          for (let t = 0; t <= totalDuration; t += interval) {
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
              {marks.filter(m => m.isMajor || totalDuration < 5).map((mark, i) => (
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
          className="w-full h-full bg-[#1a1a1a] rounded border border-[#2a2a2a] relative overflow-x-auto overflow-y-hidden select-none"
          style={{ 
            minWidth: `${minWidth}px`,
            touchAction: 'pan-x' // Only allow horizontal panning, no zoom
          }}
          onDrop={handleTimelineDrop}
          onDragOver={handleTimelineDragOver}
          onDragLeave={handleTimelineDragLeave}
          onWheel={(e) => {
            // Completely block all wheel events when dragging
            if (isDragging) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Also prevent zoom on scroll wheel (Ctrl+Wheel or pinch)
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onMouseDown={(e) => {
            // Prevent any default drag/zoom behavior
            if (isDragging) {
              e.preventDefault();
            }
          }}
        >
          {/* Render clips */}
          {timelineClips.map((clip, clipIndex) => {
            // Check if this clip is being dragged to a new position
            const isBeingDragged = isDragging === 'clip' && dragData?.clipId === clip.id && dragData?.newStartTime !== undefined;
            
            // Use temp values from ref if this clip is being trimmed
            const isTrimming = trimDragRef.current?.clipId === clip.id;
            const displayInTime = isTrimming ? trimDragRef.current!.inTime : clip.inTime;
            const displayOutTime = isTrimming ? trimDragRef.current!.outTime : clip.outTime;
            const displayDuration = displayOutTime - displayInTime;
            
            // Calculate display startTime
            let displayStartTime = clip.startTime;
            
            // If dragging to new position, use the drag position
            if (isBeingDragged && dragData.newStartTime !== undefined) {
              displayStartTime = dragData.newStartTime;
            }
            // If trimming, show the clip with adjusted position (shrink from left)
            else if (isTrimming && isDragging === 'in') {
              // When trimming from left, the left edge moves right
              const oldDuration = clip.outTime - clip.inTime;
              const durationChange = oldDuration - displayDuration;
              displayStartTime = clip.startTime + durationChange;
            }
            
            const clipStartX = timeToPixel(displayStartTime);
            const clipWidth = timeToPixel(displayDuration);
            const isFocused = clip.id === focusedClipId;
            
            return (
              <React.Fragment key={clip.id}>
                {/* Drop indicator */}
                {dropIndicatorPosition === clipIndex && (
                  <div
                    className="absolute w-1 h-full bg-purple-500 z-30"
                    style={{ left: `${clipStartX}px`, top: 0 }}
                  />
                )}
                
          {/* Clip Bar */}
          <div
                  className={`absolute h-8 rounded cursor-move transition-colors ${
                    isFocused ? 'bg-purple-700 border-2 border-purple-400' : 'bg-purple-900 border border-purple-700'
                  }`}
            style={{
                    left: `${clipStartX}px`,
              width: `${clipWidth}px`,
              top: '50%',
              transform: 'translateY(-50%)'
            }}
                  onClick={() => onClipFocus(clip.id)}
            onMouseDown={(e) => {
                    // Only drag if clicking on the clip body, not the handles
              const target = e.target as HTMLElement;
                    if (target.classList.contains('cursor-ew-resize')) {
                      return; // Let the trim handle handle it
                    }
              
                e.stopPropagation();
                    e.preventDefault();
                    console.log('Clip body clicked for drag:', clip.id);
                    
                    // Calculate offset: distance from mouse to the clip's start position
                    if (timelineRef.current) {
                      const rect = timelineRef.current.getBoundingClientRect();
                  const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
                      const mouseX = e.clientX - rect.left + scrollOffset;
                      const mouseTime = pixelToTime(mouseX);
                      dragOffsetRef.current = mouseTime - clip.startTime;
                      console.log('Clip drag offset:', { mouseTime, clipStartTime: clip.startTime, offset: dragOffsetRef.current });
                    }
                    
                    setDragData({ clipId: clip.id, originalStartTime: clip.startTime });
                  setIsDragging('clip');
                  }}
                >
                  <div className="px-2 py-1 h-full flex items-center">
                    <span className="text-xs text-white truncate">{clip.fileName}</span>
                  </div>
                  
                  {/* Trim handles (only for focused clip) */}
                  {isFocused && (
                    <>
          {/* Start Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
                          e.preventDefault();
                          console.log('Start handle clicked for clip:', clip.id);
                          
                          // Calculate offset: distance from mouse to the LEFT edge (adjusted start position)
                          if (timelineRef.current) {
                            const rect = timelineRef.current.getBoundingClientRect();
                            const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
                            const mouseX = e.clientX - rect.left + scrollOffset;
                            const mouseTime = pixelToTime(mouseX);
                            const leftEdgeTime = displayStartTime; // Use the displayed start time
                            dragOffsetRef.current = mouseTime - leftEdgeTime;
                            console.log('Start drag offset:', { mouseTime, leftEdgeTime, offset: dragOffsetRef.current });
                          }
                          
                          setDragData({ clipId: clip.id });
              setIsDragging('in');
            }}
                        className="absolute left-0 top-0 bottom-0 w-3 bg-purple-400 hover:bg-purple-300 cursor-ew-resize z-30"
                        style={{ minWidth: '12px' }}
          />

          {/* End Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
                          e.preventDefault();
                          console.log('End handle clicked for clip:', clip.id);
                          
                          // Calculate offset: distance from mouse to the RIGHT edge
                          if (timelineRef.current) {
                            const rect = timelineRef.current.getBoundingClientRect();
                            const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
                            const mouseX = e.clientX - rect.left + scrollOffset;
                            const mouseTime = pixelToTime(mouseX);
                            const rightEdgeTime = displayStartTime + displayDuration;
                            dragOffsetRef.current = mouseTime - rightEdgeTime;
                            console.log('End drag offset:', { mouseTime, rightEdgeTime, offset: dragOffsetRef.current });
                          }
                          
                          setDragData({ clipId: clip.id });
              setIsDragging('out');
            }}
                        className="absolute right-0 top-0 bottom-0 w-3 bg-purple-400 hover:bg-purple-300 cursor-ew-resize z-30"
                        style={{ minWidth: '12px' }}
          />
                    </>
                  )}
          </div>
              </React.Fragment>
            );
          })}
          
          {/* Drop indicator at end */}
          {dropIndicatorPosition === timelineClips.length && (
            <div
              className="absolute w-1 h-full bg-purple-500 z-30"
              style={{ left: `${timeToPixel(totalDuration)}px`, top: 0 }}
            />
          )}

          {/* Playhead */}
          <div
            onMouseDown={() => {
              setDragData({});
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
