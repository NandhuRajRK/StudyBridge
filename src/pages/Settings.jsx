import { useState, useEffect } from "react";
import { studybridge } from "@/api/studybridgeClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isDesktopApp } from "@/lib/runtime";
import { useLocale } from "@/lib/locale";
import SettingsProfileTab from "@/components/settings/SettingsProfileTab";
import SettingsAiRuntimeTab from "@/components/settings/SettingsAiRuntimeTab";
import SettingsAiContextTab from "@/components/settings/SettingsAiContextTab";
import SettingsNotificationsTab from "@/components/settings/SettingsNotificationsTab";

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
          <SettingsProfileTab
            t={t}
            form={form}
            setForm={setForm}
            supportedLanguages={supportedLanguages}
            universityOptions={UNIVERSITY_OPTIONS}
            majorOptions={MAJOR_OPTIONS}
          />
        </TabsContent>

        <TabsContent value="runtime" className="mt-0 space-y-6">
          <SettingsAiRuntimeTab
            t={t}
            isDesktop={isDesktop}
            aiSettings={aiSettings}
            setAiSettings={setAiSettings}
            normalizeMode={normalizeMode}
            normalizeOllamaUrl={normalizeOllamaUrl}
            normalizeOllamaModel={normalizeOllamaModel}
            applyAiSettings={applyAiSettings}
            setOllamaUrlDraft={setOllamaUrlDraft}
            codexStatus={codexStatus}
            checkingCodex={checkingCodex}
            handleOpenCodexLogin={handleOpenCodexLogin}
            handleInstallCodex={handleInstallCodex}
            handleCheckCodex={handleCheckCodex}
            aiRuntime={aiRuntime}
            setAiRuntime={setAiRuntime}
            handleClearApiKey={handleClearApiKey}
            normalizeOpenAiModel={normalizeOpenAiModel}
            openAiModelOptions={OPENAI_MODEL_OPTIONS}
            ollamaModelOptions={OLLAMA_MODEL_OPTIONS}
            defaultOllamaUrl={DEFAULT_OLLAMA_URL}
            defaultAiSettings={defaultAiSettings}
            toast={toast}
          />
        </TabsContent>

        <TabsContent value="context" className="mt-0 space-y-6">
          <SettingsAiContextTab t={t} form={form} setForm={setForm} />
        </TabsContent>

        <TabsContent value="notifications" className="mt-0 space-y-6">
          <SettingsNotificationsTab t={t} notifications={notifications} setNotifications={setNotifications} />
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
