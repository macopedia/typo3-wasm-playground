const wpBuildsDepRule = require('./avoid-typo3-builds-dependency');
const plugin = {
	rules: {
		'avoid-typo3-builds-dependency': wpBuildsDepRule,
	},
};
module.exports = plugin;
