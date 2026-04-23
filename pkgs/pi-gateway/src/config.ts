import { readFileSync } from "node:fs";
import YAML from "yaml";

export type SignalTransportConfig = {
  enabled: boolean;
  account: string;
  httpUrl: string;
  allowedNumbers: string[];
  adminNumbers: string[];
  directMessagesOnly: boolean;
};

export type WhatsAppTransportConfig = {
  enabled: boolean;
  trustedNumbers: string[];
  adminNumbers: string[];
  directMessagesOnly: boolean;
  sessionDataPath: string;
  chromiumExecutablePath?: string;
  headless?: boolean;
};

export type GatewayConfig = {
  gateway: {
    dbPath: string;
    sessionDir: string;
    maxReplyChars: number;
    maxReplyChunks: number;
  };
  pi: {
    bin: string;
    cwd: string;
    timeoutMs?: number;
  };
  transports: {
    signal?: SignalTransportConfig;
    whatsapp?: WhatsAppTransportConfig;
  };
};

export function loadConfig(path: string): GatewayConfig {
  const raw = readFileSync(path, "utf-8");
  return YAML.parse(raw) as GatewayConfig;
}
