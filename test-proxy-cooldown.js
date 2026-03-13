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

  return { security, proxy };
}

async function testCooldownAppliesToSameToolAndSameArgs() {
  let callCount = 0;
  const { proxy } = createProxy(async () => {
    callCount++;
    return {
      content: [{ type: 'text', text: 'OK' }],
      isError: false
    };
  });

  const first = await proxy.callProxiedTool('mock_tool', { b: 2, a: 1 });
  if (first.content[0].text !== 'OK') {
    throw new Error('Expected first proxied call to succeed.');
  }

  const second = await proxy.callProxiedTool('mock_tool', { a: 1, b: 2 });
  if (!second.isError || !second.content[0].text.includes('COOLDOWN')) {
    throw new Error(`Expected same tool + normalized args to hit cooldown, got ${JSON.stringify(second)}.`);
  }
  if (callCount !== 1) {
    throw new Error(`Expected cooldown to prevent second upstream call, got ${callCount} client calls.`);
  }
}

async function testCooldownDoesNotBleedAcrossDifferentArgs() {
  let callCount = 0;
  const { proxy } = createProxy(async ({ arguments: args }) => {
    callCount++;
    return {
      content: [{ type: 'text', text: `short:${args.query}` }],
      isError: false
    };
  });

  const first = await proxy.callProxiedTool('mock_tool', { query: 'alpha' });
  if (first.content[0].text !== 'short:alpha') {
    throw new Error('Expected first distinct-args call to succeed.');
  }

  const second = await proxy.callProxiedTool('mock_tool', { query: 'beta' });
  if (second.isError) {
    throw new Error(`Expected different args to bypass cooldown bleed, got ${JSON.stringify(second)}.`);
  }
  if (callCount !== 2) {
    throw new Error(`Expected different args to reach upstream twice, got ${callCount} calls.`);
  }
}

async function testApprovalPromptWinsOverCooldown() {
  let callCount = 0;
  const { security, proxy } = createProxy(async () => {
    callCount++;
    return {
      content: [{ type: 'text', text: 'OK' }],
      isError: false
    };
  });

  await proxy.callProxiedTool('mock_tool', { path: '/tmp/demo' });
  security.checkPermission = () => 'require_approval';

  const intercepted = await proxy.callProxiedTool('mock_tool', { path: '/tmp/demo' });
  if (!intercepted.isError || !intercepted.content[0].text.includes('ACTION REQUIRES HUMAN APPROVAL')) {
    throw new Error(`Expected approval prompt to win over cooldown, got ${JSON.stringify(intercepted)}.`);
  }
  if (intercepted.content[0].text.includes('COOLDOWN')) {
    throw new Error('Expected approval prompt instead of cooldown response.');
  }
  if (callCount !== 1) {
    throw new Error(`Expected approval interceptor to block second upstream call, got ${callCount} calls.`);
  }
}

async function testApprovalTokenSurvivesCooldownBlock() {
  let callCount = 0;
  const { security, proxy } = createProxy(async () => {
    callCount++;
    return {
      content: [{ type: 'text', text: 'OK' }],
      isError: false
    };
  });

  await proxy.callProxiedTool('mock_tool', { path: '/tmp/secure' });
  security.checkPermission = () => 'require_approval';
  const token = security.generateToken('mock_tool', { path: '/tmp/secure' });

  const cooled = await proxy.callProxiedTool('mock_tool', {
    path: '/tmp/secure',
    _evokore_approval_token: token
  });
  if (!cooled.isError || !cooled.content[0].text.includes('COOLDOWN')) {
    throw new Error(`Expected cooldown to block approved call locally, got ${JSON.stringify(cooled)}.`);
  }

  proxy.toolCooldowns.clear();
  const retried = await proxy.callProxiedTool('mock_tool', {
    path: '/tmp/secure',
    _evokore_approval_token: token
  });
  if (retried.isError) {
    throw new Error(`Expected token to remain valid after local cooldown block, got ${JSON.stringify(retried)}.`);
  }
  if (callCount !== 2) {
    throw new Error(`Expected token-backed retry to reach upstream after cooldown clears, got ${callCount} calls.`);
  }
}

async function testErrorAndExceptionResponsesStillTriggerCooldown() {
  const { proxy: errorProxy } = createProxy(async () => ({
    content: [{ type: 'text', text: 'Some long error message...' }],
    isError: true
  }));

  await errorProxy.callProxiedTool('mock_tool', { mode: 'error' });
  const cooledError = await errorProxy.callProxiedTool('mock_tool', { mode: 'error' });
  if (!cooledError.isError || !cooledError.content[0].text.includes('COOLDOWN')) {
    throw new Error('Expected error result to trigger cooldown for matching args.');
  }

  const { proxy: throwProxy } = createProxy(async () => {
    throw new Error('Simulated transport error');
  });

  try {
    await throwProxy.callProxiedTool('mock_tool', { mode: 'throw' });
    throw new Error('Expected transport error to throw.');
  } catch (error) {
    if (!String(error && error.message).includes('Simulated transport error')) {
      throw error;
    }
  }

  const cooledThrow = await throwProxy.callProxiedTool('mock_tool', { mode: 'throw' });
  if (!cooledThrow.isError || !cooledThrow.content[0].text.includes('COOLDOWN')) {
    throw new Error('Expected thrown exception to trigger cooldown for matching args.');
  }
}

test('ProxyManager cooldown regression', async () => {
  await testCooldownAppliesToSameToolAndSameArgs();
  await testCooldownDoesNotBleedAcrossDifferentArgs();
  await testApprovalPromptWinsOverCooldown();
  await testApprovalTokenSurvivesCooldownBlock();
  await testErrorAndExceptionResponsesStillTriggerCooldown();
});
