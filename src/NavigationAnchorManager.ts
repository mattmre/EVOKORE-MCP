import fs from "fs/promises";
import { createReadStream } from "fs";
import readline from "readline";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Regex for parsing @AI:NAV anchors:
 *   @AI:NAV[SEC:my-section] description text
 *   @AI:NAV[END:my-section]
 *   @AI:NAV[INS:insert-point] description text
 */
const NAV_ANCHOR_REGEX = /@AI:NAV\[(SEC|END|INS):([a-z0-9-]+)\]\s*(.*)/;

const MAX_WINDOW_LINES = 500;

export type NavAnchorType = "SEC" | "END" | "INS";

export interface NavAnchor {
  id: string;
  type: NavAnchorType;
  line: number;
  description: string;
}

export interface NavInsertPoint {
  id: string;
  line: number;
  description: string;
}

export interface NavSection {
  id: string;
  start_line: number;
  end_line: number;
  line_count: number;
  description: string;
  insert_points: NavInsertPoint[];
}

export interface NavMap {
  file: string;
  total_lines: number;
  anchor_count: number;
  anchors: NavAnchor[];
  sections: NavSection[];
  warnings: string[];
}

export interface NavReadResult {
  file: string;
  anchor_id: string;
  anchor_type: NavAnchorType;
  anchor_line: number;
  window: {
    start_line: number;
    end_line: number;
    line_count: number;
  };
  content: string;
}

/**
 * NavigationAnchorManager provides two token-efficient tools for reading
 * large source files by using `@AI:NAV` anchors as structural markers.
 *
 * - `nav_get_map`: scans a file for all anchors and returns a map of sections
 *    and insert points without returning file content.
 * - `nav_read_anchor`: reads a bounded window of lines centered on a named
 *    anchor without loading the full file.
 *
 * Both tools stream the file line-by-line via `readline` so they stay
 * memory-bounded even on very large files.
 */
