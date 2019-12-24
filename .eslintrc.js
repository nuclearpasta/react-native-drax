module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
		'react',
		'react-native',
		'react-hooks',
	],
	extends: [
		'plugin:react/recommended',
		'plugin:react-native/all',
		'airbnb-typescript',
	],
	env: {
		es6: true,
		jest: true,
		'react-native/react-native': true,
	},
	settings: {
		react: {
			version: 'detect',
		},
	},
	globals: {
		HermesInternal: 'readonly',
	},
	rules: {
		'no-tabs': 0,
		'@typescript-eslint/no-use-before-define': [2, { variables: false }],
		'no-shadow': 0,
		'arrow-body-style': 0,
		'arrow-parens': [2, 'always'],
		'no-console': 0,
		'no-param-reassign': [2, { props: false }],
		'max-len': [2, {
			code: 120,
			tabWidth: 4,
			ignoreComments: true,
			ignoreUrls: true,
			ignoreStrings: true,
			ignoreTemplateLiterals: true,
			ignoreRegExpLiterals: true,
		}],
		'@typescript-eslint/indent': [2, 'tab', { SwitchCase: 1 }],
		'import/no-unresolved': 0, // ts already provides errors for this and updates more quickly in VSCode
		'import/prefer-default-export': 0,
		'import/no-extraneous-dependencies': [2, { devDependencies: true }], // allows import of type def libs
		'react/destructuring-assignment': 0,
		'react/jsx-indent': [2, 'tab'],
		'react/jsx-indent-props': [2, 'tab'],
		'react/jsx-props-no-spreading': 0,
		'react/no-unused-state': 0,
		'react/prop-types': 0,
		'react/sort-comp': 0,
		'react-native/sort-styles': 0,
		'react-native/no-color-literals': 0,
		'react-hooks/rules-of-hooks': 2,
		'react-hooks/exhaustive-deps': 1,
	},
};
