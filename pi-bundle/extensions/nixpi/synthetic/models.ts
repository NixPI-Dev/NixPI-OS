export type ModelDef = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
};

// Hardcoded from https://api.synthetic.new/openai/v1/models
// Pricing is per-million tokens.
export const MODELS: ModelDef[] = [
  { id: "hf:zai-org/GLM-5.1", name: "GLM 5.1", reasoning: true, input: ["text"], cost: { input: 1, output: 3, cacheRead: 1, cacheWrite: 0 }, contextWindow: 196608, maxTokens: 65536 },
  { id: "hf:moonshotai/Kimi-K2.5", name: "Kimi K2.5", reasoning: true, input: ["text", "image"], cost: { input: 0.45, output: 3.4, cacheRead: 0.45, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 65536 },
  { id: "hf:nvidia/Kimi-K2.5-NVFP4", name: "Kimi K2.5 NVFP4", reasoning: true, input: ["text", "image"], cost: { input: 0.45, output: 3.4, cacheRead: 0.45, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 65536 },
  { id: "hf:MiniMaxAI/MiniMax-M2.5", name: "MiniMax M2.5", reasoning: true, input: ["text"], cost: { input: 0.4, output: 2, cacheRead: 0.4, cacheWrite: 0 }, contextWindow: 191488, maxTokens: 65536 },
  { id: "hf:zai-org/GLM-4.7-Flash", name: "GLM 4.7 Flash", reasoning: true, input: ["text"], cost: { input: 0.1, output: 0.5, cacheRead: 0.1, cacheWrite: 0 }, contextWindow: 196608, maxTokens: 65536 },
  { id: "hf:zai-org/GLM-5", name: "GLM 5", reasoning: true, input: ["text"], cost: { input: 1, output: 3, cacheRead: 1, cacheWrite: 0 }, contextWindow: 196608, maxTokens: 65536 },
  { id: "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4", name: "Nemotron 3 Super 120B", reasoning: true, input: ["text"], cost: { input: 0.3, output: 1, cacheRead: 0.3, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 65536 },
  { id: "hf:zai-org/GLM-4.7", name: "GLM 4.7", reasoning: true, input: ["text"], cost: { input: 0.45, output: 2.19, cacheRead: 0.45, cacheWrite: 0 }, contextWindow: 202752, maxTokens: 65536 },
  { id: "hf:deepseek-ai/DeepSeek-V3.2", name: "DeepSeek V3.2", reasoning: true, input: ["text"], cost: { input: 0.56, output: 1.68, cacheRead: 0.56, cacheWrite: 0 }, contextWindow: 162816, maxTokens: 65536 },
  { id: "hf:Qwen/Qwen3-Coder-480B-A35B-Instruct", name: "Qwen3 Coder 480B", reasoning: true, input: ["text"], cost: { input: 2, output: 2, cacheRead: 2, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 65536 },
  { id: "hf:Qwen/Qwen3.5-397B-A17B", name: "Qwen3.5 397B", reasoning: true, input: ["text", "image"], cost: { input: 0.6, output: 3.6, cacheRead: 0.6, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 65536 },
  { id: "hf:Qwen/Qwen3-235B-A22B-Thinking-2507", name: "Qwen3 235B Thinking", reasoning: true, input: ["text"], cost: { input: 0.65, output: 3, cacheRead: 0.65, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 65536 },
  { id: "hf:deepseek-ai/DeepSeek-R1-0528", name: "DeepSeek R1", reasoning: true, input: ["text"], cost: { input: 3, output: 8, cacheRead: 3, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 65536 },
  { id: "hf:openai/gpt-oss-120b", name: "GPT OSS 120B", reasoning: false, input: ["text"], cost: { input: 0.1, output: 0.1, cacheRead: 0.1, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 65536 },
  { id: "hf:meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B", reasoning: false, input: ["text"], cost: { input: 0.88, output: 0.88, cacheRead: 0.88, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 65536 },
];
