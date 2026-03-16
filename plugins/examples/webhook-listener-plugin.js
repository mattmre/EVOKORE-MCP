/**
 * Webhook Listener Plugin - Event Subscription Example
 *
 * Demonstrates how a plugin can subscribe to EVOKORE webhook events
 * (tool_call, tool_error, session_start, session_end, etc.) and expose
 * the captured event log as a tool.
 *
 * Copy this file into the plugins/ directory (one level up) and call
 * reload_plugins to activate it. Events are only captured while the
 * plugin is loaded; the in-memory log resets on reload.
 *
 * Key APIs demonstrated:
 *   context.onWebhookEvent(eventType, handler) - subscribe to events
 *   context.addTool(name, schema, handler)      - register a tool
 *   context.log(message)                        - structured logging
 */

// In-memory event log. Persists across tool calls but resets on plugin reload.
const eventLog = [];
const MAX_LOG_SIZE = 100;

module.exports = {
  name: 'webhook-listener',
  version: '1.0.0',

  register(context) {
    // Subscribe to tool_call events so we can track which tools are invoked
    context.onWebhookEvent('tool_call', (event) => {
      eventLog.push({
        type: 'tool_call',
        timestamp: event.timestamp || new Date().toISOString(),
        tool: event.data?.tool || 'unknown'
      });
      // Keep the log bounded
      if (eventLog.length > MAX_LOG_SIZE) {
        eventLog.splice(0, eventLog.length - MAX_LOG_SIZE);
      }
    });

    // Subscribe to tool_error events
    context.onWebhookEvent('tool_error', (event) => {
      eventLog.push({
        type: 'tool_error',
        timestamp: event.timestamp || new Date().toISOString(),
        tool: event.data?.tool || 'unknown',
        error: event.data?.error || 'unknown error'
      });
      if (eventLog.length > MAX_LOG_SIZE) {
        eventLog.splice(0, eventLog.length - MAX_LOG_SIZE);
      }
    });

    context.log(`Subscribed to tool_call and tool_error events (max ${MAX_LOG_SIZE} entries)`);

    // Register a tool that exposes the captured events
    context.addTool(
      'get_event_log',
      {
        description: 'Returns recent webhook events captured by the webhook-listener plugin. Shows the last 10 events by default.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of events to return (default: 10, max: 100)'
            }
          }
        },
        annotations: {
          title: 'Get Event Log',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async (args) => {
        const limit = Math.min(Math.max(args?.limit || 10, 1), MAX_LOG_SIZE);
        const events = eventLog.slice(-limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalCaptured: eventLog.length,
              showing: events.length,
              events
            }, null, 2)
          }]
        };
      }
    );
  }
};
