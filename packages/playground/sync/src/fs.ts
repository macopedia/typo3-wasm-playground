import { FilesystemOperation } from '@php-wasm/fs-journal';
import { PlaygroundClient } from '@typo3-playground/client';

export async function journalFSOperations(
	playground: PlaygroundClient,
	onEntry: (op: FilesystemOperation) => void
) {
	await playground.journalFSEvents(
		'/typo3',
		async (entry: FilesystemOperation) => {
			if (
				entry.path.endsWith('/.ht.sqlite') ||
				entry.path.endsWith('/.ht.sqlite-journal')
			) {
				return;
			}
			onEntry(entry);
		}
	);
}
