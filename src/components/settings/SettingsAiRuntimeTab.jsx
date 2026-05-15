import { Bot, CheckCircle2, ExternalLink, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, Section } from "@/components/settings/SettingsFormParts";

export default function SettingsAiRuntimeTab({
  t,
  isDesktop,
  aiSettings,
  setAiSettings,
  normalizeMode,
  normalizeOllamaUrl,
  normalizeOllamaModel,
  applyAiSettings,
  setOllamaUrlDraft,
  codexStatus,
  checkingCodex,
  handleOpenCodexLogin,
  handleInstallCodex,
  handleCheckCodex,
  aiRuntime,
  setAiRuntime,
  handleClearApiKey,
  normalizeOpenAiModel,
  openAiModelOptions,
  ollamaModelOptions,
  defaultOllamaUrl,
  defaultAiSettings,
  toast,
}) {
  if (!isDesktop) {
    return (
      <Section icon={Bot} title={t("settings.aiRuntime")}>
        <p className="text-sm text-muted-foreground">
          This build is desktop-only. AI settings are available inside the Electron app.
        </p>
        <p className="text-sm">
          {t("settings.googleApiKeyDocs")}:{" "}
          <a className="text-primary underline underline-offset-4" href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">
            ai.google.dev/gemini-api/docs/api-key
          </a>
        </p>
      </Section>
    );
  }

  return (
    <Section icon={Bot} title={t("settings.aiRuntime")}>
      <div className="grid gap-4">
        <Field label={t("settings.aiMode")}>
          <Select value={aiSettings.mode} onValueChange={async (v) => {
            const next = {
              ...aiSettings,
              mode: normalizeMode(v),
              agentProvider: "none",
              localModelConsent: v === "local" ? true : aiSettings.localModelConsent,
              ollamaUrl: normalizeOllamaUrl(aiSettings.ollamaUrl),
              ollamaModel: normalizeOllamaModel(aiSettings.ollamaModel),
            };
            setOllamaUrlDraft(next.ollamaUrl);
            await applyAiSettings(next);
          }}>
            <SelectTrigger><SelectValue placeholder="Choose mode..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="codex">Codex CLI</SelectItem>
              <SelectItem value="disabled">{t("settings.disabled")}</SelectItem>
              <SelectItem value="local">Local AI</SelectItem>
              <SelectItem value="cloud">Cloud API keys</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {aiSettings.mode === "codex" && (
          <p className="text-sm text-muted-foreground">
            Use your local Codex CLI login for desktop AI generation. Local Gemma and cloud API keys remain optional fallbacks.
          </p>
        )}

        {aiSettings.mode === "codex" && (
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <p className="font-medium">AI Provider</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  StudyBridge uses your local Codex CLI login for OpenAI-backed desktop AI generation. Codex CLI handles login; StudyBridge does not store an OpenAI API key.
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${
                codexStatus.installed ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
              }`}>
                {codexStatus.installed && <CheckCircle2 className="w-3.5 h-3.5" />}
                {codexStatus.installed ? "Codex installed" : "Codex not detected"}
              </span>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              {codexStatus.installed ? (
                <p><span className="font-medium">Detected:</span> {codexStatus.version || "Codex CLI"}</p>
              ) : (
                <p className="text-muted-foreground">{codexStatus.error || "Run Check Codex to detect your local CLI."}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleOpenCodexLogin} disabled={!codexStatus.installed} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Login with Codex
              </Button>
              {!codexStatus.installed && (
                <Button type="button" variant="outline" onClick={handleInstallCodex} className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Install Codex CLI
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleCheckCodex} disabled={checkingCodex} className="gap-2">
                {checkingCodex ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                Check status
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generation runs hidden in the background with <code>codex exec -m gpt-5.1-codex-mini --skip-git-repo-check --sandbox read-only --color never -</code>.
            </p>
          </div>
        )}

        {aiSettings.mode === "local" && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">Local AI</p>
                <p className="text-xs text-muted-foreground">
                  StudyBridge treats llama.cpp and Ollama as the same local workflow. Pick the backend that is already installed on this machine.
                </p>
              </div>
              <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-1">
                {aiRuntime?.model || aiRuntime?.label || "Auto-selected"}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Local backend">
                <Select value={aiSettings.localBackend || "llama_cpp"} onValueChange={async (value) => {
                  const next = {
                    ...aiSettings,
                    mode: "local",
                    localBackend: value,
                    localModelConsent: true,
                    ollamaUrl: normalizeOllamaUrl(aiSettings.ollamaUrl),
                    ollamaModel: normalizeOllamaModel(aiSettings.ollamaModel),
                  };
                  setOllamaUrlDraft(next.ollamaUrl);
                  await applyAiSettings(next);
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose backend..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llama_cpp">llama.cpp Gemma</SelectItem>
                    <SelectItem value="ollama">Ollama</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {aiSettings.localBackend === "ollama" ? (
                <>
                  <Field label="Ollama URL">
                    <Input
                      value={aiSettings.ollamaUrl || defaultOllamaUrl}
                      onChange={(e) => setAiSettings(f => ({ ...f, ollamaUrl: e.target.value }))}
                      onBlur={async () => {
                        const normalizedUrl = normalizeOllamaUrl(aiSettings.ollamaUrl);
                        if (normalizedUrl === (aiSettings.ollamaUrl || defaultOllamaUrl)) return;
                        await applyAiSettings({
                          ...aiSettings,
                          mode: "local",
                          localBackend: "ollama",
                          localModelConsent: true,
                          ollamaUrl: normalizedUrl,
                          ollamaModel: normalizeOllamaModel(aiSettings.ollamaModel),
                        });
                      }}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </Field>
                  <Field label="Ollama model">
                    <Select
                      value={normalizeOllamaModel(aiSettings.ollamaModel)}
                      onValueChange={async (value) => {
                        await applyAiSettings({
                          ...aiSettings,
                          mode: "local",
                          localBackend: "ollama",
                          localModelConsent: true,
                          ollamaUrl: normalizeOllamaUrl(aiSettings.ollamaUrl),
                          ollamaModel: normalizeOllamaModel(value),
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose model..." /></SelectTrigger>
                      <SelectContent>
                        {ollamaModelOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {ollamaModelOptions.find((option) => option.value === normalizeOllamaModel(aiSettings.ollamaModel))?.note || "Recommended local model presets"}
                    </p>
                  </Field>
                </>
              ) : (
                <div className="rounded-md border bg-card/60 p-3 text-sm text-muted-foreground md:col-span-1">
                  The built-in Gemma runtime downloads llama.cpp and the selected model automatically when local consent is enabled.
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              The tutor and agent workflows use the same local path, so Ollama and the built-in runtime behave the same once configured.
            </p>
            {aiSettings.localBackend === "ollama" && aiRuntime?.status === "missing_provider" && (
              <Button
                type="button"
                variant="outline"
                className="w-fit gap-2"
                onClick={async () => {
                  if (!window.studybridgeDesktop?.installOllama) {
                    toast.error("Ollama installer is unavailable in this build");
                    return;
                  }
                  try {
                    const result = await window.studybridgeDesktop.installOllama();
                    if (result?.ok) {
                      toast.success("Ollama installation started");
                    } else {
                      toast.error(result?.error || "Failed to install Ollama");
                    }
                    if (window.studybridgeDesktop?.getRuntimeConfig) {
                      setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
                    }
                  } catch (error) {
                    toast.error(error?.message || "Failed to install Ollama");
                  }
                }}
              >
                <ExternalLink className="w-4 h-4" />
                Install Ollama
              </Button>
            )}
          </div>
        )}

        {aiSettings.mode === "cloud" && (
          <div className="grid gap-4">
            <Field label="Cloud provider">
              <Select value={aiSettings.cloudProvider || "google"} onValueChange={v => setAiSettings(f => ({ ...f, cloudProvider: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose provider..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {aiSettings.cloudProvider === "openai" ? (
              <>
                <Field label="OpenAI API key">
                  <Input
                    type="password"
                    value={aiSettings.openAiApiKey}
                    onChange={e => setAiSettings(f => ({ ...f, openAiApiKey: e.target.value, clearOpenAiApiKey: false, hasOpenAiApiKey: false }))}
                    placeholder={aiSettings.hasOpenAiApiKey ? "Stored on this device" : "Paste your OpenAI API key"}
                  />
                  {aiSettings.hasOpenAiApiKey && !aiSettings.openAiApiKey && (
                    <p className="text-xs text-muted-foreground">A key is already saved on this device. Leave this blank to keep it.</p>
                  )}
                  {aiSettings.hasOpenAiApiKey && (
                    <Button type="button" variant="ghost" className="w-fit px-0 text-xs text-destructive hover:text-destructive" onClick={() => handleClearApiKey("openai")}>
                      Clear saved key
                    </Button>
                  )}
                </Field>
                <Field label="OpenAI model">
                  <Select
                    value={normalizeOpenAiModel(aiSettings.openAiModel) || "__default__"}
                    onValueChange={v => setAiSettings(f => ({ ...f, openAiModel: v === "__default__" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose model..." /></SelectTrigger>
                    <SelectContent>
                      {openAiModelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button asChild variant="outline" className="w-fit gap-2">
                  <a href="https://platform.openai.com/docs" target="_blank" rel="noreferrer">
                    OpenAI docs <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </>
            ) : aiSettings.cloudProvider === "anthropic" ? (
              <>
                <Field label="Anthropic API key">
                  <Input
                    type="password"
                    value={aiSettings.anthropicApiKey}
                    onChange={e => setAiSettings(f => ({ ...f, anthropicApiKey: e.target.value, clearAnthropicApiKey: false, hasAnthropicApiKey: false }))}
                    placeholder={aiSettings.hasAnthropicApiKey ? "Stored on this device" : "Paste your Anthropic API key"}
                  />
                  {aiSettings.hasAnthropicApiKey && !aiSettings.anthropicApiKey && (
                    <p className="text-xs text-muted-foreground">A key is already saved on this device. Leave this blank to keep it.</p>
                  )}
                  {aiSettings.hasAnthropicApiKey && (
                    <Button type="button" variant="ghost" className="w-fit px-0 text-xs text-destructive hover:text-destructive" onClick={() => handleClearApiKey("anthropic")}>
                      Clear saved key
                    </Button>
                  )}
                </Field>
                <Field label="Anthropic model">
                  <Input
                    value={aiSettings.anthropicModel}
                    onChange={e => setAiSettings(f => ({ ...f, anthropicModel: e.target.value }))}
                    placeholder="claude-sonnet-4-0"
                  />
                </Field>
                <Button asChild variant="outline" className="w-fit gap-2">
                  <a href="https://docs.anthropic.com/" target="_blank" rel="noreferrer">
                    Anthropic docs <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </>
            ) : (
              <>
                <Field label={t("settings.googleApiKey")}>
                  <Input
                    type="password"
                    value={aiSettings.googleApiKey}
                    onChange={e => setAiSettings(f => ({ ...f, googleApiKey: e.target.value, clearGoogleApiKey: false, hasGoogleApiKey: false }))}
                    placeholder={aiSettings.hasGoogleApiKey ? "Stored on this device" : "Paste your Google API key"}
                  />
                  {aiSettings.hasGoogleApiKey && !aiSettings.googleApiKey && (
                    <p className="text-xs text-muted-foreground">A key is already saved on this device. Leave this blank to keep it.</p>
                  )}
                  {aiSettings.hasGoogleApiKey && (
                    <Button type="button" variant="ghost" className="w-fit px-0 text-xs text-destructive hover:text-destructive" onClick={() => handleClearApiKey("google")}>
                      Clear saved key
                    </Button>
                  )}
                </Field>
                <Field label={t("settings.googleModel")}>
                  <Select value={aiSettings.googleModel} onValueChange={v => setAiSettings(f => ({ ...f, googleModel: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choose model..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                      <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button asChild variant="outline" className="w-fit gap-2">
                  <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">
                    {t("settings.googleApiKeyDocs")} <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </>
            )}
          </div>
        )}

        <div className={`grid gap-4 ${aiSettings.mode === "cloud" ? "md:grid-cols-2" : ""}`}>
          <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
            <div>
              <p className="font-medium">{t("settings.safetyLimits")}</p>
              <p className="text-xs text-muted-foreground">
                Fixed guardrails that stop runaway prompts or accidental request loops.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.maxPromptChars")}>
                <Input
                  type="number"
                  value={aiSettings.safetyLimits?.maxPromptChars || defaultAiSettings.safetyLimits.maxPromptChars}
                  disabled
                  className="opacity-70"
                />
              </Field>
              <Field label={t("settings.minRequestIntervalMs")}>
                <Input
                  type="number"
                  value={aiSettings.safetyLimits?.minRequestIntervalMs || defaultAiSettings.safetyLimits.minRequestIntervalMs}
                  disabled
                  className="opacity-70"
                />
              </Field>
            </div>
          </div>

          {aiSettings.mode === "cloud" && (
            <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
              <div>
                <p className="font-medium">{t("settings.cloudBudget")}</p>
                <p className="text-xs text-muted-foreground">
                  Adjust this if your API quota is higher. Safety limits stay on.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("settings.dailyRequestLimit")}>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={aiSettings.cloudBudget?.dailyRequestLimit || defaultAiSettings.cloudBudget.dailyRequestLimit}
                    onChange={e => setAiSettings(f => ({
                      ...f,
                      cloudBudget: { ...f.cloudBudget, dailyRequestLimit: parseInt(e.target.value || "0", 10) || defaultAiSettings.cloudBudget.dailyRequestLimit },
                    }))}
                  />
                </Field>
                <Field label={t("settings.dailyPromptCharLimit")}>
                  <Input
                    type="number"
                    min={1000}
                    max={1000000}
                    value={aiSettings.cloudBudget?.dailyPromptCharLimit || defaultAiSettings.cloudBudget.dailyPromptCharLimit}
                    onChange={e => setAiSettings(f => ({
                      ...f,
                      cloudBudget: { ...f.cloudBudget, dailyPromptCharLimit: parseInt(e.target.value || "0", 10) || defaultAiSettings.cloudBudget.dailyPromptCharLimit },
                    }))}
                  />
                </Field>
                <Field label={t("settings.dailyResponseCharLimit")}>
                  <Input
                    type="number"
                    min={1000}
                    max={1000000}
                    value={aiSettings.cloudBudget?.dailyResponseCharLimit || defaultAiSettings.cloudBudget.dailyResponseCharLimit}
                    onChange={e => setAiSettings(f => ({
                      ...f,
                      cloudBudget: { ...f.cloudBudget, dailyResponseCharLimit: parseInt(e.target.value || "0", 10) || defaultAiSettings.cloudBudget.dailyResponseCharLimit },
                    }))}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

