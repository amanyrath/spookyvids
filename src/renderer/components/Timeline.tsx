import React from 'react';

function Timeline() {
  return (
    <div className="h-full flex flex-col">
      {/* Timeline Header with Zoom Controls */}
      <div className="px-6 py-2 flex items-center justify-between border-b border-[#3a3a3a]">
        <h3 className="text-sm font-semibold text-white">Timeline</h3>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs transition-colors">
            +
          </button>
          <span className="text-xs text-gray-400 font-mono">Zoom: 1x</span>
          <button className="px-3 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs transition-colors">
            -
          </button>
        </div>
      </div>

      {/* Time Ruler */}
      <div className="h-10 bg-[#252525] border-b border-[#3a3a3a] px-6 flex items-center">
        <div className="flex gap-8 text-xs text-gray-400 font-mono">
          <span>0s</span>
          <span>5s</span>
          <span>10s</span>
          <span>15s</span>
          <span>20s</span>
          <span>25s</span>
          <span>30s</span>
        </div>
      </div>

      {/* Timeline Tracks */}
      <div className="flex-1 p-4">
        <div className="w-full h-full bg-[#1a1a1a] rounded border border-[#2a2a2a] relative overflow-hidden">
          {/* Empty State */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">No clips in timeline</p>
              <p className="text-gray-500 text-xs">Add clips to start editing</p>
            </div>
          </div>

          {/* Future: Clip bars and playhead will render here */}
        </div>
      </div>
    </div>
  );
}

export default Timeline;


