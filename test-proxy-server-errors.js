const { ProxyManager } = require('./dist/ProxyManager.js');
const { SecurityManager } = require('./dist/SecurityManager.js');

function createProxy(mockCallTool) {
  const security = new SecurityManager();
  const proxy = new ProxyManager(security);

  proxy.toolRegistry.set('mock_tool', { serverId: 'mock_server', originalName: 'tool' });
  proxy.serverRegistry.set('mock_server', {
    id: 'mock_server',
    status: 'connected',
    connectionType: 'stdio',
    errorCount: 0,
    lastPing: Date.now()
  });
  proxy.clients.set('mock_server', { callTool: mockCallTool });

  return proxy;
}

async function testToolErrorsIncrementServerStatus() {
  const proxy = createProxy(async () => ({
    content: [{ type: 'text', text: 'Tool execution failed upstream.' }],
    isError: true
  }));

  for (let i = 0; i < 5; i++) {
    const result = await proxy.callProxiedTool('mock_tool', { attempt: i });
    if (!result.isError) {
      throw new Error('Expected proxied tool error result during server error count test.');
    }
  }

  const state = proxy.serverRegistry.get('mock_server');
  if (!state) {
    throw new Error('Expected mock server state to exist.');
  }
  if (state.errorCount !== 5) {
    throw new Error(`Expected tool errors to increment errorCount to 5, got ${state.errorCount}.`);
  }
  if (state.status !== 'error') {
    throw new Error(`Expected tool errors to mark server as error, got '${state.status}'.`);
  }
}

async function testTransportErrorsIncrementServerStatus() {
  const proxy = createProxy(async () => {
    throw new Error('Simulated transport failure');
  });

  for (let i = 0; i < 5; i++) {
    try {
      await proxy.callProxiedTool('mock_tool', { attempt: i });
      throw new Error('Expected proxied transport error to throw.');
    } catch (error) {
      if (!String(error && error.message).includes('Simulated transport failure')) {
        throw error;
      }
    }
  }

  const state = proxy.serverRegistry.get('mock_server');
  if (!state) {
    throw new Error('Expected mock server state to exist after transport failures.');
  }
  if (state.errorCount !== 5) {
    throw new Error(`Expected transport errors to increment errorCount to 5, got ${state.errorCount}.`);
  }
  if (state.status !== 'error') {
    throw new Error(`Expected transport errors to mark server as error, got '${state.status}'.`);
  }
}

async function run() {
  console.log('Starting ProxyManager server error regression tests...');
  await testToolErrorsIncrementServerStatus();
  await testTransportErrorsIncrementServerStatus();
  console.log('ProxyManager server error regression tests passed.');
}

run().catch((error) => {
  console.error('ProxyManager server error regression tests failed:', error);
  process.exit(1);
});
