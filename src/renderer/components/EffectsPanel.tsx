import React, { useState } from 'react';

interface OverlayEffect {
  id: string;
  filePath: string;
  opacity: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface EffectsPanelProps {
  clipId: string;
  currentFilter?: string;
  currentOverlays?: OverlayEffect[];
  onFilterChange: (filter: string | undefined) => void;
  onOverlaysChange: (overlays: OverlayEffect[] | undefined) => void;
  onImportOverlay: () => Promise<string | null>; // Returns file path or null
}

const AVAILABLE_FILTERS = [
  { id: '', name: 'None' },
  { id: 'grayscale', name: 'Black & White' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'xray', name: 'X-Ray' },
  { id: 'blur', name: 'Blur' },
  { id: 'bright', name: 'Bright' },
  { id: 'dark', name: 'Dark' },
  { id: 'high-contrast', name: 'High Contrast' },
  { id: 'flicker', name: 'TV Static' },
];

function EffectsPanel({
  clipId,
  currentFilter,
  currentOverlays = [],
  onFilterChange,
  onOverlaysChange,
  onImportOverlay,
}: EffectsPanelProps) {
  const [expandedOverlayId, setExpandedOverlayId] = useState<string | null>(null);

  const handleFilterSelect = (filterId: string) => {
    onFilterChange(filterId || undefined);
  };

  const handleImportOverlayClick = async () => {
    const filePath = await onImportOverlay();
    if (filePath) {
      // Add new overlay with default properties
      const newOverlay: OverlayEffect = {
        id: `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filePath,
        opacity: 0.7,
        position: { x: 10, y: 10 },
        size: { width: 25, height: 25 },
      };
      onOverlaysChange([...(currentOverlays || []), newOverlay]);
    }
  };

  const handleRemoveOverlay = (overlayId: string) => {
    const updatedOverlays = currentOverlays?.filter((o) => o.id !== overlayId);
    onOverlaysChange(updatedOverlays && updatedOverlays.length > 0 ? updatedOverlays : undefined);
    setExpandedOverlayId(null);
  };

  const handleOpacityChange = (overlayId: string, opacity: number) => {
    const updatedOverlays = currentOverlays?.map((o) =>
      o.id === overlayId ? { ...o, opacity: Math.max(0, Math.min(1, opacity)) } : o
    );
    onOverlaysChange(updatedOverlays);
  };

  const handlePositionChange = (overlayId: string, axis: 'x' | 'y', value: number) => {
    const updatedOverlays = currentOverlays?.map((o) =>
      o.id === overlayId
        ? {
            ...o,
            position: {
              ...o.position,
              [axis]: Math.max(0, Math.min(100, value)),
            },
          }
        : o
    );
    onOverlaysChange(updatedOverlays);
  };

  const handleSizeChange = (overlayId: string, dimension: 'width' | 'height', value: number) => {
    const updatedOverlays = currentOverlays?.map((o) =>
      o.id === overlayId
        ? {
            ...o,
            size: {
              ...o.size,
              [dimension]: Math.max(5, Math.min(100, value)),
            },
          }
        : o
    );
    onOverlaysChange(updatedOverlays);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Video Effects</h3>

        {/* Video Filters */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">Filter</label>
          <select
            value={currentFilter || ''}
            onChange={(e) => handleFilterSelect(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-600"
          >
            {AVAILABLE_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Overlay Effects */}
      <div className="border-t border-[#3a3a3a] pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Overlay Effects</h3>
          <button
            onClick={handleImportOverlayClick}
            className="px-3 py-1 bg-purple-900/20 hover:bg-purple-900/30 border border-purple-700/50 rounded text-xs text-white transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {currentOverlays && currentOverlays.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {currentOverlays.map((overlay, index) => (
              <div key={overlay.id} className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg p-3">
                <div className="flex items-start gap-3 mb-2">
                  <img
                    src={overlay.filePath}
                    alt="Overlay"
                    className="w-12 h-12 object-contain bg-[#0a0a0a] rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate mb-1">
                      Overlay {index + 1}
                    </p>
                    <p className="text-xs text-gray-500 truncate mb-2">
                      {overlay.filePath.split('/').pop()?.split('\\').pop()}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setExpandedOverlayId(expandedOverlayId === overlay.id ? null : overlay.id)
                        }
                        className="px-2 py-1 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-xs text-white transition-colors"
                      >
                        {expandedOverlayId === overlay.id ? 'Hide' : 'Settings'}
                      </button>
                      <button
                        onClick={() => handleRemoveOverlay(overlay.id)}
                        className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 rounded text-xs text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                {expandedOverlayId === overlay.id && (
                  <div className="bg-[#0d0d0d] rounded-lg p-3 space-y-3 mt-2">
                    <p className="text-xs text-gray-400 mb-2">Drag overlay in preview to reposition</p>
                    
                    {/* Opacity */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Opacity: {Math.round(overlay.opacity * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={overlay.opacity}
                        onChange={(e) => handleOpacityChange(overlay.id, parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    {/* Size */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Width: {overlay.size.width}%
                        </label>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          step="1"
                          value={overlay.size.width}
                          onChange={(e) => handleSizeChange(overlay.id, 'width', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Height: {overlay.size.height}%
                        </label>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          step="1"
                          value={overlay.size.height}
                          onChange={(e) =>
                            handleSizeChange(overlay.id, 'height', parseInt(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* Position Fine-tune */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          X Position: {Math.round(overlay.position.x)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={overlay.position.x}
                          onChange={(e) =>
                            handlePositionChange(overlay.id, 'x', parseInt(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Y Position: {Math.round(overlay.position.y)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={overlay.position.y}
                          onChange={(e) =>
                            handlePositionChange(overlay.id, 'y', parseInt(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center py-4">
            No overlays added. Click "Add" to import an overlay image.
          </p>
        )}
      </div>
    </div>
  );
}

export default EffectsPanel;
