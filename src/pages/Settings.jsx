import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Bell, GraduationCap, Save, Loader2, SlidersHorizontal, Bot, ExternalLink, Terminal, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { isDesktopApp } from "@/lib/runtime";
import { useLocale } from "@/lib/locale";

const defaultLimits = {
  planner_item_limit: 8,
  context_course_limit: 5,
  context_topic_limit: 6,
  context_material_limit: 3,
  context_note_limit: 3,
  context_session_limit: 3,
  context_task_limit: 3,
};

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "gemma4:e2b";
const OLLAMA_MODEL_OPTIONS = [
  {
    value: "gemma4:e2b",
    label: "Gemma 4 E2B (recommended)",
    note: "Balanced quality for common laptops/desktops",
  },
  {
    value: "gemma4:e4b",
    label: "Gemma 4 E4B",
    note: "Higher quality, needs more memory",
  },
  {
    value: "llama3.2:3b",
    label: "Llama 3.2 3B",
    note: "Smaller fallback model",
  },
];

const OPENAI_MODEL_OPTIONS = [
  { value: "__default__", label: "Default provider model" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "gpt-4o", label: "GPT-4o" },
];

const UNIVERSITY_OPTIONS = [
  "Harvard University",
  "Stanford University",
  "Massachusetts Institute of Technology",
  "University of California, Berkeley",
  "University of California, Los Angeles",
  "Yale University",
  "Princeton University",
  "Columbia University",
  "University of Chicago",
  "University of Pennsylvania",
  "Cornell University",
  "California Institute of Technology",
  "Duke University",
  "Northwestern University",
  "Johns Hopkins University",
  "Carnegie Mellon University",
  "University of Michigan",
  "University of Washington",
  "University of Texas at Austin",
  "Georgia Institute of Technology",
  "University of Southern California",
  "New York University",
  "Brown University",
  "Dartmouth College",
  "Rice University",
  "Vanderbilt University",
  "University of Notre Dame",
  "Emory University",
  "Boston University",
  "University of Wisconsin-Madison",
  "University of Illinois Urbana-Champaign",
  "Purdue University",
  "Pennsylvania State University",
  "Ohio State University",
  "University of Maryland, College Park",
  "Rutgers University",
  "University of Florida",
  "Texas A&M University",
  "University of Minnesota Twin Cities",
  "University of Virginia",
  "University of North Carolina at Chapel Hill",
  "University of California, San Diego",
  "University of California, Irvine",
  "University of California, Santa Barbara",
  "University of California, Davis",
  "University of Toronto",
  "McGill University",
  "University of British Columbia",
  "University of Waterloo",
  "ETH Zurich",
  "EPFL",
  "University of Oxford",
  "University of Cambridge",
  "Imperial College London",
  "University College London",
  "London School of Economics",
  "University of Edinburgh",
  "King's College London",
  "Technical University of Munich",
  "Heidelberg University",
  "University of Amsterdam",
  "University of Copenhagen",
  "National University of Singapore",
  "Nanyang Technological University",
  "University of Melbourne",
  "University of Sydney",
  "UNSW Sydney",
  "Monash University",
  "University of Auckland",
  "Tsinghua University",
  "Peking University",
  "University of Tokyo",
  "Kyoto University",
  "Seoul National University",
  "KAIST",
  "Indian Institute of Science",
  "University of Cape Town",
  "Tel Aviv University",
];

const MAJOR_OPTIONS = [
  "Computer Science",
  "Data Science",
  "Artificial Intelligence",
  "Software Engineering",
  "Information Systems",
  "Cybersecurity",
  "Mathematics",
  "Applied Mathematics",
  "Statistics",
  "Physics",
  "Chemistry",
  "Biology",
  "Biochemistry",
  "Neuroscience",
  "Environmental Science",
  "Geology",
  "Mechanical Engineering",
  "Electrical Engineering",
  "Civil Engineering",
  "Chemical Engineering",
  "Biomedical Engineering",
  "Aerospace Engineering",
  "Industrial Engineering",
  "Materials Science",
  "Architecture",
  "Economics",
  "Finance",
  "Accounting",
  "Business Administration",
  "Marketing",
  "Management",
  "Entrepreneurship",
  "Political Science",
  "International Relations",
  "Psychology",
  "Sociology",
  "Anthropology",
  "History",
  "Philosophy",
  "English",
  "Linguistics",
  "Communication Studies",
  "Journalism",
  "Education",
  "Public Health",
  "Nursing",
  "Medicine (Pre-Med)",
  "Law (Pre-Law)",
  "Graphic Design",
  "Fine Arts",
  "Music",
  "Theater",
  "Film Studies",
];

