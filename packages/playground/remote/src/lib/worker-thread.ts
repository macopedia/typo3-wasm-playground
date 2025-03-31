import {
	GeneratedCertificate,
	TCPOverFetchOptions,
	MountDevice,
	SyncProgressCallback,
	createDirectoryHandleMountHandler,
	exposeAPI,
	loadWebRuntime,
} from '@php-wasm/web';
import { setURLScope } from '@php-wasm/scopes';
import { joinPaths } from '@php-wasm/util';
import { typo3SiteUrl } from './config';
import {
	getTYPO3ModuleDetails,
	LatestMinifiedTYPO3Version,
	MinifiedTYPO3Versions,
	sqliteDatabaseIntegrationModuleDetails,
	MinifiedTYPO3VersionsList,
} from '@typo3-playground/typo3-builds';
import { directoryHandleFromMountDevice } from '@typo3-playground/storage';
import { randomString } from '@php-wasm/util';
import {
	spawnHandlerFactory,
	backfillStaticFilesRemovedFromMinifiedBuild,
	hasCachedStaticFilesRemovedFromMinifiedBuild,
} from './worker-utils';
import { EmscriptenDownloadMonitor } from '@php-wasm/progress';
import { createMemoizedFetch } from '@typo3-playground/common';
import {
	FilesystemOperation,
	journalFSEvents,
	replayFSJournal,
} from '@php-wasm/fs-journal';
/* @ts-ignore */
import transportFetch from './playground-mu-plugin/playground-includes/wp_http_fetch.php?raw';
/* @ts-ignore */
import transportDummy from './playground-mu-plugin/playground-includes/wp_http_dummy.php?raw';
/* @ts-ignore */
import playgroundWebMuPlugin from './playground-mu-plugin/0-playground.php?raw';
import {
	PHPResponse,
	PHPWorker,
	SupportedPHPVersion,
	SupportedPHPVersionsList,
} from '@php-wasm/universal';
import {
	bootTYPO3,
	getFileNotFoundActionForTYPO3,
	getLoadedTYPO3Version,
} from '@typo3-playground/typo3';
import { t3VersionToStaticAssetsDirectory } from '@typo3-playground/typo3-builds';
import { logger } from '@php-wasm/logger';
import { generateCertificate, certificateToPEM } from '@php-wasm/web';

// post message to parent
self.postMessage('worker-script-started');

const downloadMonitor = new EmscriptenDownloadMonitor();

const monitoredFetch = (input: RequestInfo | URL, init?: RequestInit) =>
	downloadMonitor.monitorFetch(fetch(input, init));
const memoizedFetch = createMemoizedFetch(monitoredFetch);

export interface MountDescriptor {
	mountpoint: string;
	device: MountDevice;
	initialSyncDirection: 'opfs-to-memfs' | 'memfs-to-opfs';
}

export type WorkerBootOptions = {
	t3Version?: string;
	phpVersion?: SupportedPHPVersion;
	sapiName?: string;
	scope: string;
	withNetworking: boolean;
	mounts?: Array<MountDescriptor>;
	shouldInstallTypo3?: boolean;
	corsProxyUrl?: string;
};

/** @inheritDoc PHPClient */
export class PlaygroundWorkerEndpoint extends PHPWorker {
	booted = false;

	/**
	 * A string representing the scope of the Playground instance.
	 */
	scope: string | undefined;

	/**
	 * A string representing the requested version of WordPress.
	 */
	requestedTypo3Version: string | undefined;

	/**
	 * A string representing the version of WordPress that was loaded.
	 */
	loadedTypo3Version: string | undefined;

	unmounts: Record<string, () => any> = {};

	constructor(monitor: EmscriptenDownloadMonitor) {
		super(undefined, monitor);
	}

	/**
	 * @returns WordPress module details, including the static assets directory and default theme.
	 */
	async getTYPO3ModuleDetails() {
		return {
			majorVersion: this.loadedTypo3Version || this.requestedTypo3Version,
			staticAssetsDirectory: this.loadedTypo3Version
				? t3VersionToStaticAssetsDirectory(this.loadedTypo3Version)
				: undefined,
		};
	}

	async getMinifiedTYPO3Versions() {
		return {
			all: MinifiedTYPO3Versions,
			latest: LatestMinifiedTYPO3Version,
		};
	}

	async hasOpfsMount(mountpoint: string) {
		return mountpoint in this.unmounts;
	}

	async mountOpfs(
		options: MountDescriptor,
		onProgress?: SyncProgressCallback
	) {
		const handle = await directoryHandleFromMountDevice(options.device);
		const php = this.__internal_getPHP()!;
		this.unmounts[options.mountpoint] = await php.mount(
			options.mountpoint,
			createDirectoryHandleMountHandler(handle, {
				initialSync: {
					onProgress,
					direction: options.initialSyncDirection,
				},
			})
		);
	}

	async unmountOpfs(mountpoint: string) {
		this.unmounts[mountpoint]();
		delete this.unmounts[mountpoint];
	}

