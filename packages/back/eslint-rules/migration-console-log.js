'use strict'

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure console.log calls with "received data: " + data are guarded by isSilent check in migrations',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      missingGuard: 'console.log with "received data: " + data must be guarded by "if (db.log.isSilent !== true)" check',
    },
  },

  create(context) {
    function isConsoleLogWithReceivedData(node) {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'MemberExpression' ||
        node.callee.object.name !== 'console' ||
        node.callee.property.name !== 'log'
      ) {
        return false
      }

      if (node.arguments.length === 0) {
        return false
      }

      const firstArg = node.arguments[0]
      if (firstArg.type === 'BinaryExpression' && firstArg.operator === '+') {
        const left = firstArg.left
        if (
          left.type === 'Literal' &&
          typeof left.value === 'string' &&
          left.value.includes('received data:')
        ) {
          const right = firstArg.right
          if (right.type === 'Identifier' && right.name === 'data') {
            return true
          }
        }
      }

      if (firstArg.type === 'TemplateLiteral') {
        const quasis = firstArg.quasis
        const expressions = firstArg.expressions
        if (
          quasis.length > 0 &&
          quasis[0].value.raw.includes('received data:') &&
          expressions.length > 0 &&
          expressions[0].type === 'Identifier' &&
          expressions[0].name === 'data'
        ) {
          return true
        }
      }

      return false
    }

    function isGuardedByIsSilentCheck(node) {
      let current = node
      while (current && current.parent) {
        const parent = current.parent
        
        if (parent.type === 'IfStatement') {
          const test = parent.test
          if (
            test.type === 'BinaryExpression' &&
            test.operator === '!==' &&
            test.left.type === 'MemberExpression' &&
            test.left.object.type === 'MemberExpression' &&
            test.left.object.object.type === 'Identifier' &&
            test.left.object.object.name === 'db' &&
            test.left.object.property.type === 'Identifier' &&
            test.left.object.property.name === 'log' &&
            test.left.property.type === 'Identifier' &&
            test.left.property.name === 'isSilent' &&
            test.right.type === 'Literal' &&
            test.right.value === true
          ) {
            const consequent = parent.consequent
            if (consequent === current || (consequent.type === 'BlockStatement' && isNodeInConsequent(current, consequent))) {
              return true
            }
          }
        }
        
        if (parent.type === 'Program') {
          break
        }
        
        current = parent
      }
      return false
    }

    function isNodeInConsequent(node, block) {
      if (block.type !== 'BlockStatement') {
        return false
      }
      let current = node
      while (current && current.parent) {
        if (current.parent === block) {
          return true
        }
        current = current.parent
        if (current.type === 'Program' || current.type === 'IfStatement') {
          break
        }
      }
      return false
    }

    return {
      CallExpression(node) {
        if (isConsoleLogWithReceivedData(node)) {
          if (!isGuardedByIsSilentCheck(node)) {
            context.report({
              node,
              messageId: 'missingGuard',
            })
          }
        }
      },
    }
  },
}