const defaultAiSettings = {
  mode: "disabled",
  localModelConsent: false,
  localBackend: "llama_cpp",
  ollamaUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  cloudProvider: "google",
  agentProvider: "none",
  hasGoogleApiKey: false,
  hasOpenAiApiKey: false,
  hasAnthropicApiKey: false,
  googleApiKey: "",
  openAiApiKey: "",
  anthropicApiKey: "",
  googleModel: "gemini-2.5-flash",
  openAiModel: "",
  anthropicModel: "claude-sonnet-4-0",
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

function cloudProviderLabel(provider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "google") return "Google Gemini";
  return provider || "Cloud";
}

function normalizeOllamaUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_OLLAMA_URL;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_OLLAMA_URL;
  }
}

function normalizeOllamaModel(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return DEFAULT_OLLAMA_MODEL;
  return OLLAMA_MODEL_OPTIONS.some((option) => option.value === candidate)
    ? candidate
    : DEFAULT_OLLAMA_MODEL;
}

function normalizeMode(value) {
  if (value === "ask") return "disabled";
  if (["codex", "disabled", "local", "cloud"].includes(value)) return value;
  return defaultAiSettings.mode;
}

function normalizeOpenAiModel(value) {
  const candidate = String(value || "").trim();
  if (candidate === "__default__") return "";
  if (!candidate) return "";
  return OPENAI_MODEL_OPTIONS.some((option) => option.value === candidate) ? candidate : "";
}

function serializeAiSettings(settings) {
  return {
    mode: normalizeMode(settings.mode),
    localModelConsent: Boolean(settings.localModelConsent),
    localBackend: settings.localBackend || "llama_cpp",
    ollamaUrl: settings.ollamaUrl || DEFAULT_OLLAMA_URL,
    ollamaModel: normalizeOllamaModel(settings.ollamaModel),
    cloudProvider: settings.cloudProvider || "google",
    agentProvider: settings.agentProvider && settings.agentProvider !== "none" ? settings.agentProvider : "none",
    googleModel: settings.googleModel || "gemini-2.5-flash",
    openAiModel: normalizeOpenAiModel(settings.openAiModel),
    anthropicModel: settings.anthropicModel || "claude-sonnet-4-0",
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
    ...(settings.openAiApiKey ? { openAiApiKey: settings.openAiApiKey } : {}),
    ...(settings.anthropicApiKey ? { anthropicApiKey: settings.anthropicApiKey } : {}),
    ...(settings.clearGoogleApiKey ? { clearGoogleApiKey: true } : {}),
    ...(settings.clearOpenAiApiKey ? { clearOpenAiApiKey: true } : {}),
    ...(settings.clearAnthropicApiKey ? { clearAnthropicApiKey: true } : {}),
  };
}

