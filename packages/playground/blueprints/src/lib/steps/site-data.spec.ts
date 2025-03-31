import { PHP } from '@php-wasm/universal';
import { RecommendedPHPVersion } from '@typo3-playground/common';
import {
	getSqliteDatabaseModule,
	getWordPressModule,
} from '@typo3-playground/typo3-builds';
import { setSiteOptions } from './site-data';
import { PHPRequestHandler } from '@php-wasm/universal';
import { bootTYPO3 } from '@typo3-playground/typo3';
import { loadNodeRuntime } from '@php-wasm/node';

describe('Blueprint step setSiteOptions()', () => {
	let php: PHP;
	let handler: PHPRequestHandler;
	beforeEach(async () => {
		handler = await bootTYPO3({
			createPhpRuntime: async () =>
				await loadNodeRuntime(RecommendedPHPVersion),
			siteUrl: 'http://playground-domain/',

			typo3Zip: await getWordPressModule(),
			sqliteIntegrationPluginZip: await getSqliteDatabaseModule(),
		});
		php = await handler.getPrimaryPhp();
	});

	it('should set the site option', async () => {
		await setSiteOptions(php, {
			options: {
				blogname: 'My test site!',
			},
		});
		const response = await php.run({
			code: `<?php
                require '/wordpress/wp-load.php';
                echo get_option('blogname');
			`,
		});
		expect(response.text).toBe('My test site!');
	});
});
