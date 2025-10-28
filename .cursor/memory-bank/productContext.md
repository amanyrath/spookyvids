# Product Context: ClipForge

**Current Status:** PR 1 Complete, PR 2 In Progress  
**Last Updated:** Memory Bank Update

ClipForge is an MVP designed to validate the core video editing workflow in a desktop environment. The project solves the fundamental question: **Can we build a working video editor with modern web technologies that runs natively on desktop?**

## Problems It Solves

### User's Problem
Users need a simple, fast way to:
- Trim video clips quickly
- Visualize the trim points
- Export high-quality results

### Technical Challenge
Prove that Electron + FFmpeg can deliver a viable video editing experience with:
- Real-time video preview synchronization
- Visual timeline interaction
- Reliable media processing pipeline

## How It Should Work

### User Experience Flow

1. **Launch the App**
   - User opens the native executable
   - Clean interface appears with three distinct areas

2. **Import Video**
   - User drags an MP4 or MOV file into the import area
   - Video metadata is extracted automatically
   - Video preview loads and displays

3. **Trim the Video**
   - User sees a visual timeline with the clip represented as a bar
   - Drag handles appear on the start and end of the clip
   - As user drags handles, the video preview updates in real-time
   - Playhead allows scrubbing through the video

4. **Export the Result**
   - User clicks Export button
   - Native save dialog appears
   - User chooses output location
   - Progress indicator shows export status
   - New MP4 file is created with the trimmed content

## User Experience Goals

### Visual Design Goals
- **Clear Layout:** Three distinct panels (Import, Preview, Timeline)
- **Visual Feedback:** Clip bar representation shows the full video
- **Drag and Drop:** Smooth file import via drag-and-drop
- **Responsive:** Interface adapts to different window sizes
- **Professional:** Clean, modern appearance

### Interaction Goals
- **Real-time Sync:** Timeline playhead movement instantly updates video preview
- **Intuitive Trimming:** Drag handles feel natural and responsive
- **Clear Progress:** Export status is always visible during processing
- **No File Picker:** Drag-and-drop is the only import method for speed

### Performance Goals
- **Fast Launch:** Application loads quickly
- **Smooth Playback:** Video preview plays without stuttering
- **Reliable Export:** FFmpeg commands execute successfully
- **Responsive UI:** Interface doesn't freeze during operations

## Technical User Requirements

Users must be able to:
- Drag video files (MP4/MOV) onto the application
- See video preview synchronized with timeline position
- Drag visual trim handles to set in/out points
- Click Export button to save a trimmed MP4 file

Users should **not** be able to:
- Import multiple videos at once
- Use a file picker to import
- Split or delete clips
- Add text, transitions, or effects
- Change export quality or resolution settings