	async backfillStaticFilesRemovedFromMinifiedBuild() {
		await backfillStaticFilesRemovedFromMinifiedBuild(
			this.__internal_getPHP()!
		);
	}

	async hasCachedStaticFilesRemovedFromMinifiedBuild() {
		return await hasCachedStaticFilesRemovedFromMinifiedBuild(
			this.__internal_getPHP()!
		);
	}

	async boot({
		scope,
		mounts = [],
		t3Version = LatestMinifiedTYPO3Version,
		phpVersion = '8.2',
		sapiName = 'cli',
		withNetworking = false,
		shouldInstallTypo3 = true,
		corsProxyUrl,
	}: WorkerBootOptions) {
		if (this.booted) {
			throw new Error('Playground already booted');
		}

		this.booted = true;
		this.scope = scope;
		this.requestedTypo3Version = t3Version;

		t3Version = MinifiedTYPO3VersionsList.includes(t3Version)
			? t3Version
			: LatestMinifiedTYPO3Version;

		if (!SupportedPHPVersionsList.includes(phpVersion)) {
			throw new Error(
				`Unsupported PHP version: ${phpVersion}. Supported versions: ${SupportedPHPVersionsList.join(
					', '
				)}`
			);
		}

		try {
			// Start downloading WordPress if needed
			let typo3Request = null;
			if (shouldInstallTypo3) {
				// @TODO: Accept a WordPress ZIP file or a URL, do not
				//        reason about the `requestedWPVersion` here.
				if (this.requestedTypo3Version.startsWith('http')) {
					// We don't know the size upfront, but we can still monitor the download.
					// monitorFetch will read the content-length response header when available.
					typo3Request = monitoredFetch(this.requestedTypo3Version);
				} else {
					const t3Details = getTYPO3ModuleDetails(t3Version);
					downloadMonitor.expectAssets({
						[t3Details.url]: t3Details.size,
					});
					typo3Request = monitoredFetch(t3Details.url);
				}
			}

			downloadMonitor.expectAssets({
				[sqliteDatabaseIntegrationModuleDetails.url]:
					sqliteDatabaseIntegrationModuleDetails.size,
			});
			const sqliteIntegrationRequest = downloadMonitor.monitorFetch(
				fetch(sqliteDatabaseIntegrationModuleDetails.url)
			);

			const constants: Record<string, any> = shouldInstallTypo3
				? {
						TYPO3_CONTEXT: 'Development/Wasm',
						AUTH_KEY: randomString(40),
						SECURE_AUTH_KEY: randomString(40),
						LOGGED_IN_KEY: randomString(40),
						NONCE_KEY: randomString(40),
						AUTH_SALT: randomString(40),
						SECURE_AUTH_SALT: randomString(40),
						LOGGED_IN_SALT: randomString(40),
						NONCE_SALT: randomString(40),
				  }
				: {};

			// eslint-disable-next-line @typescript-eslint/no-this-alias
			const endpoint = this;
			const knownRemoteAssetPaths = new Set<string>();
			const phpIniEntries: Record<string, string> = {
				'openssl.cafile': '/internal/ca-bundle.crt',
			};
			let CAroot: false | GeneratedCertificate = false;
			let tcpOverFetch: TCPOverFetchOptions | undefined = undefined;
			if (withNetworking) {
				/**
				 * Generate a self-signed CA certificate and tell PHP to trust it.
				 * This enables rewriting raw encrypted bytes emitted by PHP
				 * during HTTPS connections into fetch() calls.
				 *
				 * See https://github.com/WordPress/wordpress-playground/pull/1926.
				 */
				CAroot = await generateCertificate({
					subject: {
						commonName: 'Typo3PlaygroundCA',
						organizationName: 'Typo3PlaygroundCA',
						countryName: 'US',
					},
					basicConstraints: {
						ca: true,
					},
				});
				tcpOverFetch = {
					CAroot,
					corsProxyUrl,
				};
			} else {
				phpIniEntries['allow_url_fopen'] = '0';
				// Calling curl_exec() with networking disabled causes PHP to
				// enter an infinite loop. Let's disable it completely to
				// throw a fatal error instead.
				phpIniEntries['disable_functions'] =
					'curl_exec,curl_multi_exec';
			}
			const requestHandler = await bootTYPO3({
				siteUrl: setURLScope(typo3SiteUrl, scope).toString(),
				createPhpRuntime: async () => {
					let wasmUrl = '';
					return await loadWebRuntime(phpVersion, {
						tcpOverFetch,
						emscriptenOptions: {
							instantiateWasm(imports, receiveInstance) {
								// Using .then because Emscripten typically returns an empty
								// object here and not a promise.
								memoizedFetch(wasmUrl, {
									credentials: 'same-origin',
								})
									.then((response) =>
										WebAssembly.instantiateStreaming(
											response,
											imports
										)
									)
									.then((wasm) => {
										receiveInstance(
											wasm.instance,
											wasm.module
										);
									});
								return {};
							},
						},
						onPhpLoaderModuleLoaded: (phpLoaderModule) => {
							wasmUrl = phpLoaderModule.dependencyFilename;
							downloadMonitor.expectAssets({
								[wasmUrl]:
									phpLoaderModule.dependenciesTotalSize,
							});
						},
					});
				},
				// Do not await the WordPress download or the sqlite integration download.
				// Let bootTYPO3 start the PHP runtime download first, and then await
				// all the ZIP files right before they're used.
				typo3Zip: shouldInstallTypo3
					? typo3Request!
							.then((r) => r.blob())
							.then((b) => new File([b], 'typo3.zip'))
					: undefined,
				sqliteIntegrationPluginZip: sqliteIntegrationRequest
					.then((r) => r.blob())
					.then((b) => new File([b], 'sqlite.zip')),
				spawnHandler: spawnHandlerFactory,
				sapiName,
				constants,
				hooks: {
					async beforeTYPO3Files(php) {
						for (const mount of mounts) {
							const handle = await directoryHandleFromMountDevice(
								mount.device
							);
							const unmount = await php.mount(
								mount.mountpoint,
								createDirectoryHandleMountHandler(handle, {
									initialSync: {
										direction: mount.initialSyncDirection,
									},
								})
							);
							endpoint.unmounts[mount.mountpoint] = unmount;
						}
					},
				},
				phpIniEntries,
				createFiles: {
					'/internal/ca-bundle.crt': CAroot
						? certificateToPEM(CAroot.certificate)
						: '',
					'/internal/shared/mu-plugins': {
						'1-playground-web.php': playgroundWebMuPlugin,
						'playground-includes': {
							'wp_http_dummy.php': transportDummy,
							'wp_http_fetch.php': transportFetch,
						},
					},
				},
				getFileNotFoundAction(relativeUri: string) {
					if (!knownRemoteAssetPaths.has(relativeUri)) {
						return getFileNotFoundActionForTYPO3(relativeUri);
					}

					// This path is listed as a remote asset. Mark it as a static file
					// so the service worker knows it can issue a real fetch() to the server.
					return {
						type: 'response',
						response: new PHPResponse(
							404,
							{
								'x-backfill-from': ['remote-host'],
								// Include x-file-type header so remote asset
								// retrieval continues to work for clients
								// running a prior service worker version.
								'x-file-type': ['static'],
							},
							new TextEncoder().encode('404 File not found')
						),
					};
				},
			});
			this.__internal_setRequestHandler(requestHandler);

			const primaryPhp = await requestHandler.getPrimaryPhp();
			await this.setPrimaryPHP(primaryPhp);

			// NOTE: We need to derive the loaded TYPO3 version or we might assume TYPO3 loaded
			// from browser storage is the default version when it is actually something else.
			// Assuming an incorrect TYPO3 version would break remote asset retrieval for minified
			// WP builds – we would download the wrong assets pack.
			this.loadedTypo3Version = await getLoadedTYPO3Version(
				requestHandler
			);
			if (this.requestedTypo3Version !== this.loadedTypo3Version) {
				logger.warn(
					`Loaded TYPO3 version (${this.loadedTypo3Version}) differs ` +
						`from requested version (${this.requestedTypo3Version}).`
				);
			}

			const t3StaticAssetsDir = t3VersionToStaticAssetsDirectory(
				this.loadedTypo3Version
			);
			const remoteAssetListPath = joinPaths(
				requestHandler.documentRoot,
				'typo3-remote-asset-paths'
			);
			if (
				t3StaticAssetsDir !== undefined &&
				!primaryPhp.fileExists(remoteAssetListPath)
			) {
				// The loaded TYPO3 release has a remote static assets dir
				// but no remote asset listing, so we need to backfill the listing.
				const listUrl = new URL(
					joinPaths(t3StaticAssetsDir, 'typo3-remote-asset-paths'),
					typo3SiteUrl
				);
				try {
					const remoteAssetPaths = await fetch(listUrl).then((res) =>
						res.text()
					);
					primaryPhp.writeFile(remoteAssetListPath, remoteAssetPaths);
				} catch (e) {
					logger.warn(
						`Failed to fetch remote asset paths from ${listUrl}`
					);
				}
			}

			if (primaryPhp.isFile(remoteAssetListPath)) {
				const remoteAssetPaths = primaryPhp
					.readFileAsText(remoteAssetListPath)
					.split('\n');
				remoteAssetPaths.forEach((wpRelativePath) =>
					knownRemoteAssetPaths.add(joinPaths('/', wpRelativePath))
				);
			}

			setApiReady();
		} catch (e) {
			setAPIError(e as Error);
			throw e;
		}
	}

	// These methods are only here for the time traveling Playground demo.
	// Let's consider removing them in the future.

	async journalFSEvents(
		root: string,
		callback: (op: FilesystemOperation) => void
	) {
		return journalFSEvents(this.__internal_getPHP()!, root, callback);
	}

	async replayFSJournal(events: FilesystemOperation[]) {
		return replayFSJournal(this.__internal_getPHP()!, events);
	}
}

const [setApiReady, setAPIError] = exposeAPI(
	new PlaygroundWorkerEndpoint(downloadMonitor)
);
