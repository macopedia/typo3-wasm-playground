import { applyRewriteRules } from '@php-wasm/universal';
import { typo3RewriteRules } from '../rewrite-rules';

describe('Test WordPress rewrites', () => {
	it('Should return root folder PHP file', async () => {
		expect(applyRewriteRules('/index.php', typo3RewriteRules)).toBe(
			'/index.php'
		);
	});

	it('Should keep query string', async () => {
		expect(
			applyRewriteRules('/index.php?test=1', typo3RewriteRules)
		).toBe('/index.php?test=1');
	});

	it('Should return subfolder PHP file', async () => {
		expect(
			applyRewriteRules('/wp-admin/index.php', typo3RewriteRules)
		).toBe('/wp-admin/index.php');
	});

	it('Should strip multisite prefix from path', async () => {
		expect(
			applyRewriteRules('/test/wp-admin/index.php', typo3RewriteRules)
		).toBe('/wp-admin/index.php');
	});

	it('Should strip multisite prefix from asset path', async () => {
		expect(
			applyRewriteRules(
				'/test/wp-content/themes/twentytwentyfour/assets/images/windows.webp',
				typo3RewriteRules
			)
		).toBe(
			'/wp-content/themes/twentytwentyfour/assets/images/windows.webp'
		);
	});

	it('Should strip multisite prefix and scope', async () => {
		expect(
			applyRewriteRules(
				'/scope:0.1/test/wp-content/themes/twentytwentyfour/assets/images/windows.webp',
				typo3RewriteRules
			)
		).toBe(
			'/wp-content/themes/twentytwentyfour/assets/images/windows.webp'
		);
	});
});
