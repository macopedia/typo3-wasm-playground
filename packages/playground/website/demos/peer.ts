import { startPlaygroundWeb } from '@typo3-playground/client';
import { login } from '@typo3-playground/blueprints';
import {
	setupPlaygroundSync,
	ParentWindowTransport,
	loggerMiddleware,
} from '@typo3-playground/sync';
import { getRemoteUrl } from '../src/lib/config';

export async function runDemo(
	iframe: HTMLIFrameElement,
	clientId: string,
	autoincrementOffset: number
) {
	const playground = await startPlaygroundWeb({
		iframe,
		remoteUrl: getRemoteUrl().toString(),
	});
	const siteURL = await playground.absoluteUrl;
	console.log({ clientId, siteURL });
	await setupPlaygroundSync(playground, {
		autoincrementOffset,
		transport: new ParentWindowTransport(),
		middlewares: [loggerMiddleware(clientId)],
	});

	await login(playground, { username: 'admin', password: 'password' });
	await playground.goTo('/');
}
