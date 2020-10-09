module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: [
			'./tsconfig.json',
		],
		ecmaFeatures: {
			jsx: true,
		},
	},
	plugins: [
		'@typescript-eslint',
		'react',
		'react-native',
		'react-hooks',
	],
	extends: [
		// 'plugin:@typescript-eslint/recommended', <-- consider this when time permits
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
	rules: {
		'no-undef': 0, // TS handles this; https://github.com/eslint/eslint/issues/13699#issuecomment-694223066
		'no-tabs': 0,
		'no-shadow': 0,
		'arrow-body-style': 0,
		'arrow-parens': [2, 'always'],
		'no-console': 0,
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
		'@typescript-eslint/no-use-before-define': [2, { variables: false }],
		'import/no-unresolved': 0, // ts already provides errors for this and updates more quickly in VSCode
		'import/prefer-default-export': 0,
		'import/no-extraneous-dependencies': [2, { devDependencies: true }], // allows import of type def libs
		'react/destructuring-assignment': 0,
		'react/jsx-props-no-spreading': 0,
		'react/jsx-indent': [2, 'tab'],
		'react/jsx-indent-props': [2, 'tab'],
		'react/jsx-one-expression-per-line': 0,
		'react/no-unused-state': 0,
		'react/prop-types': 0,
		'react/require-default-props': 0,
		'react/no-unused-prop-types': 0,
		'react/sort-comp': 0,
		'react/state-in-constructor': 0,
		'react-native/sort-styles': 0,
		'react-native/no-color-literals': 0,
		'react-hooks/rules-of-hooks': 2,
		'react-hooks/exhaustive-deps': 1,
		'@typescript-eslint/comma-dangle': [2, "always-multiline"],
	},
	ignorePatterns: [
		'.eslintrc.js',
	],
};
