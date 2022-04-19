module.exports = {
  rules: {
    'use-square-svelte-stores': {
      meta: { fixable: 'code' },
      create(context) {
        return {
          ImportDeclaration(node) {
            const { source } = node;
            if (source.value !== 'svelte/store') {
              return;
            }
            context.report({
              node,
              message: 'Import stores from @square/svelte-store',
              fix: (fixer) => {
                return fixer.replaceText(source, "'@square/svelte-store'");
              },
            });
          },
        };
      },
    },
  },
};
