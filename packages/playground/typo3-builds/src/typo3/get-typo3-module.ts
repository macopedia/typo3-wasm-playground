import { getTYPO3ModuleDetails } from './get-typo3-module-details';

export async function getTYPO3Module(TYPO3Version?: string): Promise<File> {
	const url = getTYPO3ModuleDetails(TYPO3Version).url;
	let data = null;
	if (url.startsWith('/')) {
		let path = url;
		if (path.startsWith('/@fs/')) {
			path = path.slice(4);
		}

		const { readFile } = await import('node:fs/promises');
		data = await readFile(path);
	} else {
		const response = await fetch(url);
		data = await response.blob();
	}
	return new File([data], `${TYPO3Version || 'typo3'}.zip`, {
		type: 'application/zip',
	});
}
