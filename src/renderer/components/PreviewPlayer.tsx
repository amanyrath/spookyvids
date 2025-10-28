import React from 'react';

function PreviewPlayer() {
  return (
    <div className="h-full flex flex-col">
      {/* Video Preview Area (16:9 aspect ratio) */}
      <div className="flex-1 flex items-center justify-center bg-black p-8">
        {/* Maintain 16:9 aspect ratio container */}
        <div className="w-full max-w-5xl aspect-video bg-[#0a0a0a] border border-[#2a2a2a] rounded flex items-center justify-center">
          <div className="text-center">
            <svg className="w-24 h-24 mx-auto mb-4 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 text-sm">No video loaded</p>
          </div>
        </div>
      </div>

      {/* Playback Controls Bar */}
      <div className="h-16 bg-[#1a1a1a] border-t border-[#3a3a3a] flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-[#2a2a2a] rounded transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>
          <button className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button className="p-2 hover:bg-[#2a2a2a] rounded transition-colors">
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
          00:00 / 05:23
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;


