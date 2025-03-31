/// <reference types="astro/client" />

interface ImportMetaEnvironment {
  readonly API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnvironment;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  type Locals = Runtime;
}
