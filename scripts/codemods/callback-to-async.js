/**
 * jscodeshift codemod: Node.js fs callback APIs → async/await
 * Usage: npx jscodeshift -t scripts/codemods/callback-to-async.js <path>
 *
 * Targets:
 * - fs.readFile(path, [opts,] cb) → await fs.promises.readFile(path, [opts])
 * - fs.writeFile(path, data, [opts,] cb) → await fs.promises.writeFile(path, data, [opts])
 *
 * NOTE: Only transforms these two well-known patterns. Wraps enclosing function as async.
 */
module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;

  const FS_METHODS = {
    readFile: { promisesMethod: 'readFile', argCount: 1 },
    writeFile: { promisesMethod: 'writeFile', argCount: 2 },
  };

  root.find(j.CallExpression, {
    callee: {
      type: 'MemberExpression',
      object: { name: 'fs' },
    }
  }).forEach(path => {
    const callee = path.node.callee;
    const methodName = callee.property.name;
    if (!FS_METHODS[methodName]) return;

    const args = path.node.arguments;
    const expectedArgCount = FS_METHODS[methodName].argCount;
    // Last arg must be a function (the callback)
    if (args.length < expectedArgCount + 1) return;
    const lastArg = args[args.length - 1];
    if (lastArg.type !== 'ArrowFunctionExpression' && lastArg.type !== 'FunctionExpression') return;

    // Build: await fs.promises.readFile(nonCallbackArgs...)
    const nonCallbackArgs = args.slice(0, args.length - 1);
    const awaitExpr = j.awaitExpression(
      j.callExpression(
        j.memberExpression(
          j.memberExpression(j.identifier('fs'), j.identifier('promises')),
          j.identifier(methodName)
        ),
        nonCallbackArgs
      )
    );

    // Replace the call site with the await expression
    // NOTE: we only transform if the parent is an ExpressionStatement (simple call, not chained)
    if (path.parent.node.type === 'ExpressionStatement') {
      j(path).replaceWith(awaitExpr);
      // Mark enclosing function as async
      let enclosing = path.parent;
      while (enclosing) {
        const n = enclosing.node;
        if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
          n.async = true;
          break;
        }
        enclosing = enclosing.parent;
      }
      changed = true;
    }
  });

  return changed ? root.toSource() : file.source;
};
