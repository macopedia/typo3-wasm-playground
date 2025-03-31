import {
	MinifiedTYPO3Versions,
	getSqliteDatabaseModule,
	getTYPO3Module,
} from '@typo3-playground/typo3-builds';
import { RecommendedPHPVersion } from '@typo3-playground/common';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ignore circular package dep so @php-wasm/node can test with the WP file-not-found callback
import { loadNodeRuntime } from '@php-wasm/node';
import { bootTYPO3 } from '../boot';
import {
	getLoadedTYPO3Version,
	versionStringToLoadedTYPO3Version,
} from '../version-detect';

describe('Test WP version detection', async () => {
	for (const expectedTypo3Version of Object.keys(MinifiedTYPO3Versions)) {
		it(`detects WP ${expectedTypo3Version} at runtime`, async () => {
			const handler = await bootTYPO3({
				createPhpRuntime: async () =>
					await loadNodeRuntime(RecommendedPHPVersion),
				siteUrl: 'http://playground-domain/',
				typo3Zip: await getTYPO3Module(expectedTypo3Version),
				sqliteIntegrationPluginZip: await getSqliteDatabaseModule(),
			});
			const loadedTYPO3Version = await getLoadedTYPO3Version(handler);
			expect(loadedTYPO3Version).to.equal(expectedTypo3Version);
		});
	}

	it('errors when unable to read version at runtime', async () => {
		const handler = await bootTYPO3({
			createPhpRuntime: async () =>
				await loadNodeRuntime(RecommendedPHPVersion),
			siteUrl: 'http://playground-domain/',
			typo3Zip: await getTYPO3Module(),
			sqliteIntegrationPluginZip: await getSqliteDatabaseModule(),
		});
		const php = await handler.getPrimaryPhp();

		php.unlink(`${handler.documentRoot}/wp-includes/version.php`);
		const detectionResult = await getLoadedTYPO3Version(handler).then(
			() => 'no-error',
			() => 'error'
		);
		expect(detectionResult).to.equal('error');
	});

	it('errors on reading empty version at runtime', async () => {
		const handler = await bootTYPO3({
			createPhpRuntime: async () =>
				await loadNodeRuntime(RecommendedPHPVersion),
			siteUrl: 'http://playground-domain/',
			typo3Zip: await getTYPO3Module(),
			sqliteIntegrationPluginZip: await getSqliteDatabaseModule(),
		});
		const php = await handler.getPrimaryPhp();

		php.writeFile(
			`${handler.documentRoot}/wp-includes/version.php`,
			'<?php $wp_version = "";'
		);

		const detectionResult = await getLoadedTYPO3Version(handler).then(
			() => 'no-error',
			() => 'error'
		);
		expect(detectionResult).to.equal('error');
	});

	const versionMap = {
		'6.5': '6.5',
		'6.5.4': '6.5',
		'6.6-RC': 'beta',
		'6.6-RC2': 'beta',
		'13.4': '13.4.4',
		'custom-version': 'custom-version',
	};

	for (const [input, expected] of Object.entries(versionMap)) {
		it(`maps '${input}' to '${expected}'`, () => {
			const result = versionStringToLoadedTYPO3Version(input);
			expect(result).to.equal(expected);
		});
	}
});
