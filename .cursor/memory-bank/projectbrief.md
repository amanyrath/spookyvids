# Project Brief: ClipForge

**Project Status:** PR 1 Complete, PR 2 In Progress (Drag-and-Drop Implementation)  
**Technology Selected:** React + TypeScript + Tailwind CSS + Electron  
**Last Updated:** Memory Bank Update

## Project Overview

**ClipForge** is a desktop video editor designed for Mac and Windows with a focused goal: establish a minimal viable media processing and UI pipeline. This MVP aims to prove that a desktop video editor can be built with a modern tech stack in a constrained timeframe.

## Core Mission

Build a working desktop video editor that demonstrates:
- Native application launch and execution
- Video file import and basic processing
- User-driven trimming capabilities
- Successful video export pipeline

## Project Constraints

### Deadline
**Tuesday, October 28th, 10:59 PM CT** - This is a **24-Hour Hard Gate** checkpoint.

### Scope Limitations
- Desktop platforms only (Mac/Win)
- Single video import at a time
- MP4 and MOV formats only
- Drag-and-drop import only (no file picker)
- Single track timeline
- Basic trimming only
- Fixed quality exports

### Out of Scope (Explicitly)
- Recording features (screen, webcam, microphone)
- Multiple tracks
- Complex editing features (split, delete, undo/redo)
- Media library or advanced management
- Text overlays, transitions, filters
- Audio controls beyond basic export
- Cloud storage or auto-save
- File picker interface

## Success Criteria

The MVP is successful if:
1. **App Launch:** Application launches as a built and packaged native executable
2. **Basic Import:** User can load a video file via drag-and-drop
3. **Functional Trim:** User can set in/out points with visual handles
4. **Export Success:** Application can render trimmed clip to new MP4 file

## Development Philosophy

**Use built-in functionality and industry standards wherever possible:**
- Electron's dialog module for file operations
- HTML5 `<video>` element for preview playback
- fluent-ffmpeg/ffprobe for video metadata and processing
- Fast UI integration with minimal complexity

## Related Documents

- `ClipForge PRD.md` - Full project requirements document
- `ClipForge Task List.md` - Sequential PR breakdown for implementation

