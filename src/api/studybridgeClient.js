import { createClient } from "@supabase/supabase-js";
import { isDesktopApp } from "@/lib/runtime";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isDesktopRuntime = isDesktopApp();
const llmMode = import.meta.env.VITE_LLM_MODE || (isDesktopRuntime ? "local" : "supabase");
const ollamaUrl = import.meta.env.VITE_OLLAMA_URL || "http://localhost:11434";
const ollamaModel = import.meta.env.VITE_OLLAMA_MODEL || "gemma4:e2b";
const llamaCppUrl = import.meta.env.VITE_LLAMACPP_URL || "http://127.0.0.1:8080";
const llamaCppModel = import.meta.env.VITE_LLAMACPP_MODEL || "ggml-org/gemma-4-E2B-it-GGUF:Q8_0";
const geminiModel = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const openAiModel = import.meta.env.VITE_OPENAI_MODEL || "";
const anthropicModel = import.meta.env.VITE_ANTHROPIC_MODEL || "claude-sonnet-4-0";

const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);

const entityTables = {
  Course: "courses",
  Flashcard: "flashcards",
  FlashcardDeck: "flashcard_decks",
  Note: "notes",
  Quiz: "quizzes",
  QuizQuestion: "quiz_questions",
  SavedAIAnswer: "saved_ai_answers",
  StudyGuide: "study_guides",
  StudyMaterial: "study_materials",
  StudySession: "study_sessions",
  Task: "tasks",
  Topic: "topics",
  TopicMastery: "topic_masteries",
};

const entityDefaults = {
  Course: {
    status: "active",
    total_topics: 0,
    mastered_topics: 0,
    overall_progress: 0,
  },
  Task: {
    status: "todo",
    type: "study",
    priority: "medium",
    estimated_minutes: 30,
  },
  Topic: {
    status: "not_started",
    mastery_level: 0,
    confidence: 0,
    total_study_time: 0,
    order: 0,
  },
  StudyMaterial: {
    status: "uploaded",
    type: "pdf",
    extracted_topics: [],
    source_text: "",
    content_excerpt: "",
    content_chunks: [],
    chunk_count: 0,
  },
  StudySession: {
    status: "active",
    mode: "mixed",
    duration_minutes: 0,
  },
  FlashcardDeck: {
    card_count: 0,
  },
  SavedAIAnswer: {
    context: "General",
  },
  StudyGuide: {
    sections: [],
  },
};

function withDefaults(entityName, payload = {}) {
  return {
    ...(entityDefaults[entityName] || {}),
    ...payload,
  };
}

function flattenRow(row, entityName) {
  if (!row) return row;
  const { data, created_at, updated_at, user_id, ...rest } = row;
  return {
    ...withDefaults(entityName, data),
    ...rest,
    user_id,
    created_date: created_at,
    updated_date: updated_at,
  };
}

function sortRows(rows, sortExpression) {
  if (!sortExpression) return rows;
  const descending = sortExpression.startsWith("-");
  const key = descending ? sortExpression.slice(1) : sortExpression;

  return [...rows].sort((a, b) => {
    const left = a[key] ?? "";
    const right = b[key] ?? "";
    if (left === right) return 0;
    return (left > right ? 1 : -1) * (descending ? -1 : 1);
  });
}

function matchesFilter(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function extractJson(text) {
  if (!text || typeof text !== "string") return text;

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return text;

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return text;
    }
  }
}

function buildSchemaHint(schema) {
  if (!schema) return "";
  return `\n\nReturn ONLY valid JSON. Match this schema as closely as possible:\n${JSON.stringify(schema, null, 2)}`;
}

async function getDesktopRuntime() {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.getRuntimeConfig) return null;
  try {
    return await window.studybridgeDesktop.getRuntimeConfig();
  } catch {
    return null;
  }
}

async function getDesktopAiSettings() {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.getAiSettings) return null;
  try {
    return await window.studybridgeDesktop.getAiSettings();
  } catch {
    return null;
  }
}

async function waitForLocalRuntime() {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.waitForLocalAi) return null;
  try {
    return await window.studybridgeDesktop.waitForLocalAi();
  } catch {
    return null;
  }
}

async function invokeDesktopCodex(payload) {
  if (!isDesktopRuntime || !window.appAI?.invoke) {
    throw new Error("Codex CLI runtime is unavailable.");
  }
  const prompt = `${payload.prompt || ""}${buildSchemaHint(payload.response_json_schema)}`;
  const text = await window.appAI.invoke(prompt);
  return payload.response_json_schema ? extractJson(text) : text;
}

