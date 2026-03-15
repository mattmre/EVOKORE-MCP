/**
 * Example EVOKORE-MCP Plugin
 *
 * Demonstrates the plugin contract by registering a simple hello_world tool.
 * Place .js files in the plugins/ directory (or the path set by EVOKORE_PLUGINS_DIR)
 * and they will be loaded automatically at server startup.
 *
 * Reload without restarting the server by calling the reload_plugins tool.
 *
 * Plugin contract:
 *   module.exports = {
 *     name: string,           // required - unique plugin identifier
 *     version: string,        // optional - semver version
 *     register(context): void // required - called once to register tools/resources
 *   }
 *
 * context API:
 *   context.addTool(name, schema, handler)
 *   context.addResource(uri, meta, handler)
 *   context.log(message)
 */

module.exports = {
  name: 'example-hello',
  version: '1.0.0',

  register(context) {
    context.log('Registering hello_world tool');

    context.addTool(
      'hello_world',
      {
        description: 'A simple example tool that returns a greeting. Demonstrates the EVOKORE-MCP plugin contract.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to greet (default: "World")'
            }
          }
        }
      },
      async (args) => {
        const name = args?.name || 'World';
        return {
          content: [{
            type: 'text',
            text: `Hello, ${name}! This response comes from the example-hello plugin.`
          }]
        };
      }
    );
  }
};
