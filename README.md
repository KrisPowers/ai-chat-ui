# Larry AI - A Ollama Chat UI

Larry AI is a local multi-panel chat UI for Ollama, built with React + TypeScript + Vite, for all types of working including coding, chat-bot expereinces, and creative work.

## Requirements

- [Node.js](https://nodejs.org/) v18+
- [Ollama](https://ollama.com/) running locally

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start Ollama with CORS enabled
OLLAMA_ORIGINS=* ollama serve
# On Windows (PowerShell):
# $env:OLLAMA_ORIGINS="*"; ollama serve

# 3. Start the dev server
npm run dev
```

Then open http://localhost:5173 in your browser.

## Build for production

```bash
npm run build
npm run preview
```

## Features

- Up to 4 side-by-side chat panels
- Per-panel model selection (auto-fetched from Ollama)
- Streaming responses token-by-token
- Stop generation mid-stream
- Code block detection with syntax badge, copy, and **download** buttons
  - Supports: JS/TS/JSX/TSX, MD, HTML/CSS/SCSS, Python, JSON, Bash, SQL, YAML, and more
- Inline markdown rendering (headings, bold/italic, lists, blockquotes, tables, inline code)
- IndexedDB persistence — all chats saved locally, no size limit
- History modal with search + delete
- Chat rename (click the title in the panel header)
- Toast notifications

## Project Structure

```
src/
  components/
    ChatPanel.tsx      # Individual chat panel with streaming
    CodeBlock.tsx      # Code block with copy/download
    HistoryModal.tsx   # Centered history popup
    MessageBubble.tsx  # Message renderer
  hooks/
    useOllama.ts       # Model fetching + status polling
    useDB.ts           # IndexedDB CRUD
    useToast.tsx       # Toast context + provider
  lib/
    db.ts              # Raw IndexedDB operations
    markdown.ts        # Markdown parser + code block extractor
    ollama.ts          # Ollama API client (streaming)
  types/
    index.ts           # Shared TypeScript types
  App.tsx
  main.tsx
  styles.css
```

## Roadmap

- Add custom skill/context presets, that can be selected chat-by-chat like the model. Presets are hard-coded, and can be modified via the source files. The preset selected would pretty much just turn BASE_SYSTEM_PROMPT into it's content.
  - Code Preset
  - Chatbot Preset
  - Creative Preset
- Add a file-upload button, that permits all file types, including zips.
- Add addition/delete metrics into code-snippets (+100 / -55).
- Add a project directory button (set to a chat), to select a directory for the AI Charbot to focus on, to edit, improve, etc. This would input the directories files that the user selects, into the project files section.
- Remove file's being printed at the end of each message, instead, use Codex style of referencing the file & it's directory, and how many changes it made (addition/delete metrics)
- Ensure that the Code preset instructs the AI to provide an overview of the changes made, a change-log at the end of any message that changes any files.