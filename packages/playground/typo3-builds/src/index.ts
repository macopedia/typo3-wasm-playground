export { getTYPO3ModuleDetails } from './typo3/get-typo3-module-details';
export { getTYPO3Module } from './typo3/get-typo3-module';
export * as sqliteDatabaseIntegrationModuleDetails from './sqlite-database-integration/get-sqlite-database-plugin-details';
export { getSqliteDatabaseModule } from './sqlite-database-integration/get-sqlite-database-module';
import MinifiedTYPO3Versions from './typo3/typo3-versions.json';

export { MinifiedTYPO3Versions };
export const MinifiedTYPO3VersionsList = Object.keys(
	MinifiedTYPO3Versions
) as any as string[];
export const LatestMinifiedTYPO3Version = MinifiedTYPO3VersionsList.filter(
	(v) => v.match(/^\d/)
)[0] as string;

export function t3VersionToStaticAssetsDirectory(
	TYPO3Version: string
): string | undefined {
	return TYPO3Version in MinifiedTYPO3Versions
		? `typo3-${TYPO3Version}`
		: undefined;
}
