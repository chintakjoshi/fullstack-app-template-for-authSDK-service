/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_CSRF_COOKIE_NAME?: string;
  readonly VITE_AUTH_CSRF_HEADER_NAME?: string;
  readonly VITE_PROTECTED_API_AUDIENCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
