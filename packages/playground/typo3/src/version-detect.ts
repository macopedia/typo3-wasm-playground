import type { PHPRequestHandler } from '@php-wasm/universal';

export async function getLoadedTYPO3Version(
	requestHandler: PHPRequestHandler
): Promise<string> {
	const php = await requestHandler.getPrimaryPhp();
	const result = await php.run({
		code: `<?php
		 echo require '${requestHandler.documentRoot}/typo3/version.php';
		`,
	});

	const versionString = result.text;
	if (!versionString) {
		throw new Error('Unable to read loaded TYPO3 version.');
	}
	return versionStringToLoadedTYPO3Version(versionString);
}

/**
 * Returns a TYPO3 build version string, for a given TYPO3 version string.
 *
 * You can find the full list of supported build version strings in
 *
 * Release candidates (RC) and beta releases are converted to "beta".
 *
 * Nightly releases are converted to "nightly".
 *
 * @param typo3VersionString - A TYPO3 version string.
 * @returns A Playground TYPO3 build version.
 */
export function versionStringToLoadedTYPO3Version(
	typo3VersionString: string
): string {
	const majorMinorMatch = typo3VersionString.match(/^(\d+\.\d+)(?:\.\d+)?$/);
	if (majorMinorMatch !== null) {
		return majorMinorMatch[1];
	}

	// Return original version string if we could not parse it.
	// This is important to allow so folks can bring their own WP builds.
	return typo3VersionString;
}
