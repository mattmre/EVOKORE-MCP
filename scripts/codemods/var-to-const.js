/**
 * jscodeshift codemod: var → const/let
 * Usage: npx jscodeshift -t scripts/codemods/var-to-const.js <path>
 *
 * Rules:
 * - var with no reassignment in scope → const
 * - var with reassignment → let
 */
module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  root.find(j.VariableDeclaration, { kind: 'var' }).forEach(path => {
    const decl = path.node;
    // Determine if any declarator's id is reassigned in its scope
    const hasReassignment = decl.declarators.some(declarator => {
      if (declarator.id.type !== 'Identifier') return true; // destructuring — use let
      const name = declarator.id.name;
      let reassigned = false;
      j(path.parent).find(j.AssignmentExpression).forEach(assignPath => {
        const left = assignPath.node.left;
        if (left.type === 'Identifier' && left.name === name) {
          reassigned = true;
        }
      });
      j(path.parent).find(j.UpdateExpression).forEach(upPath => {
        const arg = upPath.node.argument;
        if (arg.type === 'Identifier' && arg.name === name) {
          reassigned = true;
        }
      });
      return reassigned;
    });
    decl.kind = hasReassignment ? 'let' : 'const';
  });

  return root.toSource();
};
