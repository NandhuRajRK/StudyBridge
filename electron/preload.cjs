const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studybridgeDesktop", {
  getRuntimeConfig: () => ipcRenderer.invoke("studybridge:get-runtime-config"),
  getAiSettings: () => ipcRenderer.invoke("studybridge:get-ai-settings"),
  setAiSettings: (payload) => ipcRenderer.invoke("studybridge:set-ai-settings", payload),
  waitForLocalAi: () => ipcRenderer.invoke("studybridge:wait-local-ai"),
  invokeAgentRuntime: (payload) => ipcRenderer.invoke("studybridge:invoke-agent-runtime", payload),
  installAgentProvider: (provider) => ipcRenderer.invoke("studybridge:install-agent-provider", provider),
  invokeGoogleGemini: (payload) => ipcRenderer.invoke("studybridge:invoke-google-gemini", payload),
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
