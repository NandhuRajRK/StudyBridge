import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { User, Bell, GraduationCap, Save, Loader2, SlidersHorizontal, Bot, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { isDesktopApp } from "@/lib/runtime";
import { useLocale } from "@/lib/locale";
import { AGENT_PROVIDER_DOCS, getAgentProviderDoc, OFFICIAL_RUNTIME_DOCS } from "@/lib/providerDocs";

const defaultLimits = {
  planner_item_limit: 8,
  context_course_limit: 5,
  context_topic_limit: 6,
  context_material_limit: 3,
  context_note_limit: 3,
  context_session_limit: 3,
  context_task_limit: 3,
};

const defaultAiSettings = {
  mode: "ask",
  localModelConsent: false,
  cloudProvider: "google",
  agentProvider: "none",
  hasGoogleApiKey: false,
  googleApiKey: "",
  googleModel: "gemini-2.5-flash",
  cloudBudget: {
    dailyRequestLimit: 40,
    dailyPromptCharLimit: 120000,
    dailyResponseCharLimit: 120000,
  },
  safetyLimits: {
    maxPromptChars: 25000,
    minRequestIntervalMs: 2500,
  },
};

function describeAiStatus(status) {
  if (status === "ready") return "Ready";
  if (status === "starting") return "Starting";
  if (status === "downloading-model") return "Preparing local Gemma";
  if (status === "missing_provider") return "External provider missing";
  if (status === "missing_key") return "Google API key missing";
  if (status === "awaiting_choice") return "Waiting for your choice";
  if (status === "rate_limited") return "Cloud AI budget reached";
  if (status === "disabled") return "Disabled";
  if (status === "error") return "Error";
  return status || "Unknown";
}

function providerLabel(provider) {
  return getAgentProviderDoc(provider)?.label || provider || "Built-in runtime";
}

function serializeAiSettings(settings) {
  return {
    mode: settings.mode,
    localModelConsent: Boolean(settings.localModelConsent),
    cloudProvider: settings.cloudProvider || "google",
    agentProvider: settings.agentProvider && settings.agentProvider !== "none" ? settings.agentProvider : "none",
    googleModel: settings.googleModel || "gemini-2.5-flash",
    cloudBudget: {
      dailyRequestLimit: parseInt(settings.cloudBudget?.dailyRequestLimit, 10) || defaultAiSettings.cloudBudget.dailyRequestLimit,
      dailyPromptCharLimit: parseInt(settings.cloudBudget?.dailyPromptCharLimit, 10) || defaultAiSettings.cloudBudget.dailyPromptCharLimit,
      dailyResponseCharLimit: parseInt(settings.cloudBudget?.dailyResponseCharLimit, 10) || defaultAiSettings.cloudBudget.dailyResponseCharLimit,
    },
    safetyLimits: {
      maxPromptChars: parseInt(settings.safetyLimits?.maxPromptChars, 10) || defaultAiSettings.safetyLimits.maxPromptChars,
      minRequestIntervalMs: parseInt(settings.safetyLimits?.minRequestIntervalMs, 10) || defaultAiSettings.safetyLimits.minRequestIntervalMs,
    },
    ...(settings.googleApiKey ? { googleApiKey: settings.googleApiKey } : {}),
    ...(settings.clearGoogleApiKey ? { clearGoogleApiKey: true } : {}),
  };
}

export default function Settings() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    university: "",
    major: "",
    year: "",
    daily_goal_minutes: 60,
    preferred_language: "en",
    ...defaultLimits,
  });
  const [aiSettings, setAiSettings] = useState(defaultAiSettings);
  const [aiRuntime, setAiRuntime] = useState(null);
  const [installingProvider, setInstallingProvider] = useState(false);
  const [notifications, setNotifications] = useState({ study_reminders: true, task_due: true, weekly_summary: false });
  const [saving, setSaving] = useState(false);
  const isDesktop = isDesktopApp();
  const { setLanguage, t, supportedLanguages } = useLocale();

  useEffect(() => {
    base44.auth.me().then(async u => {
      setUser(u);
      setForm({
        full_name: u.full_name || "",
        university: u.university || "",
        major: u.major || "",
        year: u.year || "",
        daily_goal_minutes: u.daily_goal_minutes || 60,
        planner_item_limit: u.planner_item_limit || defaultLimits.planner_item_limit,
        context_course_limit: u.context_course_limit || defaultLimits.context_course_limit,
        context_topic_limit: u.context_topic_limit || defaultLimits.context_topic_limit,
        context_material_limit: u.context_material_limit || defaultLimits.context_material_limit,
        context_note_limit: u.context_note_limit || defaultLimits.context_note_limit,
        context_session_limit: u.context_session_limit || defaultLimits.context_session_limit,
        context_task_limit: u.context_task_limit || defaultLimits.context_task_limit,
        preferred_language: u.preferred_language || "en",
      });
      if (u.notifications) setNotifications(u.notifications);
      if (isDesktop && window.studybridgeDesktop?.getAiSettings) {
        try {
          const [desktopSettings, runtime] = await Promise.all([
            window.studybridgeDesktop.getAiSettings(),
            window.studybridgeDesktop.getRuntimeConfig(),
          ]);
        setAiSettings(prev => ({ ...prev, ...desktopSettings, googleApiKey: "" }));
          setAiRuntime(runtime);
        } catch (error) {
          console.error("Failed to load desktop AI settings", error);
        }
      }
    });
  }, [isDesktop]);

  const handleSave = async () => {
    setSaving(true);
    const hasStoredKey = Boolean(aiSettings.googleApiKey?.trim() || aiSettings.hasGoogleApiKey);
    await base44.auth.updateMe({ ...form, notifications, preferred_language: form.preferred_language || "en" });
    setLanguage(form.preferred_language || "en");
    if (isDesktop && window.studybridgeDesktop?.setAiSettings) {
      const payload = serializeAiSettings({
        ...aiSettings,
        googleApiKey: aiSettings.googleApiKey?.trim() ? aiSettings.googleApiKey.trim() : "",
      });
      await window.studybridgeDesktop.setAiSettings(payload);
      setAiSettings((prev) => ({
        ...prev,
        googleApiKey: "",
        hasGoogleApiKey: hasStoredKey,
      }));
      if (window.studybridgeDesktop?.getRuntimeConfig) {
        try {
          setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
        } catch {
          // ignore
        }
      }
    }
    setSaving(false);
    toast.success("Settings saved");
  };

  const handleUseLocalAi = async () => {
    const next = { ...aiSettings, mode: "local", localModelConsent: true };
    setAiSettings(next);
    if (isDesktop && window.studybridgeDesktop?.setAiSettings) {
      await window.studybridgeDesktop.setAiSettings(serializeAiSettings(next));
      setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
    }
    toast.success("Local Gemma mode enabled");
  };

  const handleUseGoogleAi = async () => {
    const next = { ...aiSettings, mode: "cloud", localModelConsent: false };
    setAiSettings(next);
    if (isDesktop && window.studybridgeDesktop?.setAiSettings) {
      await window.studybridgeDesktop.setAiSettings(serializeAiSettings(next));
      setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
    }
    toast.success("Google API key mode enabled");
  };

  const handleClearGoogleKey = async () => {
    const next = { ...aiSettings, googleApiKey: "", hasGoogleApiKey: false };
    if (isDesktop && window.studybridgeDesktop?.setAiSettings) {
      await window.studybridgeDesktop.setAiSettings(serializeAiSettings({ ...aiSettings, googleApiKey: "", clearGoogleApiKey: true }));
      setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
    }
    setAiSettings(next);
    toast.success("Google API key cleared");
  };

  const handleInstallAgentProvider = async () => {
    const provider = aiSettings.agentProvider && aiSettings.agentProvider !== "none"
      ? aiSettings.agentProvider
      : "";
    if (!provider) {
      toast.error("Choose a background provider first");
      return;
    }

    if (!window.studybridgeDesktop?.installAgentProvider) {
      toast.error("Provider installation is unavailable in this build");
      return;
    }

    setInstallingProvider(true);
    try {
      await window.studybridgeDesktop.installAgentProvider(provider);
      if (window.studybridgeDesktop?.getRuntimeConfig) {
        setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
      }
      toast.success(`${providerLabel(provider)} installed`);
    } catch (error) {
      toast.error(error?.message || "Failed to install provider");
    } finally {
      setInstallingProvider(false);
    }
  };

  if (!user) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      <Section icon={User} title={t("settings.profile")}>
        <div className="space-y-4">
          <Field label="Full Name">
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input value={user.email} disabled className="opacity-60" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="University">
              <Input value={form.university} onChange={e => setForm(f => ({ ...f, university: e.target.value }))} placeholder="MIT" />
            </Field>
            <Field label="Major">
              <Input value={form.major} onChange={e => setForm(f => ({ ...f, major: e.target.value }))} placeholder="Computer Science" />
            </Field>
          </div>
          <Field label="Academic Year">
            <Select value={form.year} onValueChange={v => setForm(f => ({ ...f, year: v }))}>
              <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Freshman (Year 1)</SelectItem>
                <SelectItem value="2">Sophomore (Year 2)</SelectItem>
                <SelectItem value="3">Junior (Year 3)</SelectItem>
                <SelectItem value="4">Senior (Year 4)</SelectItem>
                <SelectItem value="grad">Graduate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.language")}>
            <Select value={form.preferred_language} onValueChange={v => setForm(f => ({ ...f, preferred_language: v }))}>
              <SelectTrigger><SelectValue placeholder={t("settings.language")} /></SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((item) => (
                  <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("settings.translationNotice")}
            </p>
          </Field>
        </div>
      </Section>

      <Separator />

      <Section icon={GraduationCap} title={t("settings.studyGoals")}>
        <Field label={`${t("settings.dailyGoal")}: ${form.daily_goal_minutes} minutes`}>
          <input
            type="range" min={15} max={300} step={15}
            value={form.daily_goal_minutes}
            onChange={e => setForm(f => ({ ...f, daily_goal_minutes: parseInt(e.target.value) }))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>15m</span><span>1h</span><span>2h</span><span>3h</span><span>5h</span>
          </div>
        </Field>
      </Section>

      <Separator />

      <Section icon={SlidersHorizontal} title={t("settings.aiContextLimits")}>
        <p className="text-sm text-muted-foreground">
          These limits control how much course data the AI sees and how many items it tries to generate at once.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Planner items">
            <Input type="number" min={1} max={20} value={form.planner_item_limit} onChange={e => setForm(f => ({ ...f, planner_item_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
          <Field label="Courses in context">
            <Input type="number" min={1} max={20} value={form.context_course_limit} onChange={e => setForm(f => ({ ...f, context_course_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
          <Field label="Topics per course">
            <Input type="number" min={1} max={20} value={form.context_topic_limit} onChange={e => setForm(f => ({ ...f, context_topic_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
          <Field label="Materials per course">
            <Input type="number" min={1} max={20} value={form.context_material_limit} onChange={e => setForm(f => ({ ...f, context_material_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
          <Field label="Notes per course">
            <Input type="number" min={1} max={20} value={form.context_note_limit} onChange={e => setForm(f => ({ ...f, context_note_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
          <Field label="Sessions per course">
            <Input type="number" min={1} max={20} value={form.context_session_limit} onChange={e => setForm(f => ({ ...f, context_session_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
          <Field label="Tasks per course">
            <Input type="number" min={1} max={20} value={form.context_task_limit} onChange={e => setForm(f => ({ ...f, context_task_limit: parseInt(e.target.value || "0") || 1 }))} />
          </Field>
        </div>
      </Section>

      <Separator />

      {isDesktop ? (
        <>
          <Section icon={Bot} title={t("settings.aiRuntime")}>
            <p className="text-sm text-muted-foreground">
              {t("settings.aiRuntimeBody")}
            </p>
            <div className="grid gap-4">
              <Field label={t("settings.aiMode")}>
                <Select value={aiSettings.mode} onValueChange={v => setAiSettings(f => ({ ...f, mode: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose mode..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ask">{t("settings.askOnNextLaunch")}</SelectItem>
                    <SelectItem value="disabled">{t("settings.disabled")}</SelectItem>
                    <SelectItem value="local">{t("settings.localGemma")}</SelectItem>
                    <SelectItem value="cloud">{t("settings.googleApiKey")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("settings.backgroundAgentProvider")}>
                <Select value={aiSettings.agentProvider || "none"} onValueChange={v => setAiSettings(f => ({ ...f, agentProvider: v }))}>
                  <SelectTrigger><SelectValue placeholder="Use built-in model" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Built-in runtime</SelectItem>
                    {AGENT_PROVIDER_DOCS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("settings.providerInstallBody")}
                </p>
              </Field>

              {aiSettings.agentProvider && aiSettings.agentProvider !== "none" && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-medium">{t("settings.backgroundAgentProvider")}</p>
                      <p className="text-sm text-muted-foreground">
                        {aiSettings.agentProvider === "opencode-cli"
                          ? t("settings.opencodeLocalBody")
                          : aiSettings.agentProvider === "gemini-cli"
                            ? "Gemini CLI uses Google's terminal agent workflow. StudyBridge installs it on demand and leaves sign-in or authorization to the CLI."
                            : "This provider runs in the background and uses the model or account configured by that CLI."}
                      </p>
                    </div>
                    <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-1">
                      {aiRuntime?.status === "ready" ? t("settings.providerReady") : t("settings.providerMissing")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleInstallAgentProvider}
                      disabled={installingProvider || aiRuntime?.status === "ready"}
                    >
                      {installingProvider
                        ? "Installing..."
                        : aiRuntime?.status === "ready"
                          ? t("settings.providerReady")
                          : t("settings.installSelectedProvider")}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {aiSettings.agentProvider === "opencode-cli"
                        ? "OpenCode will use the local Gemma runtime configured in this app."
                        : aiSettings.agentProvider === "gemini-cli"
                          ? "Install Gemini CLI from inside StudyBridge, then authorize it with your Google account if required."
                          : "Install from inside StudyBridge, then authorize the provider if it requires it."}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" className="px-2 gap-2">
                          Official docs
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-72">
                        {OFFICIAL_RUNTIME_DOCS.map((doc) => (
                          <DropdownMenuItem key={doc.href} asChild>
                            <a href={doc.href} target="_blank" rel="noreferrer" className="block">
                              <span className="font-medium">{doc.label}</span>
                            </a>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}

              {(aiSettings.mode === "ask" || aiSettings.mode === "disabled") && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("settings.aiModeHelp")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handleUseLocalAi}>
                      {t("settings.localGemma")}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleUseGoogleAi}>
                      {t("settings.googleApiKey")}
                    </Button>
                  </div>
                </div>
              )}

              {aiSettings.mode === "local" && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{t("settings.localGemma")}</p>
                      <p className="text-xs text-muted-foreground">
                        {aiRuntime?.status === "ready" ? "Ready" : aiRuntime?.status === "downloading-model" ? "Downloading model" : "Not started"}
                      </p>
                    </div>
                    <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-1">
                      {aiRuntime?.label || "Auto-selected"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.localGemmaBody")}
                  </p>
                  <Button type="button" variant="outline" onClick={handleUseLocalAi}>
                    {t("settings.localGemma")}
                  </Button>
                </div>
              )}

              {aiSettings.mode === "cloud" && (
                <div className="grid gap-4">
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
                      <Button type="button" variant="ghost" className="w-fit px-0 text-xs text-destructive hover:text-destructive" onClick={handleClearGoogleKey}>
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
                </div>
              )}

              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{t("settings.currentState")}</p>
                <p>Mode: {aiRuntime?.aiMode || aiSettings.mode}</p>
                {aiRuntime?.provider && <p>External provider: {aiRuntime.provider}</p>}
                <p>Status: {describeAiStatus(aiRuntime?.status)}</p>
                {aiSettings.hasGoogleApiKey && <p>Google key: saved on this device</p>}
                {aiRuntime?.cloudBudget && (
                  <div className="mt-2 space-y-1">
                    <p>Cloud budget: {aiRuntime.cloudBudget.usage.requestCount}/{aiRuntime.cloudBudget.limits.dailyRequestLimit} requests used</p>
                    <p>Prompt chars: {aiRuntime.cloudBudget.usage.promptChars}/{aiRuntime.cloudBudget.limits.dailyPromptCharLimit}</p>
                    <p>Response chars: {aiRuntime.cloudBudget.usage.responseChars}/{aiRuntime.cloudBudget.limits.dailyResponseCharLimit}</p>
                    <p>Reset: {new Date(aiRuntime.cloudBudget.nextResetAt).toLocaleString()}</p>
                  </div>
                )}
                {aiRuntime?.error && <p className="text-destructive mt-1">{aiRuntime.error}</p>}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </div>
          </Section>

          <Separator />
        </>
      ) : (
        <>
          <Section icon={Bot} title={t("settings.aiRuntime")}>
            <p className="text-sm text-muted-foreground">
              Desktop AI settings live in the Electron app. The web app keeps using the Supabase-backed path.
            </p>
            <p className="text-sm">
              {t("settings.googleApiKeyDocs")}:{" "}
              <a className="text-primary underline underline-offset-4" href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">
                ai.google.dev/gemini-api/docs/api-key
              </a>
            </p>
          </Section>

          <Separator />
        </>
      )}

      <Section icon={Bell} title={t("settings.notifications")}>
        <div className="space-y-4">
          <ToggleRow
            label={t("settings.studyReminders")}
            description="Daily reminders to study"
            checked={notifications.study_reminders}
            onChange={v => setNotifications(n => ({ ...n, study_reminders: v }))}
          />
          <ToggleRow
            label={t("settings.taskDue")}
            description="Reminders when tasks are due soon"
            checked={notifications.task_due}
            onChange={v => setNotifications(n => ({ ...n, task_due: v }))}
          />
          <ToggleRow
            label={t("settings.weeklySummary")}
            description="Weekly email with your progress"
            checked={notifications.weekly_summary}
            onChange={v => setNotifications(n => ({ ...n, weekly_summary: v }))}
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
