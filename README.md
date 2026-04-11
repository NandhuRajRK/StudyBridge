# StudyBridge

StudyBridge is a Gemma-powered study companion for the Gemma 4 Good Hackathon. It helps students turn course materials into explanations, flashcards, quizzes, notes, and study plans.

## Stack

- Vite + React
- Supabase for the web build only
- Local file-backed storage for the desktop app
- `llama.cpp` local Gemma runtime for offline desktop AI
- Google API key BYOK mode for cloud AI
- Tailwind + shadcn-style UI components

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Desktop Wrapper

Run the app as a desktop shell during development:

```bash
npm run desktop:dev
```

Package the already-built app for Windows:

```bash
npm run build
npm run desktop:build
```

On first launch the desktop app will ask whether you want:

- Local Gemma through `llama.cpp`, which caches the runtime and model on disk
- Google API key mode, which uses your own key from Google
- Or to defer the choice and stay disabled until you pick a mode in Settings

You can change the choice later in Settings. If AI is not configured, the tutor and planner point you back to that page.

The desktop build is local-first and does not require Supabase. The web build can still use the Supabase-backed path if you want a hosted version.

Set these values in `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_LLM_MODE=local
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=gemma4:e2b
```

## Local AI Setup

The desktop app uses `llama.cpp` and downloads the right Gemma 4 GGUF model on first use after you opt in. If you prefer cloud AI, add a Google API key in Settings and choose a Gemini model there.

## Web Setup

If you want the browser version, set the Supabase values in `.env.local` and deploy the existing database/function setup.

## Platform Notes

- Windows and macOS are the best targets for the desktop wrapper.
- ChromeOS is best handled as the web app/PWA version, since native Electron packaging is not a good fit for Chromebooks.

## Verification

```bash
npm run build
npm run lint
npm audit --audit-level=moderate
```
