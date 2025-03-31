import {
	FileNotFoundAction,
	FileNotFoundGetActionCallback,
	FileTree,
	PHP,
	PHPProcessManager,
	PHPRequestHandler,
	SpawnHandler,
	proxyFileSystem,
	rotatePHPRuntime,
	setPhpIniEntries,
	withPHPIniValues,
	writeFiles,
} from '@php-wasm/universal';
import {
	preloadPhpInfoRoute,
	setupPlatformLevelMuPlugins,
	preloadSqliteIntegration,
	unzipTYPO3,
	TYPO3RewriteRules,
} from '.';
import { joinPaths } from '@php-wasm/util';
import { logger } from '@php-wasm/logger';

export type PhpIniOptions = Record<string, string>;
export type Hook = (php: PHP) => void | Promise<void>;

export interface Hooks {
	beforeTYPO3Files?: Hook;
	beforeDatabaseSetup?: Hook;
}

export type DatabaseType = 'sqlite' | 'mysql' | 'custom';

export interface BootOptions {
	createPhpRuntime: () => Promise<number>;
	/**
	 * Mounting and Copying is handled via hooks for starters.
	 *
	 * In the future we could standardize the
	 * browser-specific and node-specific mounts
	 * in the future.
	 */
	hooks?: Hooks;
	/**
	 * PHP SAPI name to be returned by get_sapi_name(). Overriding
	 * it is useful for running programs that check for this value,
	 * e.g. WP-CLI
	 */
	sapiName?: string;
	/**
	 * URL to use as the site URL. This is used to set the WP_HOME
	 * and WP_SITEURL constants in TYPO3.
	 */
	siteUrl: string;
	documentRoot?: string;
	/** SQL file to load instead of installing TYPO3. */
	dataSqlPath?: string;
	/** Zip with the TYPO3 installation to extract in /wordpress. */
	typo3Zip?: File | Promise<File> | undefined;
	/** Preloaded SQLite integration plugin. */
	sqliteIntegrationPluginZip?: File | Promise<File>;
	spawnHandler?: (processManager: PHPProcessManager) => SpawnHandler;
	/**
	 * PHP.ini entries to define before running any code. They'll
	 * be used for all requests.
	 */
	phpIniEntries?: PhpIniOptions;
	/**
	 * PHP constants to define for every request.
	 */
	constants?: Record<string, string | number | boolean | null>;
	/**
	 * Files to create in the filesystem before any mounts are applied.
	 *
	 * Example:
	 *
	 * ```ts
	 * {
	 * 		createFiles: {
	 * 			'/tmp/hello.txt': 'Hello, World!',
	 * 			'/internal/preload': {
	 * 				'1-custom-mu-plugin.php': '<?php echo "Hello, World!";',
	 * 			}
	 * 		}
	 * }
	 * ```
	 */
	createFiles?: FileTree;

	/**
	 * A callback that decides how to handle a file-not-found condition for a
	 * given request URI.
	 */
	getFileNotFoundAction?: FileNotFoundGetActionCallback;
}

/**
 * Boots a TYPO3 instance with the given options.
 *
 * High-level overview:
 *
 * * Boot PHP instances and PHPRequestHandler
 * * Setup VFS, run beforeTYPO3Files hook
 * * Setup TYPO3 files (if typo3Zip is provided)
 * * Run beforeDatabaseSetup hook
 * * Setup the database – SQLite, MySQL (@TODO), or rely on a mounted database
 * * Run TYPO3 installer, if the site isn't installed yet
 *
 * @param options Boot configuration options
 * @return PHPRequestHandler instance with TYPO3 installed.
 */

export async function bootTYPO3(options: BootOptions) {
	async function createPhp(
		requestHandler: PHPRequestHandler,
		isPrimary: boolean
	) {
		const php = new PHP(await options.createPhpRuntime());
		if (options.sapiName) {
			php.setSapiName(options.sapiName);
		}
		if (requestHandler) {
			php.requestHandler = requestHandler;
		}
		if (options.phpIniEntries) {
			setPhpIniEntries(php, options.phpIniEntries);
		}
		/**
		 * Set up mu-plugins in /internal/shared/mu-plugins
		 * using auto_prepend_file to provide platform-level
		 * customization without altering the installed TYPO3
		 * site.
		 *
		 * We only do that in the primary PHP instance –
		 * the filesystem there is the source of truth
		 * for all other PHP instances.
		 */
		if (isPrimary) {
			await setupPlatformLevelMuPlugins(php);
			await writeFiles(php, '/', options.createFiles || {});
			await preloadPhpInfoRoute(
				php,
				joinPaths(new URL(options.siteUrl).pathname, 'phpinfo.php')
			);
		} else {
			// Proxy the filesystem for all secondary PHP instances to
			// the primary one.
			proxyFileSystem(await requestHandler.getPrimaryPhp(), php, [
				'/tmp',
				requestHandler.documentRoot,
				'/internal/shared',
			]);
		}

		// Spawn handler is responsible for spawning processes for all the
		// `popen()`, `proc_open()` etc. calls.
		if (options.spawnHandler) {
			await php.setSpawnHandler(
				options.spawnHandler(requestHandler.processManager)
			);
		}

		// Rotate the PHP runtime periodically to avoid memory leak-related crashes.
		// @see https://github.com/TYPO3/wordpress-playground/pull/990 for more context
		rotatePHPRuntime({
			php,
			cwd: requestHandler.documentRoot,
			recreateRuntime: options.createPhpRuntime,
			maxRequests: 400,
		});

		return php;
	}

	const requestHandler: PHPRequestHandler = new PHPRequestHandler({
		phpFactory: async ({ isPrimary }) =>
			createPhp(requestHandler, isPrimary),
		documentRoot: options.documentRoot || '/typo3-website',
		absoluteUrl: options.siteUrl,
		rewriteRules: TYPO3RewriteRules,
		getFileNotFoundAction:
			options.getFileNotFoundAction ?? getFileNotFoundActionForTYPO3,
	});

	const php = await requestHandler.getPrimaryPhp();

	if (options.hooks?.beforeTYPO3Files) {
		await options.hooks.beforeTYPO3Files(php);
	}

	if (options.typo3Zip) {
		await unzipTYPO3(php, await options.typo3Zip);
	}

	if (options.constants) {
		for (const key in options.constants) {
			php.defineConstant(key, options.constants[key] as string);
		}
	}

	// Run "before database" hooks to mount/copy more files in
	if (options.hooks?.beforeDatabaseSetup) {
		await options.hooks.beforeDatabaseSetup(php);
	}

	// @TODO Assert TYPO3 core files are in place

	if (options.sqliteIntegrationPluginZip) {
		await preloadSqliteIntegration(
			php,
			await options.sqliteIntegrationPluginZip
		);
	}

	if (!(await isTYPO3Installed(php))) {
	}

	return requestHandler;
}

async function isTYPO3Installed(php: PHP) {
	return true;
}

export function getFileNotFoundActionForTYPO3(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- maintain consistent FileNotFoundGetActionCallback signature
	relativeUri: string
): FileNotFoundAction {
	// Delegate unresolved requests to TYPO3. This makes TYPO3 magic possible,
	// like pretty permalinks and dynamically generated sitemaps.
	return {
		type: 'internal-redirect',
		uri: '/index.php',
	};
}
