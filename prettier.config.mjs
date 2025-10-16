export default {
	bracketSpacing: false,
	singleQuote: true,
	bracketSameLine: true,
	trailingComma: 'es5',
	printWidth: 80,
	arrowParens: 'avoid',
	overrides: [
		{
			files: ['*.code-workspace'],
			options: {
				parser: 'json-stringify',
			},
		},
		{
			files: ['*.ts', '*.tsx'],
			options: {
				trailingComma: 'all',
			},
		},
	],
};
