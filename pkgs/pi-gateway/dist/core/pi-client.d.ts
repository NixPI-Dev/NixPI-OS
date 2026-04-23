type PromptOptions = {
    systemPromptAddendum?: string;
};
/** Wraps the pi CLI in print mode for non-interactive gateway use. */
export declare class PiClient {
    private readonly piBin;
    private readonly sessionDir;
    private readonly cwd;
    private readonly timeoutMs;
    constructor(piBin: string, sessionDir: string, cwd: string, timeoutMs?: number);
    prompt(message: string, sessionPath: string | null, options?: PromptOptions): Promise<{
        text: string;
        sessionPath: string;
    }>;
    healthCheck(): Promise<void>;
    private runPromptProcess;
    private buildSystemPrompt;
}
export {};
//# sourceMappingURL=pi-client.d.ts.map