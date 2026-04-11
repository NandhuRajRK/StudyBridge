# StudyBridge

StudyBridge is a local-first AI study companion for students. It turns courses, uploads, notes, tasks, quizzes, flashcards, and study sessions into one grounded system instead of a pile of disconnected tools.

It is designed for:

- Students who need offline or unstable-internet support
- Students who want one place for materials, notes, progress, and AI tutoring
- Teachers or mentors who want a clearer study workflow for learners
- A hackathon / portfolio demo that shows real product utility, not just a chatbot

## What It Does

- AI Tutor with course-aware context and grounded replies
- Study sessions with summaries, flashcards, quizzes, notes, and chat
- Planner with actionable tasks and calendar export
- Library for materials, notes, saved answers, guides, and chats
- Mind map creation and export
- Desktop local AI with `llama.cpp`
- Optional BYOK cloud AI using a Google API key
- Optional CLI orchestrators for advanced agent workflows

## Architecture

StudyBridge uses a layered AI architecture:

- The app builds the course, topic, profile, and upload context itself
- The model or CLI returns structured JSON
- StudyBridge validates the output before anything is written
- Writes and deletes are staged for explicit user approval
- The local desktop app stores data in SQLite
- The web build can still use Supabase

This means the app keeps control of:

- data integrity
- safety limits
- approvals
- course-grounded retrieval
- local-first behavior

## Desktop And Web

### Desktop

- Windows and macOS are the main desktop targets
- Local AI runs through `llama.cpp`
- The app auto-selects a Gemma variant based on available memory
- OpenCode CLI is the preferred open-source background agent path for local Gemma orchestration

### Web

- The web build can keep using Supabase
- This is the easiest path for a hosted demo
- ChromeOS users should use the web/PWA version rather than Electron

## Official Runtime Docs

- OpenAI Codex CLI: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Anthropic Claude / Claude Code starting point: https://docs.anthropic.com/en/docs/quickstart
- OpenCode docs: https://opencode.ai/docs
- OpenCode config docs: https://opencode.ai/docs/config
- Google Gemma docs: https://ai.google.dev/gemma/docs/functiongemma
- Google Gemini CLI repo/docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/index.md

Note:
- Google has a CLI for Gemini models.
- That is not the same thing as a Gemma runtime.
- For local Gemma, StudyBridge uses `llama.cpp`.

## Student And Teacher UX

The UI is organized around the student workflow:

- Add a course
- Upload or create materials
- Review topics and progress
- Study with grounded AI
- Save notes, flashcards, and answers
- Export study artifacts

Teacher-facing value is simpler:

- The course context is structured
- Materials and progress are visible
- Study outputs are reusable
- The workflow is explainable in a demo or portfolio pitch

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Desktop Development

```bash
npm run desktop:dev
```

## Packaging

Build the web app first, then package the desktop app:

```bash
npm run build
npm run desktop:build
```

If Windows packaging fails with symlink privilege errors, run the terminal as Administrator or enable Windows Developer Mode. Electron Builder downloads a signing helper that needs symlink support on Windows.

## AI Modes

StudyBridge supports three main AI paths:

- Local Gemma through `llama.cpp`
- Google API key BYOK mode
- Optional CLI orchestrators for background agent workflows

When AI is not configured, the app does not guess. It points the user back to Settings.

## Upload Parsing

StudyBridge extracts and chunks uploaded content so the AI can use the real course text:

- Plain text files
- DOCX
- PPTX
- PDF text layers

Scanned PDFs and image-only uploads do not use OCR yet, so those are weaker unless they contain embedded text.

## Validation

```bash
npm run build
npm run lint
```

## Implementation Notes

- Desktop storage uses SQLite
- Material uploads store extracted text and chunked passages
- AI write actions are staged behind approval
- Calendar exports use standard ICS / Google Calendar links
- Flashcards export to Anki-friendly TSV
- Mind maps export to OPML and Markdown

## Hackathon Positioning

StudyBridge is a good hackathon submission because it shows:

- A real student workflow
- Offline-first and low-connectivity support
- Grounded retrieval instead of generic chat
- Local-first data handling
- A clear AI architecture that can be explained in a demo
- Optional cloud AI without forcing it on the user

## License And Liability

StudyBridge is provided as-is, free of charge, without warranty.
Users should evaluate it for their own environment and risk tolerance before relying on it for important academic or production use.

