import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface TimelineClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata: any;
  startTime: number;
  duration: number;
  inTime: number;
  outTime: number;
  track?: number; // Track number: 0 = Main track, 1 = Overlay track (optional for backward compatibility)
  overlayPosition?: { x: number; y: number }; // Position of overlay (default: bottom-right)
  overlaySize?: { width: number; height: number }; // Size as percentage (default: 25%)
  overlayVisible?: boolean; // Visibility toggle (default: true)
  muted?: boolean; // Audio mute state for this clip
  videoFilter?: string; // Video filter type (e.g., "grayscale", "xray", "sepia", "vintage", "blur")
  overlayEffects?: Array<{ // Multiple image overlay effects
    id: string;
    filePath: string;
    opacity: number; // 0-1
    position: { x: number; y: number }; // Percentage from left/top
    size: { width: number; height: number }; // Percentage
  }>;
}

interface DragData {
  clipId?: string;
  originalStartTime?: number;
  newStartTime?: number;
  insertIndex?: number;
  snapTime?: number; // Time position where clip should snap
  snapPosition?: number; // Pixel position of snap guideline
}

interface TimelineProps {
  timelineClips: TimelineClip[];
  focusedClipId: string | null;
  playheadTime: number;
  isPlaying?: boolean;
  onClipTrimUpdate: (clipId: string, inTime: number, outTime: number, skipHistory?: boolean) => void;
  onClipFocus: (clipId: string | null) => void;
  onPlayheadUpdate: (time: number) => void;
  onClipReorder: (newClips: TimelineClip[]) => void;
  onClipDrop: (filePath: string, fileName: string, metadata: any, dropTime?: number, track?: number) => void;
  onSplitClip?: () => void;
  track0Muted?: boolean;
  track1Muted?: boolean;
  onTrack0MuteToggle?: () => void;
  onTrack1MuteToggle?: () => void;
  onClipMuteToggle?: (clipId: string) => void;
  overlayTrackEnabled?: boolean;
  onToggleOverlayTrack?: () => void;
}