async function invokeDesktopCloudProvider(payload) {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.invokeCloudProvider) {
    throw new Error("Cloud AI runtime is unavailable.");
  }
  return window.studybridgeDesktop.invokeCloudProvider(payload);
}

function getDesktopDataBridge() {
  return isDesktopRuntime ? window.studybridgeDesktop : null;
}

async function listLocalRows(entityName) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.listLocalEntity) return [];
  try {
    return (await bridge.listLocalEntity(entityName)) || [];
  } catch {
    return [];
  }
}

async function createLocalRow(entityName, payload) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.createLocalEntity) throw new Error("Local storage is unavailable.");
  return bridge.createLocalEntity(entityName, payload);
}

async function updateLocalRow(entityName, id, payload) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.updateLocalEntity) throw new Error("Local storage is unavailable.");
  return bridge.updateLocalEntity(entityName, id, payload);
}

async function deleteLocalRow(entityName, id) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.deleteLocalEntity) throw new Error("Local storage is unavailable.");
  return bridge.deleteLocalEntity(entityName, id);
}

async function getLocalProfile() {
  const bridge = getDesktopDataBridge();
  if (!bridge?.getLocalProfile) return null;
  try {
    return await bridge.getLocalProfile();
  } catch {
    return null;
  }
}

async function updateLocalProfile(payload) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.updateLocalProfile) throw new Error("Local storage is unavailable.");
  return bridge.updateLocalProfile(payload);
}

async function uploadLocalFile(file) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.uploadLocalFile) throw new Error("Local storage is unavailable.");
  const buffer = await file.arrayBuffer();
  return bridge.uploadLocalFile({
    name: file.name,
    mimeType: file.type,
    buffer,
  });
}

async function deleteLocalFile(fileUrl) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.deleteLocalFile) throw new Error("Local storage is unavailable.");
  return bridge.deleteLocalFile(fileUrl);
}

async function invokeLocalOllama({ prompt, response_json_schema }) {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are StudyBridge's local Gemma tutor. Help students learn clearly, avoid hallucinating, and return valid JSON whenever a JSON schema is requested.",
        },
        { role: "user", content: prompt },
      ],
      options: {
        temperature: response_json_schema ? 0.15 : 0.35,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.08,
      },
      format: response_json_schema || undefined,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Local Ollama request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text = data?.message?.content ?? "";
  return response_json_schema ? extractJson(text) : text;
}

