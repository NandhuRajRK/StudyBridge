import { isDesktopApp } from "@/lib/runtime";

const isDesktopRuntime = isDesktopApp();
const geminiModel = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const openAiModel = import.meta.env.VITE_OPENAI_MODEL || "";
const anthropicModel =
  import.meta.env.VITE_ANTHROPIC_MODEL || "claude-sonnet-4-0";
const LARGE_FILE_CONFIRM_BYTES = 25 * 1024 * 1024;

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const order = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** order;
  return `${value.toFixed(value >= 10 || order === 0 ? 0 : 1)} ${units[order]}`;
}

function ensureDesktopRuntime() {
  if (isDesktopRuntime && window.studybridgeDesktop) return;
  throw new Error(
    "Desktop runtime required. Launch StudyBridge via the Windows installer or the desktop dev command.",
  );
}

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
  if (!isDesktopRuntime || !window.studybridgeDesktop?.getRuntimeConfig)
    return null;
  try {
    return await window.studybridgeDesktop.getRuntimeConfig();
  } catch {
    return null;
  }
}

async function getDesktopAiSettings() {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.getAiSettings)
    return null;
  try {
    return await window.studybridgeDesktop.getAiSettings();
  } catch {
    return null;
  }
}

async function waitForLocalRuntime() {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.waitForLocalAi)
    return null;
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

async function invokeDesktopLocalProvider(payload) {
  if (!isDesktopRuntime || !window.studybridgeDesktop?.invokeLocalProvider) {
    throw new Error("Local AI runtime is unavailable.");
  }
  return window.studybridgeDesktop.invokeLocalProvider(payload);
}

function getDesktopDataBridge() {
  ensureDesktopRuntime();
  return window.studybridgeDesktop;
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
  if (!bridge?.createLocalEntity)
    throw new Error("Local storage is unavailable.");
  return bridge.createLocalEntity(entityName, payload);
}

async function updateLocalRow(entityName, id, payload) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.updateLocalEntity)
    throw new Error("Local storage is unavailable.");
  return bridge.updateLocalEntity(entityName, id, payload);
}

async function deleteLocalRow(entityName, id) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.deleteLocalEntity)
    throw new Error("Local storage is unavailable.");
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
  if (!bridge?.updateLocalProfile)
    throw new Error("Local storage is unavailable.");
  return bridge.updateLocalProfile(payload);
}

async function uploadLocalFile(file) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.uploadLocalFile)
    throw new Error("Local storage is unavailable.");

  if (file?.size > LARGE_FILE_CONFIRM_BYTES) {
    const confirmed = window.confirm(
      `This file is ${formatFileSize(file.size)}. Upload anyway?`,
    );
    if (!confirmed) {
      const error = new Error("Upload cancelled by user.");
      error.code = "UPLOAD_CANCELLED";
      throw error;
    }
  }

  const buffer = await file.arrayBuffer();
  return bridge.uploadLocalFile({
    name: file.name,
    mimeType: file.type,
    buffer,
  });
}

async function deleteLocalFile(fileUrl) {
  const bridge = getDesktopDataBridge();
  if (!bridge?.deleteLocalFile)
    throw new Error("Local storage is unavailable.");
  return bridge.deleteLocalFile(fileUrl);
}

