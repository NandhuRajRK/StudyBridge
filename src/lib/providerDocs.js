export const AGENT_PROVIDER_DOCS = [
  {
    value: "opencode-cli",
    label: "OpenCode CLI",
    shortLabel: "OpenCode",
    docsUrl: "https://opencode.ai/docs",
    installCommand: "npm install -g opencode-ai",
    description: "Open-source agent orchestrator that can run against a local Gemma runtime.",
  },
  {
    value: "gemini-cli",
    label: "Google Gemini CLI",
    shortLabel: "Gemini CLI",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
    installCommand: "npm install -g @google/gemini-cli",
    description: "Google's terminal agent for Gemini models and cloud-backed workflows.",
  },
  {
    value: "claude-code",
    label: "Claude Code CLI",
    shortLabel: "Claude Code",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    description: "Anthropic's terminal agent for Claude-based workflows.",
  },
  {
    value: "codex-cli",
    label: "OpenAI Codex CLI",
    shortLabel: "Codex CLI",
    docsUrl: "https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started",
    installCommand: "npm install -g @openai/codex",
    description: "OpenAI's terminal agent for Codex-backed workflows.",
  },
];

export const OFFICIAL_RUNTIME_DOCS = [
  {
    label: "Google Gemini CLI",
    href: "https://github.com/google-gemini/gemini-cli",
    note: "Use this when you want Google's terminal agent to orchestrate background AI tasks.",
  },
  {
    label: "Google Gemma docs",
    href: "https://ai.google.dev/gemma/docs/run",
    note: "Official runtime and deployment guidance for Gemma models.",
  },
  {
    label: "Google Gemini API key docs",
    href: "https://ai.google.dev/gemini-api/docs/api-key",
    note: "How to create a Google API key for cloud AI in StudyBridge.",
  },
  {
    label: "OpenAI Codex CLI docs",
    href: "https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started",
    note: "Official Codex CLI setup and usage guide.",
  },
  {
    label: "Claude Code docs",
    href: "https://docs.anthropic.com/en/docs/claude-code/overview",
    note: "Official Claude Code terminal workflow documentation.",
  },
  {
    label: "OpenCode docs",
    href: "https://opencode.ai/docs",
    note: "Open-source CLI orchestration docs for local agent workflows.",
  },
];

export function getAgentProviderDoc(value) {
  return AGENT_PROVIDER_DOCS.find((item) => item.value === value) || null;
}
