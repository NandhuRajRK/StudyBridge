/// <reference types="vite/client" />

export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_STUDYBRIDGE_API_URL?: string;
    readonly VITE_STUDYBRIDGE_API_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    studybridgeDesktop?: any;
    appAI?: any;
  }

  interface Error {
    code?: string;
  }
}
