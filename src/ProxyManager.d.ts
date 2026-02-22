import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SecurityManager } from "./SecurityManager";
export declare class ProxyManager {
    private clients;
    private transports;
    private toolRegistry;
    private cachedTools;
    private security;
    constructor(security: SecurityManager);
    loadServers(): Promise<void>;
    getProxiedTools(): Tool[];
    canHandle(toolName: string): boolean;
    callProxiedTool(toolName: string, args: any): Promise<any>;
}
//# sourceMappingURL=ProxyManager.d.ts.map