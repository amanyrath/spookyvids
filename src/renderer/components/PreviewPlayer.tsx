import React, { useRef, useEffect } from 'react';

interface PreviewPlayerProps {
  filePath: string | null;
  metadata?: any;
  playheadTime?: number;
  isPlaying?: boolean;
  setIsPlaying?: (playing: boolean) => void;
  onTimeUpdate?: (currentTime: number) => void;
}

function PreviewPlayer({ filePath, metadata, playheadTime = 0, isPlaying, setIsPlaying, onTimeUpdate }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (videoRef.current && filePath) {
      videoRef.current.load();
    }
  }, [filePath]);

  // Sync video player with playhead
  useEffect(() => {
    if (videoRef.current && filePath && playheadTime !== undefined) {
      // Only sync if significantly different to avoid rapid updates
      const currentTime = videoRef.current.currentTime;
      if (Math.abs(currentTime - playheadTime) > 0.1) {
        videoRef.current.currentTime = playheadTime;
      }
    }
  }, [playheadTime, filePath]);

  // Handle play/pause
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        // Ensure video is at the correct playhead position before playing
        if (Math.abs(videoRef.current.currentTime - playheadTime) > 0.1) {
          videoRef.current.currentTime = playheadTime;
        }
        videoRef.current.play().catch(err => console.log('Play error:', err));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, playheadTime]);

  // Update playhead from video time and handle bounds
  useEffect(() => {
    if (videoRef.current && isPlaying && onTimeUpdate) {
      const handleTimeUpdate = () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const currentTime = videoRef.current.currentTime;
          
          // Check if we've exceeded the trim end point
          if (metadata?.duration && currentTime >= metadata.duration) {
            if (videoRef.current) {
              videoRef.current.pause();
              // Return to end of trim
              if (onTimeUpdate) {
                onTimeUpdate(metadata.duration);
              }
            }
          } else if (onTimeUpdate) {
            onTimeUpdate(currentTime);
          }
        }
      };
      
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      return () => {
        videoRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  }, [isPlaying, onTimeUpdate, metadata]);

  return (
    <div className="h-full flex flex-col">
      {/* Video Preview Area (16:9 aspect ratio) */}
      <div className="flex-1 flex items-center justify-center bg-black p-8">
        {/* Maintain 16:9 aspect ratio container */}
        <div className="w-full max-w-5xl aspect-video bg-[#0a0a0a] border border-[#2a2a2a] rounded overflow-hidden flex items-center justify-center relative">
          {filePath ? (
            <video
              ref={videoRef}
              src={filePath}
              className="w-full h-full object-contain"
              controls
            />
          ) : (
            <div className="text-center">
              <svg className="w-24 h-24 mx-auto mb-4 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-sm">No video loaded</p>
            </div>
          )}
        </div>
      </div>

      {/* Playback Controls Bar */}
      <div className="h-16 bg-[#1a1a1a] border-t border-[#3a3a3a] flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
              }
            }}
            className="p-2 hover:bg-[#2a2a2a] rounded transition-colors"
            title="Rewind 5s"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>
          <button 
            onClick={() => {
              setIsPlaying?.(!isPlaying);
            }}
            className="p-2 bg-purple-900 hover:bg-purple-800 rounded transition-colors"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V9a1 1 0 00-1-1H7z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          <button 
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 5);
              }
            }}
            className="p-2 hover:bg-[#2a2a2a] rounded transition-colors"
            title="Forward 5s"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 flex items-center justify-center px-8">
          {/* Timeline scrubbing bar will go here */}
          <div className="w-full h-1 bg-[#2a2a2a] rounded-full"></div>
        </div>

        <div className="text-xs text-gray-400 font-mono">
          {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(metadata?.duration || 0)}
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;


