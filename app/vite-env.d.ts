/// <reference types="vite/client" />

// CSS module declarations
declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// Markdown module declarations
declare module "*.md";

// Vite environment variables
interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_CESIUM_ION_ACCESS_TOKEN: string;
  // add more environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
