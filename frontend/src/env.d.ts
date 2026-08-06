interface ImportMetaEnv {
  readonly VITE_GEOCODER_URL?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