export class NavigationAnchorManager {
  getTools(): Tool[] {
    return [
      {
        name: "nav_get_map",
        description:
          "Scan a file for @AI:NAV anchors and return a structural map (sections, insert points, warnings) without returning file content. Useful for cheaply discovering where to edit large files.",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the file to scan",
            },
          },
          required: ["path"],
        },
        annotations: {
          title: "Get Navigation Anchor Map",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "nav_read_anchor",
        description:
          "Read a bounded window of lines centered on a named @AI:NAV anchor without loading the full file. Returns content formatted as 'LINE:\\tCONTENT' matching the Read tool format.",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the file to read",
            },
            anchor_id: {
              type: "string",
              description: "The anchor identifier (e.g., 'new-entity-import')",
            },
            lines_before: {
              type: "number",
              description: "Number of lines to include before the anchor (default 20, max 500)",
              default: 20,
            },
            lines_after: {
              type: "number",
              description: "Number of lines to include after the anchor (default 10, max 500)",
              default: 10,
            },
            anchor_type: {
              type: "string",
              enum: ["SEC", "END", "INS"],
              description: "Optional: disambiguate if the same id is used for SEC and INS",
            },
          },
          required: ["path", "anchor_id"],
        },
        annotations: {
          title: "Read Navigation Anchor Window",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isNavTool(name: string): boolean {
    return name === "nav_get_map" || name === "nav_read_anchor";
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    if (toolName === "nav_get_map") {
      return this.handleGetMap(args);
    }
    if (toolName === "nav_read_anchor") {
      return this.handleReadAnchor(args);
    }
    return null;
  }

  // ---- nav_get_map ----

  private async handleGetMap(args: any): Promise<any> {
    const filePath: string | undefined = args?.path;
    if (!filePath || typeof filePath !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required argument: path" }],
      };
    }

    try {
      await fs.access(filePath);
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: `File not found: ${filePath}` }],
      };
    }

    const map = await this.scanFileForAnchors(filePath);

    return {
      content: [{ type: "text", text: JSON.stringify(map, null, 2) }],
    };
  }

  private async scanFileForAnchors(filePath: string): Promise<NavMap> {
    const anchors: NavAnchor[] = [];
    let totalLines = 0;

    const stream = createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lineNumber = 0;
    for await (const line of rl) {
      lineNumber++;
      const match = line.match(NAV_ANCHOR_REGEX);
      if (match) {
        const type = match[1] as NavAnchorType;
        const id = match[2];
        const description = (match[3] || "").trim();
        anchors.push({ id, type, line: lineNumber, description });
      }
    }
    totalLines = lineNumber;

    const warnings: string[] = [];
    const sections = this.buildSections(anchors, warnings);

    return {
      file: filePath,
      total_lines: totalLines,
      anchor_count: anchors.length,
      anchors,
      sections,
      warnings,
    };
  }

  private buildSections(anchors: NavAnchor[], warnings: string[]): NavSection[] {
    // Detect duplicate anchor IDs (same id+type appearing twice)
    const seen = new Map<string, number>();
    for (const a of anchors) {
      const key = `${a.type}:${a.id}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [key, count] of seen.entries()) {
      if (count > 1) {
        warnings.push(`Duplicate anchor '${key}' appears ${count} times`);
      }
    }

    const secById = new Map<string, NavAnchor>();
    for (const a of anchors) {
      if (a.type === "SEC") {
        if (!secById.has(a.id)) {
          secById.set(a.id, a);
        }
      }
    }

    const endById = new Map<string, NavAnchor>();
    for (const a of anchors) {
      if (a.type === "END") {
        if (!endById.has(a.id)) {
          endById.set(a.id, a);
        }
      }
    }

    // Warn about unpaired anchors
    for (const [id, sec] of secById.entries()) {
      if (!endById.has(id)) {
        warnings.push(`Unpaired SEC '${id}' has no matching END`);
      }
      void sec;
    }
    for (const [id] of endById.entries()) {
      if (!secById.has(id)) {
        warnings.push(`Unpaired END '${id}' has no matching SEC`);
      }
    }

    // Build sections for all properly paired SEC/END
    const sections: NavSection[] = [];
    for (const [id, sec] of secById.entries()) {
      const end = endById.get(id);
      if (!end) continue;

      const startLine = sec.line;
      const endLine = end.line;

      // Guard: END appearing before SEC produces an invalid section
      if (endLine < startLine) {
        warnings.push(`Section '${id}' has END (line ${endLine}) before SEC (line ${startLine}) — skipping`);
        continue;
      }

      const insertPoints: NavInsertPoint[] = anchors
        .filter((a) => a.type === "INS" && a.line >= startLine && a.line <= endLine)
        .map((a) => ({ id: a.id, line: a.line, description: a.description }));

      sections.push({
        id,
        start_line: startLine,
        end_line: endLine,
        line_count: endLine - startLine + 1,
        description: sec.description,
        insert_points: insertPoints,
      });
    }

    // Sort sections by start_line
    sections.sort((a, b) => a.start_line - b.start_line);
    return sections;
  }

  // ---- nav_read_anchor ----

  private async handleReadAnchor(args: any): Promise<any> {
    const filePath: string | undefined = args?.path;
    const anchorId: string | undefined = args?.anchor_id;
    const anchorType: NavAnchorType | undefined = args?.anchor_type;

    if (!filePath || typeof filePath !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required argument: path" }],
      };
    }
    if (!anchorId || typeof anchorId !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "Missing required argument: anchor_id" }],
      };
    }

    const rawBefore = typeof args?.lines_before === "number" ? args.lines_before : 20;
    const rawAfter = typeof args?.lines_after === "number" ? args.lines_after : 10;
    const linesBefore = Math.min(Math.max(0, Math.floor(rawBefore)), MAX_WINDOW_LINES);
    const linesAfter = Math.min(Math.max(0, Math.floor(rawAfter)), MAX_WINDOW_LINES);

    try {
      await fs.access(filePath);
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: `File not found: ${filePath}` }],
      };
    }

    // First pass: locate the anchor line and capture the anchor_type
    let anchorLine = -1;
    let foundType: NavAnchorType | null = null;
    {
      const stream = createReadStream(filePath, { encoding: "utf8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        const match = line.match(NAV_ANCHOR_REGEX);
        if (!match) continue;
        const thisType = match[1] as NavAnchorType;
        const thisId = match[2];
        if (thisId !== anchorId) continue;
        if (anchorType && thisType !== anchorType) continue;
        anchorLine = lineNumber;
        foundType = thisType;
        break;
      }
      rl.close();
      stream.destroy();
    }

    if (anchorLine < 0 || foundType === null) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Anchor '${anchorId}' not found in ${filePath}. Run nav_get_map to see available anchors.`,
          },
        ],
      };
    }

    const startLine = Math.max(1, anchorLine - linesBefore);
    const endLine = anchorLine + linesAfter;

    // Second pass: collect the bounded window of lines
    const collected: string[] = [];
    {
      const stream = createReadStream(filePath, { encoding: "utf8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        if (lineNumber < startLine) continue;
        if (lineNumber > endLine) break;
        collected.push(`${lineNumber}:\t${line}`);
      }
      rl.close();
      stream.destroy();
    }

    const actualEndLine = startLine + collected.length - 1;
    const result: NavReadResult = {
      file: filePath,
      anchor_id: anchorId,
      anchor_type: foundType,
      anchor_line: anchorLine,
      window: {
        start_line: startLine,
        end_line: actualEndLine < startLine ? startLine : actualEndLine,
        line_count: collected.length,
      },
      content: collected.join("\n"),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
