// Settings shape and defaults: the single source of truth for the background,
// the content script and the options page.

export type Provider = "groq" | "gemini" | "ollama" | "claude";

export interface Settings {
  aiEnabled: boolean;
  provider: Provider;
  autoBackup: boolean;
  whisper: boolean;
  ollamaBackup: boolean;
  groqKey: string;
  groqModel: string;
  geminiKey: string;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  apiKey: string; // Claude
  model: string; // Claude, deep research
  brainModel: string; // Claude, fast
  styleNote: string;
  wakeWordEnabled: boolean;
  wakeWord: string;
  lang: string;
  talkOver: boolean;
  voiceName: string;
  scrollSpeed: number;
  voiceRate: number;
}

export const DEFAULTS: Settings = {
  aiEnabled: true,
  provider: "groq",
  autoBackup: true,
  whisper: true,
  ollamaBackup: false,
  groqKey: "",
  groqModel: "openai/gpt-oss-120b",
  geminiKey: "",
  geminiModel: "gemini-flash-latest",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
  apiKey: "",
  model: "claude-sonnet-5",
  brainModel: "claude-haiku-4-5-20251001",
  styleNote: "",
  wakeWordEnabled: false,
  wakeWord: "hey feed",
  lang: "en-US",
  talkOver: true,
  voiceName: "",
  scrollSpeed: 2,
  voiceRate: 1.15,
};

// API keys are read only by the background worker; the x.com page never asks for them.
export const SECRET_KEYS = ["groqKey", "geminiKey", "apiKey"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
export type PublicSettings = Omit<Settings, SecretKey>;

export const isSecretKey = (key: string): key is SecretKey =>
  (SECRET_KEYS as readonly string[]).includes(key);

export const PUBLIC_DEFAULTS = Object.fromEntries(
  Object.entries(DEFAULTS).filter(([k]) => !isSecretKey(k)),
) as unknown as PublicSettings;

export type AIConfig = Pick<Settings, "provider" | "ollamaBackup" | SecretKey>;

export function isConfigured(name: Provider, s: AIConfig): boolean {
  switch (name) {
    case "groq":
      return !!s.groqKey;
    case "gemini":
      return !!s.geminiKey;
    case "claude":
      return !!s.apiKey;
    case "ollama":
      return s.provider === "ollama" || s.ollamaBackup;
  }
}

// True if at least one AI is set up (the others act as automatic backups).
export const hasAnyAI = (s: AIConfig): boolean =>
  s.provider === "ollama" || !!s.groqKey || !!s.geminiKey || !!s.apiKey;
