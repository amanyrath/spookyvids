# System Patterns: ClipForge

## System Architecture

### High-Level Architecture

ClipForge follows the standard Electron architecture with two main processes:

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│  - File system operations               │
│  - FFmpeg command execution             │
│  - Native dialog handling               │
└─────────────────┬───────────────────────┘
                  │ IPC Communication
                  ▼
┌─────────────────────────────────────────┐
│        Electron Renderer Process        │
│  - UI rendering (React/Vue/Svelte)      │
│  - Drag-and-drop handling               │
│  - Timeline interaction                 │
│  - Video element control                │
└─────────────────────────────────────────┘
```

### Process Responsibilities

#### Main Process (main.js)
- **Window Management:** Create and manage the main application window
- **File I/O:** Handle dropped files, validate formats, access file system
- **Metadata Extraction:** Use fluent-ffmpeg to probe video files for duration/resolution
- **Export Logic:** Construct and execute FFmpeg commands with trim parameters
- **Progress Reporting:** Listen to FFmpeg progress events and send to renderer

#### Renderer Process (renderer.tsx, App.tsx)
- **UI Rendering:** Display the three-panel layout (Import, Preview, Timeline) - ✅ Implemented
- **Event Handling:** Capture drag-and-drop events, button clicks, mouse interactions - 🚧 In Progress
- **State Management:** Maintain clip metadata, trim points (inTime/outTime), playhead position
- **Video Preview:** Control HTML5 `<video>` element currentTime based on playhead
- **Timeline Rendering:** Draw clip bar, drag handles, and playhead indicator
- **TypeScript:** Full type safety across all renderer components

## IPC Communication Pattern

### Channel Structure

**Renderer → Main:**
- `file-dropped`: Send file path from drag-and-drop
- `export-request`: Trigger export with trim parameters (inTime, outTime)

**Main → Renderer:**
- `metadata-response`: Send video duration and resolution after probing
- `export-progress`: Send percentage complete during FFmpeg encoding

### Implementation Pattern

```javascript
// Renderer sends to Main
ipcRenderer.send('file-dropped', filePath);

// Main sends to Renderer
mainWindow.webContents.send('metadata-response', { duration, width, height });
```

## Component Relationships

### Core UI Components (Renderer)

```
App.tsx ✅
├── ImportArea.tsx ✅ (Handles drag-and-drop) - 🚧 In Progress
├── PreviewPlayer.tsx ✅ (Contains <video> element)
└── Timeline.tsx ✅
    ├── ClipBar (Visual representation of video) - Not yet implemented
    ├── StartHandle (Trim in point) - Not yet implemented
    ├── EndHandle (Trim out point) - Not yet implemented
    └── Playhead (Current time indicator) - Not yet implemented
```

**Status Legend:**
- ✅ = Component created, basic structure in place
- 🚧 = Currently being implemented
- (not marked) = Not yet started

### State Flow

1. **Import Flow:**
   - User drags file → ImportArea captures event → Sends path via IPC → Main validates → Main probes metadata → Main sends metadata back → Renderer updates state → Video element loads

2. **Trim Flow:**
   - User drags handle → Renderer updates inTime/outTime state → UI re-renders clip bar → Handles repositioned

3. **Preview Sync Flow:**
   - User moves playhead → Renderer updates playhead position state → UI re-renders playhead → Video element currentTime updated

4. **Export Flow:**
   - User clicks Export → Renderer sends export-request with inTime/outTime → Main shows save dialog → Main constructs FFmpeg command → Main executes command → Main sends progress updates → Main sends completion → Renderer updates UI

## Key Technical Decisions

### Why Electron?
- Mature desktop APIs
- Built-in Node.js for file/process management
- No need for external server
- Native dialog support

### Why fluent-ffmpeg?
- Node.js wrapper for FFmpeg
- Executes native encoding from main process
- Good progress event handling
- Proven in production environments

### Why HTML5 Video?
- Fastest way to achieve real-time preview
- Built-in in every browser/Electron renderer
- No additional libraries required
- Direct currentTime control for synchronization

### Why Sequential PRs?
- Each PR is testable independently
- Clear checkpoint milestones
- Reduces integration risk
- Builds complexity incrementally

## Design Patterns Used

### 1. Main/Renderer Split Pattern
- Isolates file system and media processing in Main
- Keeps UI rendering in Renderer
- IPC bridges the gap

### 2. Event-Driven Architecture
- User actions trigger events
- Events flow through IPC
- State updates trigger re-renders

### 3. Visual Feedback Pattern
- Timeline reflects internal state (inTime/outTime)
- Playhead reflects video currentTime
- UI always represents true application state

### 4. Progressive Enhancement Pattern
- Start with basic import
- Add preview
- Add trimming
- Add export
- Add polish

## Security Considerations

- File validation happens in Main process before processing
- Only .mp4 and .mov extensions accepted
- FFmpeg commands use validated input paths
- No user code execution from UI inputs
- Native save dialog prevents path traversal issues

## Performance Patterns

### Efficient Video Loading
- Single video element, updates currentTime (not reload src)
- Metadata probed once at import
- No thumbnail generation overhead

### Timeline Rendering
- Clip bar scaled to available width
- Drag handles are lightweight DOM elements
- No complex animations needed

### Export Progress
- Listen to FFmpeg progress events (not polling)
- Send percentage complete via IPC
- UI updates on progress events

