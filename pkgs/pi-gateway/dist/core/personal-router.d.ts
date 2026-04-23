import type { InboundMessage } from "./types.js";
export type PersonalRoute = {
    kind: "reply";
    text: string;
} | {
    kind: "prompt";
    message: string;
    systemPromptAddendum: string;
};
export declare class PersonalRouter {
    private readonly planner;
    private readonly reminders;
    private readonly journal;
    private readonly tasks;
    route(msg: InboundMessage, text: string): Promise<PersonalRoute>;
}
//# sourceMappingURL=personal-router.d.ts.map