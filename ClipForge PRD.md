# **ClipForge MVP Project Requirements Document (PRD)**

Project Name: ClipForge  
Target: Desktop Video Editor (Mac/Win)  
Goal: Establish the minimal viable media processing and UI pipeline.  
Deadline: Tuesday, October 28th, 10:59 PM CT (24-Hour Hard Gate)

## **1\. Core Technology Stack (Binding Decisions)**

This technology stack is chosen for maximum velocity and minimal setup complexity, focusing on the core requirement of media I/O.

| Component | Technology / Strategy | Rationale |
| :---- | :---- | :---- |
| **Desktop Framework** | **Electron** | Used for mature desktop environment APIs and bundled Node.js for file/process management. |
| **Media Processing** | **fluent-ffmpeg** | Node.js wrapper for FFmpeg. Executes native encoding commands from the main Electron process. |
| **Frontend UI** | **React / Vue / Svelte** | Developer's choice, but must be fast to integrate (e.g., simple CSS/Tailwind for aesthetics). |
| **Video Playback** | Standard HTML5 \<video\> element. | Fastest way to achieve real-time preview in the renderer process. |

## **2\. Minimal Viable Product (MVP) Requirements**

### **R1: Hard Gate Checkpoint (MUST BE MET)**

1. **App Launch:** The application must launch as a **built and packaged native executable** (not running in development mode).  
2. **Basic Import:** User can successfully load a video file into memory and display it.  
3. **Functional Trim:** User can set new in/out points on the clip.  
4. **Export Success:** The application can execute a command to render the trimmed clip to a new MP4 file.

### **R2: User Interface & Experience**

| Area | Requirement | Details / Constraint |
| :---- | :---- | :---- |
| **Layout** | Single Window Interface | Must contain clear areas for **Import**, **Preview**, and **Timeline**. |
| **Import** | **Drag and Drop Only** | User must be able to drag a single file (MP4/MOV) onto the main window to add it to the timeline. File Picker is excluded. |
| **File Formats** | MP4 and MOV | Support is strictly limited to these two common formats for the MVP. |

### **R3: Preview and Timeline**

| Area | Requirement | Details / Constraint |
| :---- | :---- | :---- |
| **Preview Player** | Real-Time Synchronization | The \<video\> element must display the clip and maintain sync with the timeline playhead position. |
| **Timeline View** | **Visual Clip Bar** | A single track is required. The clip should be represented visually (e.g., a colored bar or simple thumbnail). |
| **Playhead** | Current Time Indicator | A vertical line indicating the current playback time, synchronized with the video element. |
| **Trimming** | **Visual Drag Handles** | The clip bar must have draggable handles on the start and end points to visually set the in/out times (the duration being exported). |
| **Time Data** | Time values (e.g., start/end seconds) must be captured and passed to the fluent-ffmpeg command. |  |

### **R4: Export Pipeline**

| Area | Requirement | Details / Constraint |
| :---- | :---- | :---- |
| **Output Format** | **MP4** | Final encoded file must be MP4. |
| **Resolution** | **Source Resolution Only** | The output video must match the imported clip's original resolution. No resolution options are required. |
| **Quality** | **Fixed Quality** | Use a reasonable, fixed constant quality (e.g., a good CRF value) in FFmpeg to ensure the output is fast to encode and maintains reasonable quality without user controls. |
| **I/O** | Save Dialog & Progress | Provide a button to trigger the export, open a native save file dialog, and display a basic **progress indicator** (e.g., a simple spinner or percentage output from fluent-ffmpeg). |

## **3\. Strict Exclusion List (Out of Scope for MVP)**

The following features from the full specification are **excluded** to ensure the 24-hour deadline is met by focusing only on the core loop:

* **Recording Features:** Screen, webcam, and microphone capture.  
* **Editing Features:** Splitting clips, deleting clips, multiple tracks, timeline zooming, snap-to-clip, undo/redo.  
* **Media Management:** Media library panel, auto-generated thumbnails, metadata display (beyond basic clip representation).  
* **Advanced Features:** Text overlays, transitions, audio controls, filters, export presets, cloud storage, auto-save.  
* **Input:** File Picker interface.