# StudyBridge

StudyBridge is a local-first AI study companion for students. It keeps courses, uploads, notes, tasks, progress, and AI tutoring in one grounded system instead of scattering them across separate tools.

The app is built for:

- Students who need offline or unstable-internet support
- Students who want one place for materials, notes, progress, and study planning
- Teachers, mentors, and reviewers who want a clear student workflow to evaluate
- Hackathon and portfolio demos that need a real product story, not just a chatbot

## What It Does

- AI Tutor with course-aware grounded replies
- Study sessions with summaries, flashcards, quizzes, notes, and chat
- Planner with actionable tasks and calendar export
- Library for materials, notes, saved answers, guides, and chats
- Mind map creation, editing, and export
- Desktop local AI with `llama.cpp`
- Optional BYOK cloud AI with Google, OpenAI, or Anthropic API keys
- Optional CLI orchestrators for advanced agent workflows

## How It Works

StudyBridge keeps the app in control of the important parts:

- The UI builds course, profile, topic, and upload context
- The model or CLI returns structured output
- StudyBridge validates that output before any write happens
- Writes and deletes are staged for explicit approval
- Desktop storage uses SQLite and local files
- The web build can still use Supabase

This lets the app stay:

- grounded
- local-first
- safer to review
- easier to explain in a demo

## User Documentation

The full student guide lives inside the app at `Docs`.

For provider-specific setup and official references, use the `Official docs` dropdown in `Settings`.

## Desktop And Web

### Desktop

- Windows and macOS are the main desktop targets
- Local AI runs through `llama.cpp`
- The app auto-selects a Gemma variant based on available memory
- OpenCode, Gemini CLI, Claude Code, and Codex CLI are optional on-demand providers

### Web

- The web build can keep using Supabase
- ChromeOS users should use the web/PWA version rather than Electron

## Official Runtime Docs

- OpenAI Codex CLI: https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started
- Anthropic Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview
- OpenCode docs: https://opencode.ai/docs
- Google Gemma docs: https://ai.google.dev/gemma/docs/run
- Google Gemini CLI: https://github.com/google-gemini/gemini-cli
- Google Gemini API key docs: https://ai.google.dev/gemini-api/docs/api-key

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
- Google, OpenAI, or Anthropic API key BYOK mode
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

## Hackathon Positioning

StudyBridge is a strong hackathon submission because it shows:

- A real student workflow
- Offline-first and low-connectivity support
- Grounded retrieval instead of generic chat
- Local-first data handling
- Optional cloud AI without forcing it on the user
- A clear architecture that can be explained in a review or demo

## License And Liability

StudyBridge is provided as-is, free of charge, without warranty.
Users should evaluate it for their own environment and risk tolerance before relying on it for important academic or production use.
