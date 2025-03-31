/**
 * @typedef {Object} PhpVersion
 * @property {string} version
 * @property {string} loaderFilename
 * @property {string} wasmFilename
 * @property {string} lastRelease
 */

/**
 * @type {PhpVersion[]}
 * @see https://www.php.net/releases/index.php
 */
export const phpVersions = [
	{
		version: '8.2',
		loaderFilename: 'php_8_2.js',
		wasmFilename: 'php_8_2.wasm',
		lastRelease: '8.2.27',
	},
	{
		version: '8.3',
		loaderFilename: 'php_8_3.js',
		wasmFilename: 'php_8_3.wasm',
		lastRelease: '8.3',
	},
	{
		version: '8.4',
		loaderFilename: 'php_8_4.js',
		wasmFilename: 'php_8_4.wasm',
		lastRelease: '8.4',
	},
];
