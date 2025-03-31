import path, { join } from 'path';
import { spawn } from 'child_process';
import yargs from 'yargs';
import { promises as fs, statSync } from 'fs';
import semver from 'semver';

const parser = yargs(process.argv.slice(2))
	.usage('Usage: $0 [options]')
	.options({
		TYPO3Version: {
			type: 'string',
			description:
				'The TYPO3 version to download. Can be a major version like 6.4 or "beta" or "nightly".',
			required: true,
		},
		['output-js']: {
			type: 'string',
			description: 'typo3.js and typo3.zip output directory',
			required: true,
		},
		['output-assets']: {
			type: 'string',
			description: 'TYPO3 static files output directory',
			required: true,
		},
		force: {
			type: 'boolean',
			description:
				'Force rebuild even if the version is already downloaded',
			default: process.env.FORCE_REBUILD === 'true',
		},
	});

const args = parser.argv;

let TYPO3Versions = await fetch(
	'https://api.wordpress.org/core/version-check/1.7/?channel=beta'
).then((res) => res.json());

TYPO3Versions = TYPO3Versions.offers.filter((v) => v.response === 'autoupdate');

let beta = null;
if (
	TYPO3Versions[0].current.includes('beta') ||
	TYPO3Versions[0].current.toLowerCase().includes('rc')
) {
	beta = TYPO3Versions[0];
	TYPO3Versions = TYPO3Versions.slice(1);
}

/**
 * Create a list of the latest patch versions for each major.minor version.
 *
 * Sometimes the API may include multiple patch versions for the same major.minor version.
 * Playground builds only the latest patch version.
 */
const latestVersions = TYPO3Versions.reduce((versionAccumulator, TYPO3Version) => {
	const [major, minor] = TYPO3Version.version.split('.');
	const majorMinor = `${major}.${minor}`;

	const currentVersionIndex = versionAccumulator.findIndex((v) =>
		v.version.startsWith(majorMinor)
	);
	if (-1 === currentVersionIndex) {
		versionAccumulator.push(TYPO3Version);
	} else if (
		semver.gt(
			TYPO3Version.version,
			versionAccumulator[currentVersionIndex].version
		)
	) {
		versionAccumulator[currentVersionIndex] = TYPO3Version;
	}
	return versionAccumulator;
}, []);

function toVersionInfo(apiVersion, slug = null) {
	if (!apiVersion) {
		return {};
	}
	return {
		url: apiVersion.download,
		version: apiVersion.version,
		majorVersion: apiVersion.version.substring(0, 3),
		slug: slug || apiVersion.version.substring(0, 3),
	};
}

let versionInfo = {};
const relevantApiVersion = latestVersions.find((v) =>
	v.version.startsWith(args.TYPO3Version)
);
versionInfo = toVersionInfo(relevantApiVersion);


if (!versionInfo.url) {
	process.stdout.write(`TYPO3 version ${args.TYPO3Version} is not supported\n`);
	process.stdout.write(await parser.getHelp());
	process.exit(1);
}

const sourceDir = path.dirname(new URL(import.meta.url).pathname);
const outputAssetsDir = path.resolve(process.cwd(), args.outputAssets);
const outputJsDir = path.resolve(process.cwd(), args.outputJs);

// Short-circuit if the version is already downloaded and not forced
const versionsPath = `${outputJsDir}/typo3-versions.json`;
let versions = {};
try {
	const data = await fs.readFile(versionsPath, 'utf8');
	versions = JSON.parse(data);
} catch (e) {
	// If the existing JSON file doesn't exist or cannot be read,
	// just ignore that and assume an empty one.
	versions = {};
}

if (
	!args.force &&
	versions[versionInfo.slug] === versionInfo.version
) {
	process.stdout.write(
		`The requested version was ${args.TYPO3Version}, but its latest release (${versionInfo.version}) is already downloaded\n`
	);
	process.exit(0);
}

