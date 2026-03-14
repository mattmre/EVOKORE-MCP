'use strict';

/**
 * Waits for the EVOKORE server's background proxy bootstrap to complete.
 *
 * After the MCP startup handshake change (async boot), proxied tools are not
 * available immediately after `client.connect()`. This helper watches the
 * server's stderr stream for the "Proxy bootstrap complete" sentinel that is
 * emitted once ALL child servers have been attempted, or the "Background proxy
 * bootstrap failed" sentinel that is emitted if loadServers() itself throws.
 *
 * Usage:
 *   const transport = new StdioClientTransport({ ..., stderr: 'pipe' });
 *   await client.connect(transport);
 *   await waitForProxyBoot(transport);
 *
 * @param {import('@modelcontextprotocol/sdk/client/stdio').StdioClientTransport} transport
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<string>} collected stderr text
 */
function waitForProxyBoot(transport, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for proxy boot. Stderr so far: ' + chunks.join('')));
    }, timeoutMs);

    const onData = (chunk) => {
      chunks.push(String(chunk));
      const text = chunks.join('');
      if (text.includes('Proxy bootstrap complete') || text.includes('Background proxy bootstrap failed')) {
        clearTimeout(timer);
        transport.stderr?.removeListener('data', onData);
        resolve(text);
      }
    };

    transport.stderr?.on('data', onData);
  });
}

module.exports = { waitForProxyBoot };
