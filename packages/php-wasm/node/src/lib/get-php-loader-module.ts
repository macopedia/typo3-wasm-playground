import { LatestSupportedPHPVersion } from '@php-wasm/universal';
import type { PHPLoaderModule, SupportedPHPVersion } from '@php-wasm/universal';
import { jspi } from 'wasm-feature-detect';

export async function getPHPLoaderModule(
	version: SupportedPHPVersion = LatestSupportedPHPVersion
): Promise<PHPLoaderModule> {
	if (await jspi()) {
		switch (version) {
			case '8.4':
				// @ts-ignore
				return await import(`../../jspi/php_8_4.js`);
			case '8.3':
				// @ts-ignore
				return await import(`../../jspi/php_8_3.js`);
			case '8.2':
				// @ts-ignore
				return await import(`../../jspi/php_8_2.js`);
		}
	} else {
		switch (version) {
			case '8.4':
				// @ts-ignore
				return await import(`../../asyncify/php_8_4.js`);
			case '8.3':
				// @ts-ignore
				return await import(`../../asyncify/php_8_3.js`);
			case '8.2':
				// @ts-ignore
				return await import(`../../asyncify/php_8_2.js`);
		}
	}
	throw new Error(`Unsupported PHP version ${version}`);
}