// Build TYPO3
const typo3Dir = join(sourceDir, 'typo3');
try {
	try {
		await fs.rm(typo3Dir, { recursive: true });
	} catch (e) {
		// Ignore
	}
	await fs.mkdir(typo3Dir);
	// Install TYPO3 in a local directory
	await asyncSpawn(
		'bun',
		[
			'../../cli/src/cli.ts',
			'run-blueprint',
			`--wp=${versionInfo.url}`,
			`--mount-before-install=${typo3Dir}:/typo3`,
		],
		{ cwd: sourceDir, stdio: 'inherit' }
	);

	// Minify that WordPress
	await asyncSpawn(
		'docker',
		[
			'build',
			'.',
			'--progress=plain',
			'--tag=typo3-playground',
			'--build-arg',
			`OUT_FILENAME=wp-${versionInfo.slug}`,
		],
		{ cwd: sourceDir, stdio: 'inherit' }
	);
} finally {
	await fs.rm(typo3Dir, { recursive: true });
}

// Extract the WordPress static root with wp-includes/ etc
await asyncSpawn(
	'docker',
	[
		'run',
		'--name',
		'typo3-playground-tmp',
		'--rm',
		'-v',
		`${outputAssetsDir}:/output`,
		'typo3-playground',
		'sh',
		'-c',
		`cp -r /root/output/wp-${versionInfo.slug} /output/`,
	],
	{ cwd: sourceDir, stdio: 'inherit' }
);

// Extract wp.zip from the docker image
await asyncSpawn(
	'docker',
	[
		'run',
		'--name',
		'typo3-playground-tmp',
		'--rm',
		'-v',
		`${outputJsDir}:/output`,
		'typo3-playground',
		'sh',
		'-c',
		`cp /root/output/*.zip /output/`,
	],
	{ cwd: sourceDir, stdio: 'inherit' }
);

// Update the WordPress versions JSON
// Set WordPress version
versions[versionInfo.slug] = versionInfo.version;

// Sort version keys, which are strings, in an ascending order
versions = Object.keys(versions)
	.sort()
	.reverse()
	.reduce((acc, key) => {
		acc[key] = versions[key];
		return acc;
	}, {});

const slugify = (v) => v.replace(/[^a-zA-Z0-9_]/g, '_');

// Write the updated JSON back to the file
await fs.writeFile(versionsPath, JSON.stringify(versions, null, 2));

const latestStableVersion = Object.keys(versions).filter((v) =>
	v.match(/^\d/)
)[0];

const sizes = {};
for (const version of Object.keys(versions)) {
	const zipPath = `${outputJsDir}/wp-${version}.zip`;
	try {
		sizes[version] = statSync(zipPath).size;
	} catch (e) {
		sizes[version] = 0;
	}
}

// Refresh get-typo3-module.ts
const getTYPO3ModulePath = `${outputJsDir}/get-typo3-module-details.ts`;
const getTYPO3ModuleContent = `
${Object.keys(versions)
	.map(
		(version) =>
			`// @ts-ignore
import url_${slugify(version)} from './typo3-${version}.zip?url';`
	)
	.join('\n')}

/**
 * This file was auto generated by packages/playground/typo3-builds/build/build.js
 * DO NOT CHANGE MANUALLY!
 * This file must statically exists in the project because of the way
 * vite resolves imports.
 */
export function getTYPO3ModuleDetails(TYPO3Version: string = ${JSON.stringify(
	latestStableVersion
)}): { size: number, url: string } {
	switch (TYPO3Version) {
		${Object.keys(versions)
			.map(
				(version) => `
		case '${version}':
			/** @ts-ignore */
			return {
				size: ${JSON.stringify(sizes[version])},
				url: url_${slugify(version)},
			};
			`
			)
			.join('')}

	}
	throw new Error('Unsupported TYPO3 module: ' + TYPO3Version);
}
`;
await fs.writeFile(getTYPO3ModulePath, getTYPO3ModuleContent);

function asyncSpawn(...args) {
	return new Promise((resolve, reject) => {
		const child = spawn(...args);

		child.on('close', (code) => {
			if (code === 0) resolve(code);
			else reject(new Error(`Process exited with code ${code}`));
		});
	});
}
