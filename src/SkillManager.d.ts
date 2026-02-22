import { Tool, Resource } from "@modelcontextprotocol/sdk/types.js";
export interface SkillMetadata {
    name: string;
    description: string;
    category: string;
    filePath: string;
    content: string;
}
export declare class SkillManager {
    private skillsCache;
    private fuseIndex;
    loadSkills(): Promise<void>;
    private parseSkillMarkdown;
    getTools(): Tool[];
    handleToolCall(name: string, args: any): Promise<any>;
    getResources(): Resource[];
    readResource(uriStr: string): {
        contents: {
            uri: string;
            mimeType: string;
            text: string;
        }[];
    };
}
//# sourceMappingURL=SkillManager.d.ts.map