# **ClipForge MVP Development Task List**

This task list breaks down the **ClipForge MVP Project Requirements Document (clipforge\_mvp\_prd.md)** into six sequential Pull Request (PR) chunks. Each PR is designed to be small, testable, and adhere to industry standard best practices.

## **Developer Mandate**

**Use built-in functionality and industry standards wherever possible.** Specifically:

1. Use **Electron's dialog module** for file saving (R4).  
2. Use **HTML5 \<video\>** for preview playback (R3).  
3. Use **fluent-ffmpeg / ffprobe** to retrieve video metadata (R3/R4).

## **🟢 PR 1: Foundation & Project Scaffolding**

| Task Area | Description | Related PRD |
| :---- | :---- | :---- |
| **Electron Setup** | Initialize the Electron main process (main.js) and define the basic window settings. | R1: App Launch |
| **Dependencies** | Install core packages: electron, UI Framework (e.g., React), fluent-ffmpeg, and necessary IPC setup libraries. | R1: Hard Gate Checkpoint |
| **IPC Channels** | Define robust Inter-Process Communication (IPC) channels for: file-dropped (Renderer to Main), metadata-response (Main to Renderer), and export-request (Renderer to Main). | R2, R4 |
| **Basic Layout** | Implement the base UI structure in the Renderer process for the three core panels: **Import Area**, **Preview Player**, and **Timeline**. Use responsive CSS (e.g., Tailwind/Flexbox). | R2: Layout |

#### **Acceptance Criteria & Testing**

| Criterion | Testing Steps |
| :---- | :---- |
| **AC1:** Application launches successfully. | Launch packaged executable/development runner (npm start). Verify the main window appears. |
| **AC2:** No console errors/warnings. | Check both the Main and Renderer console logs. |
| **AC3:** Layout panels are visually distinct. | Verify the Import, Preview, and Timeline areas are clearly defined on screen. |

## **🟠 PR 2: Drag-and-Drop & File Handling**

| Task Area | Description | Related PRD |
| :---- | :---- | :---- |
| **D\&D Listener** | Implement dragover, dragleave, and drop event listeners on the Import Area in the Renderer. | R2: Drag and Drop Only |
| **Path Transfer** | Send the dropped file path from the Renderer to the Main process via the file-dropped IPC channel. | R2: Drag and Drop Only |
| **Validation** | Main process must validate the file extension (must be .mp4 or .mov) before proceeding. | R2: File Formats |
| **State Storage** | Store the valid file path in the application state, ready for metadata extraction. | R2: Basic Import |

#### **Acceptance Criteria & Testing**

| Criterion | Testing Steps |
| :---- | :---- |
| **AC1:** Valid files are accepted. | Drag and drop an MP4 file. Verify the path is received in the Main process console. |
| **AC2:** Invalid files are rejected gracefully. | Drag and drop a .txt or .jpg file. Verify the Main process rejects the file and no state change occurs. |

## **🟡 PR 3: Media Preview & Metadata Extraction**

| Task Area | Description | Related PRD |
| :---- | :---- | :---- |
| **FFprobe Integration** | Main process uses fluent-ffmpeg's metadata functionality (via ffprobe) to analyze the imported file. | R3: Time Data, R4: Resolution |
| **Data Extraction** | Extract the clip duration (in seconds) and video resolution (width, height). | R3/R4 |
| **Renderer State Update** | Send the duration and resolution back to the Renderer via IPC (metadata-response) and update the clip state. | R3/R4 |
| **Video Element Setup** | Load the HTML5 \<video\> element in the Preview area using the file path as the src. | R3: Preview Player |

#### **Acceptance Criteria & Testing**

| Criterion | Testing Steps |
| :---- | :---- |
| **AC1:** Video loads and plays. | Import a video. Verify the video preview element loads the content and can be manually played. |
| **AC2:** State reflects accurate metadata. | Check the UI/console to confirm the state variables hold the correct numeric duration and resolution (e.g., 1920x1080). |

## **🟣 PR 4: Timeline & Trimming UI/Logic**

| Task Area | Description | Related PRD |
| :---- | :---- | :---- |
| **Clip Bar Rendering** | Render the visual clip bar in the Timeline, scaled to fit the available space using the extracted duration. | R3: Timeline View |
| **Drag Handles Implementation** | Implement two draggable DOM elements for the start (inTime) and end (outTime) points of the clip bar. | R3: Visual Drag Handles, R3: Functional Trim |
| **Time Conversion** | Implement logic to convert the pixel position of the drag handles back into inTime and outTime in seconds. | R3: Time Data |
| **Player Sync (Scrub)** | Implement a playhead scrubber. Moving the playhead must instantly update the \<video\> element's currentTime to synchronize the preview. | R3: Real-Time Synchronization |

#### **Acceptance Criteria & Testing**

| Criterion | Testing Steps |
| :---- | :---- |
| **AC1:** Trimming handles function correctly. | Drag the start handle to remove the first 10 seconds. Verify inTime is \~10.0 in the application state. |
| **AC2:** Player sync works. | Drag the playhead to the middle of the clip. Verify the video preview instantly updates to that frame. |

## **🔵 PR 5: FFmpeg Export Logic**

| Task Area | Description | Related PRD |
| :---- | :---- | :---- |
| **Export Button** | Implement the "Export" button in the Renderer to trigger the export pipeline via IPC (export-request). | R4: I/O |
| **Save Dialog** | Main process uses **dialog.showSaveDialog()** to ask the user for the output file location (ensuring a .mp4 extension). | R4: I/O (Best Practice) |
| **Command Construction** | Use fluent-ffmpeg with the following key options: .input(sourcePath), .seek(inTime), .duration(outTime \- inTime), and fixed quality setting (e.g., .videoCodec('libx264').outputOptions('-crf 23')). | R4: Output Format, Quality |
| **Execution** | Execute the FFmpeg command and handle the completion or error states. | R4: Export Success |

#### **Acceptance Criteria & Testing**

| Criterion | Testing Steps |
| :---- | :---- |
| **AC1:** Export dialogue appears. | Click the Export button. Verify the native file save dialog opens. |
| **AC2:** Trimmed export is correct. | Set a specific trim (e.g., cut out the middle third). Export the clip and verify the resulting video file has the correct duration and content. |
| **AC3:** Untrimmed export is correct. | Export the clip with no handles moved. Verify the output video is identical to the source. |

## **⚫ PR 6: Polish, Progress & Final Build**

| Task Area | Description | Related PRD |
| :---- | :---- | :---- |
| **Progress Indicator (Renderer)** | Implement UI element (spinner or text) to display export progress. | R4: Save Dialog & Progress |
| **Progress Reporting (Main)** | Implement fluent-ffmpeg's .on('progress', ...) listener in the Main process to calculate and send percentage complete to the Renderer via IPC. | R4: Save Dialog & Progress |
| **UI Polish** | Review and finalize styling to ensure a professional, responsive, and visually cohesive user interface across all three panels. | R2: Layout |
| **Build Configuration** | Configure the production build process (e.g., using electron-builder or equivalent) to prepare the native executable. | R1: App Launch |

#### **Acceptance Criteria & Testing**

| Criterion | Testing Steps |
| :---- | :---- |
| **AC1:** Progress is displayed. | Trigger an export. Verify the progress indicator appears and updates accurately until completion. |
| **AC2:** Responsiveness is maintained. | Resize the application window significantly. Verify the Preview Player and Timeline adjust gracefully without scroll bars. |
| **AC3:** Final product is runnable. | Build the application and launch the final native executable. Verify all core functions (Import, Trim, Export) work in the built product. |

