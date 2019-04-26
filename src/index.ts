import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import { addNamed } from "@babel/helper-module-imports";

/**
 * Catch all identifiers that begin with "use" followed by an uppercase Latin
 * character to exclude identifiers like "user".
 */

function isHookName(s: string) {
  return /^use[A-Z0-9].*$/.test(s);
}

/**
 * We consider hooks to be a hook name identifier or a member expression
 * containing a hook name.
 */

function isHook({ node }: NodePath) {
  if (node.type === 'Identifier') {
    return isHookName(node.name);
  } else if (node.type === 'MemberExpression' && !node.computed && isHook(node.property)) {
    // Only consider React.useFoo() to be namespace hooks for now to avoid false positives.
    // We can expand this check later.
    const obj = node.object;
    return obj.type === 'Identifier' && obj.name === 'React';
  } else {
    return false;
  }
}

function isComponentName(node: t.Node) {
  if (t.isIdentifier(node)) {
    return !/^[a-z]/.test(node.name);
  } else {
    return false;
  }
}

function isComponentOrHook(
  path: NodePath
): path is NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression> {
  const name = getFunctionName(path);
  return (name && isComponentName(name)) || isHook(path);
}

/**
 * Gets the static name of a function AST node. For function declarations it is
 * easy. For anonymous function expressions it is much harder. If you search for
 * `IsAnonymousFunctionDefinition()` in the ECMAScript spec you'll find places
 * where JS gives anonymous function expressions names. We roughly detect the
 * same AST nodes with some exceptions to better fit our usecase.
 */

function getFunctionName(path: NodePath) {
  const { node, parent } = path;
  if (t.isFunctionDeclaration(node) || (t.isFunctionExpression(node) && node.id)) {
    // function useHook() {}
    // const whatever = function useHook() {};
    //
    // Function declaration or function expression names win over any
    // assignment statements or other renames.
    return node.id;
  } else if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
    if (t.isVariableDeclarator(parent) && parent.init === node) {
      // const useHook = () => {};
      return parent.id;
    } else if (t.isAssignmentExpression(parent) && parent.right === node && parent.operator === '=') {
      // useHook = () => {};
      return parent.left;
    } else if (t.isObjectProperty(parent) && parent.value === node && !parent.computed) {
      // {useHook: () => {}}
      // {useHook() {}}
      return parent.key;

      // NOTE: We could also support `ClassProperty` and `MethodDefinition`
      // here to be pedantic. However, hooks in a class are an anti-pattern. So
      // we don't allow it to error early.
      //
      // class {useHook = () => {}}
      // class {useHook() {}}
    } else if (t.isAssignmentPattern(parent) && parent.right === node) {
      // const {useHook = () => {}} = {};
      // ({useHook = () => {}} = {});
      //
      // Kinda clowny, but we'd said we'd follow spec convention for
      // `IsAnonymousFunctionDefinition()` usage.
      return parent.left;
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
}

export default () => {
  function collectDeclarations(path: NodePath) {
    const declarations = new Map();
    if (isComponentOrHook(path)) {
      if (t.isBlockStatement(path.node.body)) {
        path.node.body.body.forEach(node => {
          if (t.isVariableDeclaration(node) && node.kind === 'let') {
            const declaration = node.declarations[0];
            if (t.isIdentifier(declaration.id)) {
              declarations.set(declaration.id.name, node);
            }
          }
        });
        path.traverse({
          VariableDeclaration: transformDeclaration(declarations),
          AssignmentExpression: transformAssignment(declarations, path)
        });
      }
    }
  }

  function transformDeclaration(declarations: Map<string, t.VariableDeclaration>) {
    return (path: NodePath<t.VariableDeclaration>) => {
      const declaration = path.node.declarations[0];
      if (t.isIdentifier(declaration.id) && declarations.get(declaration.id.name)) {
        const hookId = addNamed(path, 'useState', 'react');
        path.replaceWith(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.arrayPattern([t.identifier(declaration.id.name), t.identifier('set' + declaration.id.name)]),
              t.callExpression(hookId, [path.node.declarations[0].init!])
            )
          ])
        );
      }
    };
  }

  function transformAssignment(declarations: Map<string, t.VariableDeclaration>, functionPath: NodePath) {
    return (path: NodePath<t.AssignmentExpression>) => {
      const variable = path.get('left').node;
      if (t.isIdentifier(variable) && functionPath.scope.hasOwnBinding(variable.name) && declarations.get(variable.name)) {
        const updaterName = 'set' + variable.name;
        const stateName = functionPath.scope.generateUidIdentifier('count');
        path.replaceWith(
          t.callExpression(t.identifier(updaterName), [
            t.arrowFunctionExpression(
              [stateName],
              t.assignmentExpression(path.node.operator, stateName, path.get('right').node)
            )
          ])
        );
      }
    };
  }

  return {
    visitor: {
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': collectDeclarations
    }
  };
};
