/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KYKLOS_DOCS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