function Timeline({ 
  timelineClips, 
  focusedClipId, 
  playheadTime,
  isPlaying = false,
  onClipTrimUpdate, 
  onClipFocus, 
  onPlayheadUpdate, 
  onClipReorder, 
  onClipDrop,
  onSplitClip,
  track0Muted = false,
  track1Muted = false,
  onTrack0MuteToggle,
  onTrack1MuteToggle,
  onClipMuteToggle,
  overlayTrackEnabled = false,
  onToggleOverlayTrack
}: TimelineProps) {
  const [isDragging, setIsDragging] = useState<'in' | 'out' | 'playhead' | 'clip' | null>(null);
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<number | null>(null); // Now stores pixel position, not index
  const [dragOverTrack, setDragOverTrack] = useState<number | null>(null); // Track which track is being dragged over
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [, forceUpdate] = useState(0); // For forcing re-renders during trim drag
  
  // Store trim values during drag to avoid constant state updates
  const trimDragRef = useRef<{ clipId: string; inTime: number; outTime: number } | null>(null);
  
  // Store the initial mouse offset when starting a drag to prevent "jumping"
  const dragOffsetRef = useRef<number>(0);
  
  // Track manual scrolling/interaction to prevent auto-scroll during user actions
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAnimationRef = useRef<number | null>(null); // For smooth scrolling animation


  // Calculate total duration
  const totalDuration = timelineClips.length > 0
    ? timelineClips[timelineClips.length - 1].startTime + 
      (timelineClips[timelineClips.length - 1].outTime - timelineClips[timelineClips.length - 1].inTime)
    : 0;

  // Pixel to time conversion
  // Use scrollContainerRef to get the actual scrollable width (without outer padding)
  const pixelToTime = (pixels: number): number => {
    const scrollContainer = scrollContainerRef.current;
    const timelineWidth = scrollContainer?.clientWidth || timelineRef.current?.clientWidth || 1;
    if (totalDuration === 0) return 0;
    return (pixels / timelineWidth) * totalDuration / scale;
  };

  // Time to pixel conversion
  // Use scrollContainerRef to get the actual scrollable width (without outer padding)
  const timeToPixel = useCallback((time: number): number => {
    const scrollContainer = scrollContainerRef.current;
    const timelineWidth = scrollContainer?.clientWidth || timelineRef.current?.clientWidth || 1;
    if (totalDuration === 0) return 0;
    return (time / totalDuration) * timelineWidth * scale;
  }, [totalDuration, scale]);

  // Handle drop from media library
  const handleTimelineDrop = (e: React.DragEvent, targetTrack: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Block drop to track 1 if overlay track is not enabled
    if (targetTrack === 1 && !overlayTrackEnabled) {
      return;
    }
    
    try {
      const data = e.dataTransfer.getData('application/json');
      
      if (data) {
        const clipData = JSON.parse(data);
        
        console.log('Timeline drop:', clipData.fileName, 'Track:', targetTrack);
        
        // Determine insertion position
        const rect = timelineRef.current?.getBoundingClientRect();
        if (rect) {
          const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
          const x = e.clientX - rect.left + scrollOffset;
          const dropTime = pixelToTime(x);
          
          // Calculate absolute drop time (clamped to valid range)
          const clampedDropTime = Math.max(0, dropTime);
          
          console.log('Drop time:', clampedDropTime, 'Track:', targetTrack);
          
          // Pass the dropTime directly (absolute position) instead of insertIndex
          onClipDrop(clipData.filePath, clipData.fileName, clipData.metadata, clampedDropTime, targetTrack);
        } else {
          // Calculate default drop time at the end of all clips on this track
          const trackClips = timelineClips.filter(clip => (clip.track ?? 0) === targetTrack);
          const defaultDropTime = trackClips.length > 0
            ? Math.max(...trackClips.map(clip => clip.startTime + (clip.outTime - clip.inTime)))
            : 0;
          onClipDrop(clipData.filePath, clipData.fileName, clipData.metadata, defaultDropTime, targetTrack);
        }
      }
    } catch (error) {
      console.error('Timeline drop error:', error);
    }
    
    setDropIndicatorPosition(null);
    setDragOverTrack(null);
  };

  const handleTrackDragOver = (e: React.DragEvent, trackNumber: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Block drag to track 1 if overlay track is not enabled
    if (trackNumber === 1 && !overlayTrackEnabled) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    
    e.dataTransfer.dropEffect = 'copy';
    
    setDragOverTrack(trackNumber);
    
      const rect = timelineRef.current?.getBoundingClientRect();
      if (rect) {
        const scrollOffsetX = scrollContainerRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + scrollOffsetX;
        const dropTime = pixelToTime(x);
        
        // Store the drop time position for visual feedback
        // Convert time to pixel position for the indicator
        const dropPosition = timeToPixel(dropTime);
        setDropIndicatorPosition(dropPosition);
      }
  };

  const handleTrackDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear if leaving the timeline entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !timelineRef.current?.contains(relatedTarget)) {
      setDropIndicatorPosition(null);
      setDragOverTrack(null);
    }
  };

  // Sync scroll between ruler and timeline
  const handleRulerScroll = useCallback(() => {
    if (scrollContainerRef.current && rulerRef.current) {
      scrollContainerRef.current.scrollLeft = rulerRef.current.scrollLeft;
      // Mark as user scrolling
      isUserScrollingRef.current = true;
      // Clear previous timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      // Reset flag after a delay (user finished scrolling)
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    }
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (scrollContainerRef.current && rulerRef.current) {
      rulerRef.current.scrollLeft = scrollContainerRef.current.scrollLeft;
      // Mark as user scrolling
      isUserScrollingRef.current = true;
      // Clear previous timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      // Reset flag after a delay (user finished scrolling)
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    }
  }, []);

  useEffect(() => {
    const timeline = scrollContainerRef.current;
    if (timeline) {
      timeline.addEventListener('scroll', handleTimelineScroll);
      return () => {
        timeline.removeEventListener('scroll', handleTimelineScroll);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
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
      // Dragging entire clip to reposition - only within the same track
      const draggedClip = timelineClips.find(c => c.id === dragData.clipId);
      if (draggedClip) {
        const mouseTime = Math.max(0, timelineTime);
        const clipTrack = draggedClip.track ?? 0;
        
        // Get clips on the same track only
        const sameTrackClips = timelineClips.filter(c => 
          (c.track ?? 0) === clipTrack && c.id !== dragData.clipId
        );
        
        // Calculate insertion index within the same track
        let insertIndex = 0;
        for (let i = 0; i < sameTrackClips.length; i++) {
          const clipMiddle = sameTrackClips[i].startTime + (sameTrackClips[i].outTime - sameTrackClips[i].inTime) / 2;
          if (mouseTime > clipMiddle) {
            insertIndex = i + 1;
          } else {
            break;
          }
        }
        
        // Calculate where this clip would be placed sequentially within its track
        let calculatedStartTime = 0;
        for (let i = 0; i < insertIndex; i++) {
          calculatedStartTime += (sameTrackClips[i].outTime - sameTrackClips[i].inTime);
        }
        
        // Snap-to-edge detection: check within 10px (in time units)
        // Snap works across ALL clips (all tracks) for visual guidance
        const snapThreshold = pixelToTime(10) - pixelToTime(0);
        let snapTime: number | undefined = undefined;
        let snapPosition: number | undefined = undefined;
        
        // Check snap to timeline start
        if (calculatedStartTime < snapThreshold) {
          snapTime = 0;
          snapPosition = 0;
          calculatedStartTime = 0;
        } else {
          // Check snap to other clips' edges (including other tracks)
          const allOtherClips = timelineClips.filter(c => c.id !== dragData.clipId);
          for (const clip of allOtherClips) {
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + (clip.outTime - clip.inTime);
            
            // Snap to clip start edge
            if (Math.abs(calculatedStartTime - clipStart) < snapThreshold) {
              snapTime = clipStart;
              snapPosition = timeToPixel(clipStart);
              calculatedStartTime = clipStart;
              break;
            }
            
            // Snap to clip end edge
            if (Math.abs(calculatedStartTime - clipEnd) < snapThreshold) {
              snapTime = clipEnd;
              snapPosition = timeToPixel(clipEnd);
              calculatedStartTime = clipEnd;
              break;
            }
          }
        }
        
        // Store the calculated position
        setDragData(prev => ({ ...prev, newStartTime: calculatedStartTime, insertIndex, snapTime, snapPosition }));
        forceUpdate(n => n + 1);
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
        if (isDragging === 'clip' && dragData?.clipId && dragData?.newStartTime !== undefined && dragData.insertIndex !== undefined) {
          console.log('Applying clip reposition on mouse up:', dragData);
          
          const draggedClip = timelineClips.find(c => c.id === dragData.clipId);
          if (draggedClip) {
            const clipTrack = draggedClip.track ?? 0;
            
            // Get clips on same track (excluding dragged clip)
            const sameTrackClips = timelineClips.filter(c => 
              (c.track ?? 0) === clipTrack && c.id !== dragData.clipId
            );
            
            // Insert at new position within the same track
            const reorderedTrackClips = [
              ...sameTrackClips.slice(0, dragData.insertIndex),
              draggedClip,
              ...sameTrackClips.slice(dragData.insertIndex)
            ];
            
            // Recalculate startTime sequentially for this track
            let currentTime = 0;
            const updatedTrackClips = reorderedTrackClips.map(clip => {
              const updated = { ...clip, startTime: currentTime };
              currentTime += (clip.outTime - clip.inTime);
              return updated;
            });
            
            // Merge with clips from other tracks (unchanged)
            const otherTrackClips = timelineClips.filter(c => (c.track ?? 0) !== clipTrack);
            const finalClips = [...otherTrackClips, ...updatedTrackClips];
            
            console.log('Reordered clips:', finalClips);
            onClipReorder(finalClips);
          }
        }
        
        setIsDragging(null);
        setDragData(null);
        dragOffsetRef.current = 0; // Clear offset
        trimDragRef.current = null; // Clear trim drag
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        // Reset user scrolling flag after a delay to allow auto-scroll to resume
        isUserScrollingRef.current = true;
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 300);
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

  // Calculate values needed for auto-scroll (before conditional return to follow Rules of Hooks)
  const playheadX = useMemo(() => {
    return timelineClips.length > 0 ? timeToPixel(playheadTime) : 0;
  }, [timelineClips.length, timeToPixel, playheadTime]);
  
  const timelineWidth = timelineRef.current?.clientWidth || 1;
  const minWidth = useMemo(() => {
    return timelineClips.length > 0
      ? Math.max(timelineWidth, timeToPixel(totalDuration))
      : timelineWidth;
  }, [timelineClips.length, timelineWidth, timeToPixel, totalDuration]);
  
  // Auto-scroll to keep playhead visible when zoomed in
  // Must be declared before conditional return to follow Rules of Hooks
  useEffect(() => {
    // Don't auto-scroll during user interaction
    if (isUserScrollingRef.current || isDragging) {
      return;
    }
    
    const container = scrollContainerRef.current;
    if (!container) return;
    
    // Calculate visible area
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const visibleStart = scrollLeft;
    const visibleEnd = scrollLeft + containerWidth;
    
    // Add padding (keep playhead centered with some margin)
    const padding = Math.min(containerWidth * 0.3, 200); // 30% of container width or 200px, whichever is smaller
    
    // Use the already-calculated playheadX position (calculated with timeToPixel)
    // This ensures consistency with the visual playhead position
    const currentPlayheadX = playheadX;
    
    // Calculate target scroll position
    let targetScrollLeft: number;
    
    if (isPlaying) {
      // iMovie style: Center the playhead during playback with smooth scrolling
      targetScrollLeft = currentPlayheadX - containerWidth / 2;
    } else {
      // When not playing: Keep playhead visible with padding (original behavior)
      if (currentPlayheadX < visibleStart + padding) {
        targetScrollLeft = Math.max(0, currentPlayheadX - padding);
      } else if (currentPlayheadX > visibleEnd - padding) {
        const maxScroll = Math.max(0, container.scrollWidth - containerWidth);
        targetScrollLeft = Math.min(maxScroll, currentPlayheadX + padding - containerWidth);
      } else {
        // Playhead is already visible, no need to scroll
        return;
      }
    }
    
    // Clamp target scroll position
    const maxScroll = Math.max(0, container.scrollWidth - containerWidth);
    targetScrollLeft = Math.max(0, Math.min(maxScroll, targetScrollLeft));
    
    const currentScrollLeft = scrollLeft;
    const scrollDifference = Math.abs(targetScrollLeft - currentScrollLeft);
    
    // Only scroll if there's a meaningful difference
    if (scrollDifference < 1) return;
    
    // Cancel any ongoing smooth scroll animation
    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
    
    // Temporarily disable user scroll detection
    const wasUserScrolling = isUserScrollingRef.current;
    isUserScrollingRef.current = true;
    
    if (isPlaying && scrollDifference > 1) {
      // Smooth scrolling animation for playback (iMovie style)
      const startScroll = currentScrollLeft;
      const startTime = performance.now();
      // Smoother, more responsive animation
      const duration = Math.min(150, scrollDifference * 0.2); // Faster animation: 150ms max
      
      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smoother easing: ease-out-quint for very smooth deceleration
        const easeOutQuint = 1 - Math.pow(1 - progress, 5);
        const newScroll = startScroll + (targetScrollLeft - startScroll) * easeOutQuint;
        
        if (container && scrollContainerRef.current === container) {
          container.scrollLeft = newScroll;
          
          // Sync ruler scroll
          if (rulerRef.current) {
            rulerRef.current.scrollLeft = newScroll;
          }
          
          if (progress < 1) {
            scrollAnimationRef.current = requestAnimationFrame(animateScroll);
          } else {
            scrollAnimationRef.current = null;
            // Re-enable after animation completes
            setTimeout(() => {
              isUserScrollingRef.current = wasUserScrolling;
            }, 50); // Reduced delay for more responsive feel
          }
        }
      };
      
      scrollAnimationRef.current = requestAnimationFrame(animateScroll);
    } else {
      // Instant scroll for small movements or when not playing
      requestAnimationFrame(() => {
        if (container && scrollContainerRef.current === container) {
          container.scrollLeft = targetScrollLeft;
          
          if (rulerRef.current) {
            rulerRef.current.scrollLeft = targetScrollLeft;
          }
          
          setTimeout(() => {
            isUserScrollingRef.current = wasUserScrolling;
          }, 50);
        }
      });
    }
    
    // Cleanup function
    return () => {
      if (scrollAnimationRef.current !== null) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
    };
  }, [playheadTime, isPlaying, isDragging, totalDuration, scale, playheadX]);

  // Conditional return AFTER all hooks
  if (timelineClips.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a]">
          <h3 className="text-sm font-semibold text-white">Timeline</h3>
          {!overlayTrackEnabled && onToggleOverlayTrack && (
            <button
              onClick={onToggleOverlayTrack}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded transition-colors"
              title="Add Overlay Track"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v8m-4-4h8" />
              </svg>
              <span>Add Track</span>
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col">
          {/* Empty Track 0: Main Track */}
          <div 
            className={`flex-1 flex items-center justify-center ${overlayTrackEnabled ? 'border-b border-[#2a2a2a]' : ''} transition-colors ${
              dragOverTrack === 0 ? 'bg-purple-900/20' : ''
            }`}
            onDrop={(e) => handleTimelineDrop(e, 0)}
            onDragOver={(e) => handleTrackDragOver(e, 0)}
            onDragLeave={handleTrackDragLeave}
          >
            <div className="text-center text-gray-500">
              <p className="text-sm font-semibold">Main Track</p>
              <p className="text-xs mt-1">Drag clips here</p>
            </div>
          </div>
          
          {/* Empty Track 1: Overlay Track - Only show if enabled */}
          {overlayTrackEnabled && (
            <div 
              className={`flex-1 flex items-center justify-center bg-[#151515] transition-colors ${
                dragOverTrack === 1 ? 'bg-purple-900/20' : 'bg-[#151515]'
              }`}
              onDrop={(e) => handleTimelineDrop(e, 1)}
              onDragOver={(e) => handleTrackDragOver(e, 1)}
              onDragLeave={handleTrackDragLeave}
            >
              <div className="text-center text-gray-500">
                <p className="text-sm font-semibold">Overlay Track</p>
                <p className="text-xs mt-1">Drag clips here</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col min-h-0 overflow-hidden"
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
        className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a] flex-shrink-0"
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
          {/* Add Track Button - Only show when overlay track is disabled */}
          {!overlayTrackEnabled && onToggleOverlayTrack && (
            <button
              onClick={onToggleOverlayTrack}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded transition-colors"
              title="Add Overlay Track"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v8m-4-4h8" />
              </svg>
              <span>Add Track</span>
            </button>
          )}
          {/* Keyboard shortcuts hint */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">⌘Z</kbd>
            <span>Undo</span>
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">⌘⇧Z</kbd>
            <span>Redo</span>
            <kbd className="px-2 py-1 bg-[#2a2a2a] rounded border border-[#3a3a3a]">⌘T</kbd>
            <span>Split</span>
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
        className="bg-[#252525] border-b border-[#3a3a3a] cursor-pointer flex-shrink-0 relative pl-4"
        style={{ 
          height: '40px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
        onScroll={handleRulerScroll}
      >
        {/* Hide scrollbar for Chrome/Safari */}
        <style>{`
          .ruler-scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <div className="relative ruler-scrollbar-hide" style={{ width: `${minWidth}px`, height: '100%' }}
          onClick={(e) => {
            // Mark as user interaction to prevent auto-scroll
            isUserScrollingRef.current = true;
            if (scrollTimeoutRef.current) {
              clearTimeout(scrollTimeoutRef.current);
            }
            scrollTimeoutRef.current = setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 300);
            
            // Click-to-seek on time ruler
            if (timelineRef.current && scrollContainerRef.current) {
              const rulerScrollable = rulerRef.current;
              if (!rulerScrollable) return;
              const rect = rulerScrollable.getBoundingClientRect();
              const scrollOffset = rulerScrollable.scrollLeft;
              const x = e.clientX - rect.left + scrollOffset;
              const clickedTime = pixelToTime(x);
              const clampedTime = Math.max(0, Math.min(clickedTime, totalDuration));
              onPlayheadUpdate(clampedTime);
            }
          }}
        >
        {(() => {
          // Calculate optimal time intervals based on total duration (iMovie-style)
          // Determine major interval (every 10s, 5s, 2s, 1s based on scale and duration)
          let majorInterval: number;
          let minorInterval: number;
          
          const pixelsPerSecond = timeToPixel(1) - timeToPixel(0);
          
          if (pixelsPerSecond * scale < 15) {
            majorInterval = 10;
            minorInterval = 10;
          } else if (pixelsPerSecond * scale < 30) {
            majorInterval = 5;
            minorInterval = 5;
          } else if (pixelsPerSecond * scale < 60) {
            majorInterval = 2;
            minorInterval = 1;
          } else if (pixelsPerSecond * scale < 150) {
            majorInterval = 1;
            minorInterval = 0.5;
          } else {
            majorInterval = 1;
            minorInterval = 0.25;
          }
          
          const marks: Array<{ time: number; x: number; isMajor: boolean }> = [];
          for (let t = 0; t <= totalDuration; t += minorInterval) {
            const x = timeToPixel(t);
            marks.push({ time: t, x, isMajor: t % majorInterval === 0 });
          }
          
          return (
            <>
              {/* Minor grid lines */}
              {marks.map((mark, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-l ${mark.isMajor ? 'border-[#444444]' : 'border-[#2a2a2a]'}`}
                  style={{ left: `${mark.x}px` }}
                />
              ))}
              
              {/* Major time labels */}
              {marks.filter(m => m.isMajor).map((mark, i) => (
                <div
                  key={i}
                  className="absolute text-xs text-gray-400 font-mono px-1 whitespace-nowrap z-10"
                  style={{ 
                    left: `${mark.x}px`,
                    top: '4px',
                    transform: 'translateX(-50%)'
                  }}
                >
                  {mark.time % 1 === 0 ? `${mark.time.toFixed(0)}s` : `${mark.time.toFixed(1)}s`}
                </div>
              ))}
              
              {/* Playhead tracker in ruler */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${playheadX}px` }}
              >
                {/* Time flag at top */}
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs font-mono px-2 py-0.5 rounded-t whitespace-nowrap z-30 shadow-lg"
                  style={{ 
                    fontSize: '10px',
                    top: '0px'
                  }}
                >
                  {playheadTime.toFixed(2)}s
                </div>
              </div>
            </>
          );
        })()}
        </div>
      </div>

      {/* Timeline Tracks */}
      <div className="flex-1 pt-4 pr-4 pb-4 min-h-0 overflow-hidden" ref={timelineRef}>
        {/* Hide scrollbar for timeline */}
        <style>{`
          .timeline-scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <div className="w-full h-full pl-4 relative">
          <div 
            ref={scrollContainerRef} 
            className="w-full h-full bg-[#1a1a1a] rounded border border-[#2a2a2a] relative overflow-x-auto overflow-y-auto select-none cursor-pointer flex flex-col timeline-scrollbar-hide"
            style={{ 
              minWidth: `${minWidth}px`,
              touchAction: 'pan-x', // Only allow horizontal panning, no zoom
              scrollbarWidth: 'none', // Firefox
              msOverflowStyle: 'none', // IE/Edge
            }}
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
              return;
            }
            
            // Mark as user interaction to prevent auto-scroll
            isUserScrollingRef.current = true;
            if (scrollTimeoutRef.current) {
              clearTimeout(scrollTimeoutRef.current);
            }
            scrollTimeoutRef.current = setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 300);
            
            // Click-to-seek: update playhead position when clicking on timeline background
            const target = e.target as HTMLElement;
            const clickedOnClip = target.closest('[data-clip-id]') !== null;
            const clickedOnTrimHandle = target.classList.contains('cursor-ew-resize');
            
            // Only seek if clicking on timeline background (not on a clip or trim handle)
            if (!clickedOnClip && !clickedOnTrimHandle && scrollContainerRef.current) {
              if (timelineRef.current) {
                const rect = timelineRef.current.getBoundingClientRect();
                const scrollOffset = scrollContainerRef.current?.scrollLeft || 0;
                const x = e.clientX - rect.left + scrollOffset;
                const clickedTime = pixelToTime(x);
                const clampedTime = Math.max(0, Math.min(clickedTime, totalDuration));
                onPlayheadUpdate(clampedTime);
              }
            }
          }}
        >
          {/* Track 0: Main Track */}
          <div 
            className={`relative ${overlayTrackEnabled ? 'h-24' : 'flex-1'} ${overlayTrackEnabled ? 'border-b border-[#2a2a2a]' : ''} transition-colors ${
              dragOverTrack === 0 ? 'bg-purple-900/20' : ''
            }`}
            style={{ minWidth: `${minWidth}px` }}
            onDrop={(e) => handleTimelineDrop(e, 0)}
            onDragOver={(e) => handleTrackDragOver(e, 0)}
            onDragLeave={handleTrackDragLeave}
          >
            <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 font-semibold z-10 flex items-center gap-2 pointer-events-none">
              <span>Main Track</span>
              {onTrack0MuteToggle && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrack0MuteToggle();
                  }}
                  className="p-1 hover:bg-[#3a3a3a] rounded transition-colors pointer-events-auto"
                  title={track0Muted ? "Unmute Main Track" : "Mute Main Track"}
                >
                  {track0Muted ? (
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            {/* Render Track 0 clips */}
            {timelineClips.filter(c => (c.track ?? 0) === 0).map((clip) => {
            // Ensure clip has track property (default to 0 for main track)
            const clipTrack = clip.track ?? 0;
            
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
          {/* Clip Bar */}
          <div
                  data-clip-id={clip.id}
                  className={`absolute h-12 rounded cursor-move transition-colors ${
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
                  <div className="relative px-2 py-1 h-full flex items-center justify-between">
                    <span className="text-xs text-white truncate flex-1">{clip.fileName}</span>
                    {onClipMuteToggle && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onClipMuteToggle(clip.id);
                        }}
                        className="ml-2 p-0.5 hover:bg-purple-600 rounded transition-colors shrink-0"
                        title={clip.muted ? "Unmute Clip" : "Mute Clip"}
                      >
                        {clip.muted ? (
                          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    )}
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
          </div>

          {/* Track 1: Overlay Track - Only render if enabled */}
          {overlayTrackEnabled && (
            <div 
              className={`relative h-24 bg-[#151515] transition-colors ${
                dragOverTrack === 1 ? 'bg-purple-900/20' : 'bg-[#151515]'
              }`}
              style={{ minWidth: `${minWidth}px` }}
              onDrop={(e) => handleTimelineDrop(e, 1)}
              onDragOver={(e) => handleTrackDragOver(e, 1)}
              onDragLeave={handleTrackDragLeave}
            >
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 font-semibold z-10 flex items-center gap-2 pointer-events-none">
                <span>Overlay Track</span>
                {onTrack1MuteToggle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTrack1MuteToggle();
                    }}
                    className="p-1 hover:bg-[#3a3a3a] rounded transition-colors pointer-events-auto"
                    title={track1Muted ? "Unmute Overlay Track" : "Mute Overlay Track"}
                  >
                    {track1Muted ? (
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                )}
                {/* Remove track button - only show when track is empty */}
                {onToggleOverlayTrack && timelineClips.filter(c => (c.track ?? 0) === 1).length === 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleOverlayTrack();
                    }}
                    className="p-1 hover:bg-red-600/20 text-gray-400 hover:text-red-400 rounded transition-colors pointer-events-auto"
                    title="Remove Overlay Track"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            {/* Render Track 1 clips */}
            {timelineClips.filter(c => (c.track ?? 0) === 1).map((clip) => {
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
          {/* Clip Bar */}
          <div
                  data-clip-id={clip.id}
                  className={`absolute h-12 rounded cursor-move transition-colors ${
                    isFocused ? 'bg-blue-700 border-2 border-blue-400' : 'bg-blue-900 border border-blue-700'
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
                  <div className="relative px-2 py-1 h-full flex items-center justify-between">
                    <span className="text-xs text-white truncate flex-1">{clip.fileName}</span>
                    {onClipMuteToggle && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onClipMuteToggle(clip.id);
                        }}
                        className="ml-2 p-0.5 hover:bg-purple-600 rounded transition-colors shrink-0"
                        title={clip.muted ? "Unmute Clip" : "Mute Clip"}
                      >
                        {clip.muted ? (
                          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    )}
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
                        className="absolute left-0 top-0 bottom-0 w-3 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-30"
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
                      className="absolute right-0 top-0 bottom-0 w-3 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-30"
                      style={{ minWidth: '12px' }}
          />
                  </>
                )}
              </div>
            </React.Fragment>
          );
        })}
        </div>
          )}
          
          {/* Drop indicator - shown when dragging over timeline */}
          {dropIndicatorPosition !== null && (
            <div
              className="absolute w-0.5 h-full bg-blue-400 opacity-80 z-25"
              style={{ left: `${dropIndicatorPosition}px` }}
            >
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-blue-400" />
            </div>
          )}

          {/* Snap guideline - shown when dragging clip near an edge */}
          {isDragging === 'clip' && dragData?.snapPosition !== undefined && (
            <div
              className="absolute w-0.5 h-full bg-green-400 opacity-80 z-25"
              style={{ left: `${dragData.snapPosition}px` }}
            >
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-green-400" />
            </div>
          )}

          {/* Playhead */}
          <div
            onMouseDown={() => {
              // Mark as user interaction to prevent auto-scroll during playhead drag
              isUserScrollingRef.current = true;
              if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
              }
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
    </div>
  );
}

export default Timeline;