export default function Settings() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    university: "",
    major: "",
    year: "",
    daily_goal_minutes: 60,
    preferred_language: "en",
    ...defaultLimits,
  });
  const [aiSettings, setAiSettings] = useState(defaultAiSettings);
  const [aiRuntime, setAiRuntime] = useState(null);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(DEFAULT_OLLAMA_URL);
  const [codexStatus, setCodexStatus] = useState({ installed: false, version: "", error: "" });
  const [checkingCodex, setCheckingCodex] = useState(false);
  const [notifications, setNotifications] = useState({ study_reminders: true, task_due: true, weekly_summary: false });
  const [saving, setSaving] = useState(false);
  const isDesktop = isDesktopApp();
  const { setLanguage, t, supportedLanguages } = useLocale();

  const persistAiSettings = async (nextSettings) => {
    if (!isDesktop || !window.studybridgeDesktop?.setAiSettings) return;
    await window.studybridgeDesktop.setAiSettings(serializeAiSettings(nextSettings));
    if (window.studybridgeDesktop?.getRuntimeConfig) {
      try {
        setAiRuntime(await window.studybridgeDesktop.getRuntimeConfig());
      } catch {
        // ignore runtime refresh failures in settings
      }
    }
  };

  const applyAiSettings = async (nextSettings) => {
    setAiSettings(nextSettings);
    await persistAiSettings(nextSettings);
    return nextSettings;
  };

  useEffect(() => {
    studybridge.auth.me().then(async u => {
      setUser(u);
      setForm({
        full_name: u.full_name || "",
        email: u.email || "",
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
          const normalizedSettings = desktopSettings?.agentProvider === "codex-cli"
            ? { ...desktopSettings, mode: "codex", agentProvider: "none" }
            : { ...desktopSettings, agentProvider: "none" };
          const sanitizedSettings = {
            ...normalizedSettings,
            mode: normalizeMode(normalizedSettings?.mode),
            ollamaUrl: normalizeOllamaUrl(normalizedSettings?.ollamaUrl),
            ollamaModel: normalizeOllamaModel(normalizedSettings?.ollamaModel),
            openAiModel: normalizeOpenAiModel(normalizedSettings?.openAiModel),
          };
          setAiSettings(prev => ({
            ...prev,
            ...sanitizedSettings,
            googleApiKey: "",
            openAiApiKey: "",
            anthropicApiKey: "",
            clearGoogleApiKey: false,
            clearOpenAiApiKey: false,
            clearAnthropicApiKey: false,
          }));
          setAiRuntime(runtime);
          if (window.appAI?.status) {
            setCodexStatus(await window.appAI.status());
          }
        } catch (error) {
          console.error("Failed to load desktop AI settings", error);
        }
      }
    });
  }, [isDesktop]);

  useEffect(() => {
    setOllamaUrlDraft(aiSettings.ollamaUrl || DEFAULT_OLLAMA_URL);
  }, [aiSettings.ollamaUrl]);

  const handleSave = async () => {
    setSaving(true);
    const normalizedAiSettings = {
      ...aiSettings,
      ollamaUrl: normalizeOllamaUrl(aiSettings.ollamaUrl),
      ollamaModel: normalizeOllamaModel(aiSettings.ollamaModel),
      localModelConsent: aiSettings.mode === "local" ? true : aiSettings.localModelConsent,
    };
    const hasStoredGoogleKey = Boolean(normalizedAiSettings.googleApiKey?.trim() || normalizedAiSettings.hasGoogleApiKey);
    const hasStoredOpenAiKey = Boolean(normalizedAiSettings.openAiApiKey?.trim() || normalizedAiSettings.hasOpenAiApiKey);
    const hasStoredAnthropicKey = Boolean(normalizedAiSettings.anthropicApiKey?.trim() || normalizedAiSettings.hasAnthropicApiKey);
    const profilePayload = {
      ...form,
      email: String(form.email || "").trim(),
      university: String(form.university || "").trim(),
      major: String(form.major || "").trim(),
      notifications,
      preferred_language: form.preferred_language || "en",
    };
    await studybridge.auth.updateMe(profilePayload);
    setUser((prev) => (prev ? { ...prev, email: profilePayload.email } : prev));
    setLanguage(form.preferred_language || "en");
    if (isDesktop && window.studybridgeDesktop?.setAiSettings) {
      const payload = serializeAiSettings({
        ...normalizedAiSettings,
        googleApiKey: normalizedAiSettings.googleApiKey?.trim() ? normalizedAiSettings.googleApiKey.trim() : "",
        openAiApiKey: normalizedAiSettings.openAiApiKey?.trim() ? normalizedAiSettings.openAiApiKey.trim() : "",
        anthropicApiKey: normalizedAiSettings.anthropicApiKey?.trim() ? normalizedAiSettings.anthropicApiKey.trim() : "",
      });
      await window.studybridgeDesktop.setAiSettings(payload);
      setAiSettings((prev) => ({
        ...prev,
        ollamaUrl: normalizedAiSettings.ollamaUrl,
        ollamaModel: normalizedAiSettings.ollamaModel,
        googleApiKey: "",
        openAiApiKey: "",
        anthropicApiKey: "",
        clearGoogleApiKey: false,
        clearOpenAiApiKey: false,
        clearAnthropicApiKey: false,
        hasGoogleApiKey: hasStoredGoogleKey,
        hasOpenAiApiKey: hasStoredOpenAiKey,
        hasAnthropicApiKey: hasStoredAnthropicKey,
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

  const handleClearApiKey = async (provider) => {
    const next = {
      ...aiSettings,
      ...(provider === "openai"
        ? { openAiApiKey: "", hasOpenAiApiKey: false, clearOpenAiApiKey: true }
        : provider === "anthropic"
          ? { anthropicApiKey: "", hasAnthropicApiKey: false, clearAnthropicApiKey: true }
          : { googleApiKey: "", hasGoogleApiKey: false, clearGoogleApiKey: true }),
    };
    await applyAiSettings(next);
    toast.success(`${cloudProviderLabel(provider)} API key cleared`);
  };

  const enableCodexMode = async (status = codexStatus) => {
    const next = { ...aiSettings, mode: "codex", agentProvider: "none" };
    await applyAiSettings(next);
    if (status?.installed) {
      toast.success("Codex CLI mode enabled");
    }
  };

  const handleCheckCodex = async () => {
    if (!window.appAI?.status) {
      toast.error("Codex bridge is unavailable in this build");
      return;
    }
    setCheckingCodex(true);
    try {
      const status = await window.appAI.status();
      setCodexStatus(status);
      if (status.installed) {
        await enableCodexMode(status);
        toast.success("Codex CLI detected");
      } else {
        toast.error(status.error || "Codex CLI is not installed");
      }
    } finally {
      setCheckingCodex(false);
    }
  };

  const handleOpenCodexLogin = async () => {
    if (!window.appAI?.login) {
      toast.error("Codex login is unavailable in this build");
      return;
    }
    await enableCodexMode();
    await window.appAI.login();
    setCodexStatus((prev) => ({ ...prev, error: "Codex login terminal opened. Finish login there, then run Check status." }));
    toast.success("Codex login terminal opened");
  };

  const handleInstallCodex = async () => {
    if (!window.appAI?.install) {
      toast.error("Codex installer is unavailable in this build");
      return;
    }
    await enableCodexMode();
    await window.appAI.install();
    setCodexStatus((prev) => ({ ...prev, error: "Codex install/login terminal opened. Finish setup there, then run Check status." }));
    toast.success("Codex install terminal opened");
  };

  if (!user) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full flex-col gap-6 p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-4 bg-muted/40">
          <TabsTrigger value="profile" className="text-xs">Profile</TabsTrigger>
          <TabsTrigger value="runtime" className="text-xs">AI runtime</TabsTrigger>
          <TabsTrigger value="context" className="text-xs">AI context</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0 space-y-6">
          <Section icon={User} title={t("settings.profile")} id="profile">
            <div className="space-y-4">
              <Field label="Full Name">
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="name@university.edu"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="University">
                  <SearchableOptionInput
                    listId="settings-university-options"
                    value={form.university}
                    onChange={(value) => setForm(f => ({ ...f, university: value }))}
                    options={UNIVERSITY_OPTIONS}
                    placeholder="Type to search or enter manually"
                  />
                </Field>
                <Field label="Major">
                  <SearchableOptionInput
                    listId="settings-major-options"
                    value={form.major}
                    onChange={(value) => setForm(f => ({ ...f, major: value }))}
                    options={MAJOR_OPTIONS}
                    placeholder="Type to search or enter manually"
                  />
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
        </TabsContent>

        <TabsContent value="runtime" className="mt-0 space-y-6">
          {isDesktop ? (
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
                    <Button
                      type="button"
                      onClick={handleOpenCodexLogin}
                      disabled={!codexStatus.installed}
                      className="gap-2"
                    >
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
                            value={ollamaUrlDraft}
                            onChange={(e) => setOllamaUrlDraft(e.target.value)}
                            onBlur={async () => {
                              const normalizedUrl = normalizeOllamaUrl(ollamaUrlDraft);
                              setOllamaUrlDraft(normalizedUrl);
                              if (normalizedUrl === (aiSettings.ollamaUrl || DEFAULT_OLLAMA_URL)) return;
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
                              {OLLAMA_MODEL_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {OLLAMA_MODEL_OPTIONS.find((option) => option.value === normalizeOllamaModel(aiSettings.ollamaModel))?.note || "Recommended local model presets"}
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
                            {OPENAI_MODEL_OPTIONS.map((option) => (
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
          ) : (
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
          )}
        </TabsContent>

        <TabsContent value="context" className="mt-0 space-y-6">
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
        </TabsContent>

        <TabsContent value="notifications" className="mt-0 space-y-6">
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
        </TabsContent>
      </Tabs>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children, id }) {
  return (
    <div id={id} className="space-y-4 scroll-mt-24">
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

function SearchableOptionInput({ listId, value, onChange, options, placeholder }) {
  return (
    <div className="space-y-1.5">
      <Input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">
        Type to search suggestions, or keep typing and press Enter to save your own value.
      </p>
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