async function invokeLocalLlamaCpp({ prompt, response_json_schema, model = llamaCppModel }) {
  const response = await fetch(`${llamaCppUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are StudyBridge's local Gemma tutor. Help students learn clearly and return valid JSON whenever a JSON schema is requested.",
        },
        {
          role: "user",
          content: `${prompt}${buildSchemaHint(response_json_schema)}`,
        },
      ],
      temperature: response_json_schema ? 0.15 : 0.35,
      top_p: 0.9,
      max_tokens: response_json_schema ? 1024 : 768,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Local llama.cpp request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return response_json_schema ? extractJson(text) : text;
}

async function invokeGoogleGemini({ prompt, response_json_schema, apiKey, model = geminiModel }) {
  if (isDesktopRuntime && window.studybridgeDesktop?.invokeCloudProvider) {
    return invokeDesktopCloudProvider({
      provider: "google",
      prompt,
      response_json_schema,
      model,
    });
  }

  if (!apiKey) {
    const error = new Error("AI is disabled. Open Settings to download Gemma locally or add a cloud API key.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${prompt}${buildSchemaHint(response_json_schema)}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: response_json_schema ? 0.15 : 0.35,
        topP: 0.9,
        maxOutputTokens: response_json_schema ? 2048 : 1024,
        ...(response_json_schema ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google AI request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return response_json_schema ? extractJson(text) : text;
}

async function invokeOpenAi({ prompt, response_json_schema, apiKey, model = openAiModel }) {
  if (isDesktopRuntime && window.studybridgeDesktop?.invokeCloudProvider) {
    return invokeDesktopCloudProvider({
      provider: "openai",
      prompt,
      response_json_schema,
      model,
    });
  }

  if (!apiKey) {
    const error = new Error("OpenAI API key missing. Open Settings to add your key.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  if (!model) {
    throw new Error("OpenAI model missing. Use Codex CLI for default-profile OpenAI access, or explicitly configure an API model.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are StudyBridge's cloud tutor. Help students learn clearly, avoid hallucinating, and return valid JSON whenever a JSON schema is requested.",
        },
        {
          role: "user",
          content: `${prompt}${buildSchemaHint(response_json_schema)}`,
        },
      ],
      temperature: response_json_schema ? 0.15 : 0.35,
      top_p: 0.9,
      max_tokens: response_json_schema ? 2048 : 1024,
      ...(response_json_schema ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return response_json_schema ? extractJson(text) : text;
}

async function invokeAnthropic({ prompt, response_json_schema, apiKey, model = anthropicModel }) {
  if (isDesktopRuntime && window.studybridgeDesktop?.invokeCloudProvider) {
    return invokeDesktopCloudProvider({
      provider: "anthropic",
      prompt,
      response_json_schema,
      model,
    });
  }

  if (!apiKey) {
    const error = new Error("Anthropic API key missing. Open Settings to add your key.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: response_json_schema ? 2048 : 1024,
      temperature: response_json_schema ? 0.15 : 0.35,
      top_p: 0.9,
      system:
        "You are StudyBridge's cloud tutor. Help students learn clearly, avoid hallucinating, and return valid JSON whenever a JSON schema is requested.",
      messages: [
        {
          role: "user",
          content: `${prompt}${buildSchemaHint(response_json_schema)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text = data?.content?.map((part) => part.text || "").join("") ?? "";
  return response_json_schema ? extractJson(text) : text;
}

function createEntityClient(entityName) {
  const table = entityTables[entityName];

  if (!table) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  const isLocalDesktopData = isDesktopRuntime;

  return {
    async list(sortExpression, limit) {
      if (isLocalDesktopData) {
        const rows = sortRows((await listLocalRows(entityName)).map((row) => flattenRow(row, entityName)), sortExpression);
        return typeof limit === "number" ? rows.slice(0, limit) : rows;
      }

      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      const rows = sortRows((data || []).map((row) => flattenRow(row, entityName)), sortExpression);
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },

    async filter(filter, sortExpression, limit) {
      if (isLocalDesktopData) {
        const rows = await this.list(sortExpression);
        const filtered = rows.filter((row) => matchesFilter(row, filter));
        return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
      }

      const rows = await this.list(sortExpression);
      const filtered = rows.filter((row) => matchesFilter(row, filter));
      return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
    },

    async create(payload) {
      if (isLocalDesktopData) {
        const normalizedPayload = withDefaults(entityName, payload);
        const row = await createLocalRow(entityName, normalizedPayload);
        return flattenRow(row, entityName);
      }

      const { data: userData } = await supabase.auth.getUser();
      const normalizedPayload = withDefaults(entityName, payload);
      const { data, error } = await supabase
        .from(table)
        .insert({
          data: normalizedPayload,
          user_id: userData?.user?.id || null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return flattenRow(data, entityName);
    },

    async update(id, payload) {
      if (isLocalDesktopData) {
        const row = await updateLocalRow(entityName, id, withDefaults(entityName, payload));
        return flattenRow(row, entityName);
      }

      const { data: existing, error: fetchError } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from(table)
        .update({
          data: withDefaults(entityName, { ...(existing?.data || {}), ...payload }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return flattenRow(data, entityName);
    },

    async delete(id) {
      if (isLocalDesktopData) {
        await deleteLocalRow(entityName, id);
        return true;
      }

      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return true;
    },
  };
}

async function getCurrentUser() {
  if (isDesktopRuntime) {
    return getLocalProfile() || {
      id: "local-user",
      email: "student@example.com",
      full_name: "Student",
    };
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return {
      id: "demo-user",
      email: "student@example.com",
      full_name: "Student",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email,
    full_name: profile?.full_name || data.user.user_metadata?.full_name || "Student",
    ...profile?.data,
  };
}

export const studybridge = {
  entities: Object.fromEntries(
    Object.keys(entityTables).map((entityName) => [entityName, createEntityClient(entityName)]),
  ),

  auth: {
    me: getCurrentUser,
    async updateMe(payload) {
      if (isDesktopRuntime) {
        return updateLocalProfile(payload);
      }

      const { data } = await supabase.auth.getUser();
      if (!data?.user) return { ...payload, email: "student@example.com" };

      const { data: profile, error } = await supabase
        .from("profiles")
        .upsert({
          id: data.user.id,
          email: data.user.email,
          full_name: payload.full_name,
          data: payload,
        })
        .select("*")
        .single();

      if (error) throw error;
      return flattenRow(profile);
    },
    async logout() {
      if (isDesktopRuntime) {
        return true;
      }
      await supabase.auth.signOut();
    },
    async redirectToLogin() {
      if (isDesktopRuntime) {
        return true;
      }
      const email = window.prompt("Enter your email for a Supabase magic link:");
      if (!email) return;
      await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
    },
  },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        if (isDesktopRuntime) {
          return uploadLocalFile(file);
        }

        const filePath = `${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("study-materials").upload(filePath, file);
        if (error) throw error;

        const { data } = supabase.storage.from("study-materials").getPublicUrl(filePath);
        return { file_url: data.publicUrl };
      },

      async DeleteFile({ file_url }) {
        if (isDesktopRuntime) {
          return deleteLocalFile(file_url);
        }

        if (!file_url) return true;

        const marker = "/study-materials/";
        const markerIndex = file_url.indexOf(marker);
        if (markerIndex === -1) return true;

        const filePath = decodeURIComponent(file_url.slice(markerIndex + marker.length));
        const { error } = await supabase.storage.from("study-materials").remove([filePath]);
        if (error) throw error;
        return true;
      },

      async InvokeLLM(payload) {
        if (isDesktopRuntime) {
          const desktopRuntime = await getDesktopRuntime();
          const desktopAiSettings = await getDesktopAiSettings();
          const desktopMode = desktopRuntime?.aiMode || desktopAiSettings?.mode || "disabled";
          if (desktopMode === "codex") {
            return invokeDesktopCodex(payload);
          }

          const desktopCloudProvider = desktopAiSettings?.cloudProvider || desktopRuntime?.cloudProvider || "google";
          const desktopCloudModel = desktopAiSettings?.[`${desktopCloudProvider === "google" ? "googleModel" : desktopCloudProvider === "openai" ? "openAiModel" : "anthropicModel"}`]
            || desktopRuntime?.cloudModel
            || (desktopCloudProvider === "google" ? geminiModel : desktopCloudProvider === "openai" ? "" : anthropicModel);

          if (desktopMode === "local") {
            if (desktopRuntime?.status === "error" || desktopRuntime?.status === "disabled") {
              const error = new Error("AI is disabled. Open Settings to download Gemma locally or add a cloud API key.");
              error.code = "AI_UNAVAILABLE";
              throw error;
            }

            const runtimeAfterWait = await waitForLocalRuntime();
            if (runtimeAfterWait?.status === "error" || runtimeAfterWait?.status === "disabled") {
              const error = new Error(runtimeAfterWait.error || "AI is disabled. Open Settings to download Gemma locally or add a cloud API key.");
              error.code = "AI_UNAVAILABLE";
              throw error;
            }
            return invokeLocalLlamaCpp({
              ...payload,
              model: runtimeAfterWait?.model || desktopRuntime?.model || "ggml-org/gemma-4-E2B-it-GGUF:Q8_0",
            });
          }

          if (desktopMode === "cloud") {
            const desktopCloudKey = desktopCloudProvider === "openai"
              ? desktopAiSettings?.openAiApiKey
              : desktopCloudProvider === "anthropic"
                ? desktopAiSettings?.anthropicApiKey
                : desktopAiSettings?.googleApiKey;

            if (desktopCloudProvider === "openai") {
              return invokeOpenAi({
                ...payload,
                apiKey: desktopCloudKey,
                model: desktopCloudModel,
              });
            }

            if (desktopCloudProvider === "anthropic") {
              return invokeAnthropic({
                ...payload,
                apiKey: desktopCloudKey,
                model: desktopCloudModel,
              });
            }

            return invokeGoogleGemini({
              ...payload,
              apiKey: desktopCloudKey,
              model: desktopCloudModel,
            });
          }

          const error = new Error("AI is disabled. Open Settings to connect Codex CLI, download Gemma locally, or add a cloud API key.");
          error.code = "AI_UNAVAILABLE";
          throw error;
        }

        if (llmMode === "local") {
          return invokeLocalOllama(payload);
        }

        const { data, error } = await supabase.functions.invoke("gemma", {
          body: payload,
        });
        if (error) throw error;
        return data?.response ?? data;
      },
    },
  },
};
