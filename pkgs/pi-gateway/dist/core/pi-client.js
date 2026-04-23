import { execFile, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
/** Wraps the pi CLI in print mode for non-interactive gateway use. */
export class PiClient {
    piBin;
    sessionDir;
    cwd;
    timeoutMs;
    constructor(piBin, sessionDir, cwd, timeoutMs = 5 * 60 * 1000) {
        this.piBin = piBin;
        this.sessionDir = sessionDir;
        this.cwd = cwd;
        this.timeoutMs = timeoutMs;
        mkdirSync(this.sessionDir, { recursive: true });
    }
    async prompt(message, sessionPath, options = {}) {
        const resolved = sessionPath ?? join(this.sessionDir, `session-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
        const args = [
            "--print",
            "--session", resolved,
            "--system-prompt", this.buildSystemPrompt(options.systemPromptAddendum),
            message,
        ];
        console.log(`pi: prompt start session=${resolved} chars=${message.length}`);
        const { stdout, stderr } = await this.runPromptProcess(args).catch((err) => {
            const out = err.stdout ?? "";
            const text = out.trim() || err.stderr?.trim() || err.message || "Pi returned an error.";
            console.error(`pi: prompt failed session=${resolved}: ${text}`);
            throw new Error(`pi exited with code ${err.code ?? "?"}: ${text}`);
        });
        const text = stdout.trim() || stderr.trim() || "Pi returned an empty reply.";
        console.log(`pi: prompt done session=${resolved} replyChars=${text.length}`);
        return { text, sessionPath: resolved };
    }
    async healthCheck() {
        try {
            const { stdout } = await execFileAsync(this.piBin, ["--version"], {
                timeout: 10_000,
                env: process.env,
            });
            if (!stdout.trim()) {
                console.warn("pi --version returned empty stdout, but binary exists. Continuing.");
            }
        }
        catch (err) {
            console.warn("pi health check failed, but continuing:", err);
        }
    }
    runPromptProcess(args) {
        return new Promise((resolve, reject) => {
            const child = spawn(this.piBin, args, {
                cwd: this.cwd,
                env: process.env,
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            let settled = false;
            const timer = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                child.kill("SIGTERM");
                reject({ code: "timeout", stdout, stderr: stderr || `Timed out after ${this.timeoutMs}ms` });
            }, this.timeoutMs);
            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.on("error", (err) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                reject({ code: "spawn", stdout, stderr, message: err.message });
            });
            child.on("close", (code) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                if (code === 0) {
                    resolve({ stdout, stderr });
                }
                else {
                    reject({ code, stdout, stderr });
                }
            });
        });
    }
    buildSystemPrompt(addendum) {
        return [
            "You are replying through a messaging gateway.",
            "Keep replies concise, plain-text, and mobile-friendly.",
            "Avoid markdown-heavy formatting, large code blocks, and tables unless explicitly requested.",
            "Do not perform privileged or destructive system actions from this channel.",
            addendum?.trim() ?? "",
        ]
            .filter(Boolean)
            .join(" ");
    }
}
//# sourceMappingURL=pi-client.js.map