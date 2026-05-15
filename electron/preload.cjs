const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appAI", {
  invoke: (prompt) => ipcRenderer.invoke("codex:invoke", { prompt }),
  status: () => ipcRenderer.invoke("codex:status"),
  login: () => ipcRenderer.invoke("codex:login"),
  install: () => ipcRenderer.invoke("codex:install"),
});

contextBridge.exposeInMainWorld("studybridgeDesktop", {
  getRuntimeConfig: () => ipcRenderer.invoke("studybridge:get-runtime-config"),
  getAiSettings: () => ipcRenderer.invoke("studybridge:get-ai-settings"),
  setAiSettings: (payload) => ipcRenderer.invoke("studybridge:set-ai-settings", payload),
  waitForLocalAi: () => ipcRenderer.invoke("studybridge:wait-local-ai"),
  invokeLocalProvider: (payload) => ipcRenderer.invoke("studybridge:invoke-local-provider", payload),
  invokeCloudProvider: (payload) => ipcRenderer.invoke("studybridge:invoke-cloud-provider", payload),
  invokeGoogleGemini: (payload) => ipcRenderer.invoke("studybridge:invoke-google-gemini", payload),
  installOllama: () => ipcRenderer.invoke("studybridge:install-ollama"),
  getLocalProfile: () => ipcRenderer.invoke("studybridge:get-local-profile"),
  updateLocalProfile: (payload) => ipcRenderer.invoke("studybridge:update-local-profile", payload),
  resetLocalProfile: () => ipcRenderer.invoke("studybridge:reset-local-profile"),
  listLocalEntity: (entityName) => ipcRenderer.invoke("studybridge:list-local-entity", entityName),
  createLocalEntity: (entityName, payload) => ipcRenderer.invoke("studybridge:create-local-entity", entityName, payload),
  updateLocalEntity: (entityName, id, payload) => ipcRenderer.invoke("studybridge:update-local-entity", entityName, id, payload),
  deleteLocalEntity: (entityName, id) => ipcRenderer.invoke("studybridge:delete-local-entity", entityName, id),
  uploadLocalFile: (payload) => ipcRenderer.invoke("studybridge:upload-local-file", payload),
  deleteLocalFile: (fileUrl) => ipcRenderer.invoke("studybridge:delete-local-file", fileUrl),
});
