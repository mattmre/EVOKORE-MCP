/**
 * System Info Plugin - Multi-Tool and Resource Example
 *
 * Demonstrates a plugin that registers multiple tools and a resource.
 * Tools expose system information; the resource provides a machine-readable
 * summary at a custom URI.
 *
 * Copy this file into the plugins/ directory (one level up) and call
 * reload_plugins to activate it.
 *
 * Key APIs demonstrated:
 *   context.addTool(name, schema, handler)          - register tools
 *   context.addResource(uri, meta, handler)         - register a resource
 *   context.emitWebhook(event, data)                - emit custom events
 *   context.log(message)                            - structured logging
 */

const os = require('os');

module.exports = {
  name: 'system-info',
  version: '1.0.0',

  register(context) {
    context.log('Registering system info tools and resource');

    // Tool 1: Get system information
    context.addTool(
      'get_system_info',
      {
        description: 'Returns current system information including CPU, memory, platform, and Node.js version.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        annotations: {
          title: 'Get System Info',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async () => {
        const info = {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
          freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
          uptime: `${Math.round(os.uptime() / 3600)}h`,
          nodeVersion: process.version,
          hostname: os.hostname()
        };

        // Emit a custom webhook event when system info is queried
        context.emitWebhook('system_info_queried', { timestamp: new Date().toISOString() });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(info, null, 2)
          }]
        };
      }
    );

    // Tool 2: Get memory usage details
    context.addTool(
      'get_memory_usage',
      {
        description: 'Returns detailed memory usage for the current Node.js process and system.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        annotations: {
          title: 'Get Memory Usage',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async () => {
        const proc = process.memoryUsage();
        const usage = {
          system: {
            totalMB: Math.round(os.totalmem() / 1024 / 1024),
            freeMB: Math.round(os.freemem() / 1024 / 1024),
            usedPercent: Math.round((1 - os.freemem() / os.totalmem()) * 100)
          },
          process: {
            rssKB: Math.round(proc.rss / 1024),
            heapTotalKB: Math.round(proc.heapTotal / 1024),
            heapUsedKB: Math.round(proc.heapUsed / 1024),
            externalKB: Math.round(proc.external / 1024)
          }
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(usage, null, 2)
          }]
        };
      }
    );

    // Resource: machine-readable system summary
    context.addResource(
      'plugin://system-info/summary',
      {
        name: 'System Info Summary',
        mimeType: 'application/json',
        description: 'Machine-readable system information summary from the system-info plugin.'
      },
      async () => {
        return {
          text: JSON.stringify({
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
            freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
            uptimeHours: Math.round(os.uptime() / 3600),
            nodeVersion: process.version
          })
        };
      }
    );
  }
};
