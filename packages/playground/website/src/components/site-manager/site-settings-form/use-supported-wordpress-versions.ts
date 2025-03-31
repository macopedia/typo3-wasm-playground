import { useState, useEffect } from 'react';
import { usePlaygroundClient } from '../../../lib/use-playground-client';

export function useSupportedWordPressVersions() {
	const [supportedTypo3Versions, setSupportedTypo3Versions] = useState<
		Record<string, string>
	>({});
	const [latestTypo3Version, setLatestTypo3Version] = useState<string | null>(
		null
	);

	const playground = usePlaygroundClient();
	useEffect(() => {
		playground?.getMinifiedTYPO3Versions().then(({ all, latest }) => {
			const formOptions: Record<string, string> = {};
			for (const version of Object.keys(all)) {
				// if (version === 'beta') {
				// 	// Don't show beta versions related to supported major releases
				// 	if (!(all.beta.substring(0, 3) in all)) {
				// 		formOptions[version] = all.beta;
				// 	}
				// } else {
				formOptions[version] = version;
				// }
			}
			setSupportedTypo3Versions(formOptions);
			setLatestTypo3Version(latest);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [!!playground]);

	return {
		supportedTypo3Versions,
		latestTypo3Version,
	};
}
