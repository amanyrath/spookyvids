import React from 'react';

function ImportArea() {
  return (
    <div className="flex flex-col h-full">
      {/* Media Library Header */}
      <div className="px-4 py-3 border-b border-[#3a3a3a]">
        <h2 className="text-sm font-semibold text-white">Media Library</h2>
      </div>

      {/* Media Browser */}
      <div className="flex-1 p-3 overflow-y-auto">
        {/* Empty State - Drag and Drop */}
        <div className="border-2 border-dashed border-[#3a3a3a] rounded-lg flex items-center justify-center bg-[#1a1a1a] hover:border-[#4a4a4a] transition-colors">
          <div className="text-center p-6">
            <svg className="w-12 h-12 mx-auto mb-3 text-[#4a4a4a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-gray-400 mb-1">Drop video files here</p>
            <p className="text-xs text-gray-500">MP4 or MOV</p>
          </div>
        </div>

        {/* Future: Clip Thumbnails will go here */}
      </div>
    </div>
  );
}

export default ImportArea;


