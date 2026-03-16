/**
 * Hello World Plugin - Minimal EVOKORE-MCP Plugin Example
 *
 * Demonstrates the simplest possible plugin: a single tool that returns a
 * greeting. Copy this file into the plugins/ directory (one level up) and
 * call reload_plugins to activate it.
 *
 * Plugin contract:
 *   module.exports = {
 *     name: string,            // required - unique plugin identifier
 *     version?: string,        // optional - semver version
 *     register(context): void  // required - called once to register tools/resources
 *   }
 *
 * context API:
 *   context.addTool(name, schema, handler)
 *   context.addResource(uri, meta, handler)
 *   context.log(message)
 *   context.emitWebhook(event, data)
 *   context.onWebhookEvent(eventType, handler)
 */

module.exports = {
  name: 'hello-world',
  version: '1.0.0',

  register(context) {
    context.log('Registering greet tool');

    context.addTool(
      'greet',
      {
        description: 'Returns a greeting message. A minimal example of an EVOKORE-MCP plugin tool.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to greet'
            }
          },
          required: ['name']
        },
        annotations: {
          title: 'Greet',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async (args) => {
        const name = args?.name || 'World';
        return {
          content: [{
            type: 'text',
            text: `Hello, ${name}! Welcome to EVOKORE-MCP.`
          }]
        };
      }
    );
  }
};
