import type { RewriteRule } from '@php-wasm/universal';

/**
 * The default rewrite rules for TYPO3.
 */
export const TYPO3RewriteRules: RewriteRule[] = [
	{
		match: /^\/typo3\/install(.*)$/,
		replacement: '/typo3/install.php',
	},
	{
		match: /^\/typo3\/(.*)$/,
		replacement: '/typo3/index.php',
	},
];