async function invokeGoogleGemini({
  prompt,
  response_json_schema,
  apiKey,
  model = geminiModel,
}) {
  if (isDesktopRuntime && window.studybridgeDesktop?.invokeCloudProvider) {
    return invokeDesktopCloudProvider({
      provider: "google",
      prompt,
      response_json_schema,
      model,
    });
  }

  if (!apiKey) {
    const error = new Error(
      "AI is disabled. Open Settings to download Gemma locally or add a cloud API key.",
    );
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
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
          ...(response_json_schema
            ? { responseMimeType: "application/json" }
            : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google AI request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";
  return response_json_schema ? extractJson(text) : text;
}

async function invokeOpenAi({
  prompt,
  response_json_schema,
  apiKey,
  model = openAiModel,
}) {
  if (isDesktopRuntime && window.studybridgeDesktop?.invokeCloudProvider) {
    return invokeDesktopCloudProvider({
      provider: "openai",
      prompt,
      response_json_schema,
      model,
    });
  }

  if (!apiKey) {
    const error = new Error(
      "OpenAI API key missing. Open Settings to add your key.",
    );
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  if (!model) {
    throw new Error(
      "OpenAI model missing. Use Codex CLI for default-profile OpenAI access, or explicitly configure an API model.",
    );
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
      ...(response_json_schema
        ? { response_format: { type: "json_object" } }
        : {}),
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

async function invokeAnthropic({
  prompt,
  response_json_schema,
  apiKey,
  model = anthropicModel,
}) {
  if (isDesktopRuntime && window.studybridgeDesktop?.invokeCloudProvider) {
    return invokeDesktopCloudProvider({
      provider: "anthropic",
      prompt,
      response_json_schema,
      model,
    });
  }

  if (!apiKey) {
    const error = new Error(
      "Anthropic API key missing. Open Settings to add your key.",
    );
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

  return {
    async list(sortExpression, limit) {
      const rows = sortRows(
        (await listLocalRows(entityName)).map((row) =>
          flattenRow(row, entityName),
        ),
        sortExpression,
      );
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },

    async filter(filter, sortExpression, limit) {
      const rows = await this.list(sortExpression);
      const filtered = rows.filter((row) => matchesFilter(row, filter));
      return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
    },

    async create(payload) {
      const normalizedPayload = withDefaults(entityName, payload);
      const row = await createLocalRow(entityName, normalizedPayload);
      return flattenRow(row, entityName);
    },

    async update(id, payload) {
      const row = await updateLocalRow(
        entityName,
        id,
        withDefaults(entityName, payload),
      );
      return flattenRow(row, entityName);
    },

    async delete(id) {
      await deleteLocalRow(entityName, id);
      return true;
    },
  };
}

async function getCurrentUser() {
  ensureDesktopRuntime();
  return (
    getLocalProfile() || {
      id: "local-user",
      email: "student@example.com",
      full_name: "Student",
    }
  );
}

export const studybridge = {
  entities: Object.fromEntries(
    Object.keys(entityTables).map((entityName) => [
      entityName,
      createEntityClient(entityName),
    ]),
  ),

  auth: {
    me: getCurrentUser,
    async updateMe(payload) {
      ensureDesktopRuntime();
      return updateLocalProfile(payload);
    },
    async logout() {
      return true;
    },
    async redirectToLogin() {
      return true;
    },
  },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        ensureDesktopRuntime();
        return uploadLocalFile(file);
      },

      async DeleteFile({ file_url }) {
        ensureDesktopRuntime();
        if (!file_url) return true;
        return deleteLocalFile(file_url);
      },

      async InvokeLLM(payload) {
        ensureDesktopRuntime();
        const desktopRuntime = await getDesktopRuntime();
        const desktopAiSettings = await getDesktopAiSettings();
        const desktopMode =
          desktopRuntime?.aiMode || desktopAiSettings?.mode || "disabled";
        if (desktopMode === "codex") {
          return invokeDesktopCodex(payload);
        }

        const desktopCloudProvider =
          desktopAiSettings?.cloudProvider ||
          desktopRuntime?.cloudProvider ||
          "google";
        const desktopCloudModel =
          desktopAiSettings?.[
            `${desktopCloudProvider === "google" ? "googleModel" : desktopCloudProvider === "openai" ? "openAiModel" : "anthropicModel"}`
          ] ||
          desktopRuntime?.cloudModel ||
          (desktopCloudProvider === "google"
            ? geminiModel
            : desktopCloudProvider === "openai"
              ? ""
              : anthropicModel);

        if (desktopMode === "local") {
          if (
            [
              "error",
              "disabled",
              "missing_provider",
              "missing_model",
              "starting",
              "downloading-model",
            ].includes(desktopRuntime?.status)
          ) {
            const error = new Error(
              "AI is disabled. Open Settings to download Gemma locally or add a cloud API key.",
            );
            error.code = "AI_UNAVAILABLE";
            throw error;
          }

          const runtimeAfterWait = await waitForLocalRuntime();
          if (
            [
              "error",
              "disabled",
              "missing_provider",
              "missing_model",
              "starting",
              "downloading-model",
            ].includes(runtimeAfterWait?.status)
          ) {
            const error = new Error(
              runtimeAfterWait.error ||
                "AI is disabled. Open Settings to download Gemma locally or add a cloud API key.",
            );
            error.code = "AI_UNAVAILABLE";
            throw error;
          }
          return invokeDesktopLocalProvider({
            ...payload,
            model:
              runtimeAfterWait?.model ||
              desktopRuntime?.model ||
              "ggml-org/gemma-4-E2B-it-GGUF:Q8_0",
          });
        }

        if (desktopMode === "cloud") {
          const desktopCloudKey =
            desktopCloudProvider === "openai"
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

        const error = new Error(
          "AI is disabled. Open Settings to connect Codex CLI, download Gemma locally, or add a cloud API key.",
        );
        error.code = "AI_UNAVAILABLE";
        throw error;
      },
    },
  },
};
