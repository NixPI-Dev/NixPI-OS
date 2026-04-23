import { type WAMessage } from "@whiskeysockets/baileys";
import type { InboundMessage } from "../../core/types.js";
export declare function parseWhatsAppMessage(input: WAMessage, resolvePnForLid?: (jid: string) => string | undefined): Omit<InboundMessage, "access"> | null;
//# sourceMappingURL=parser.d.ts.map