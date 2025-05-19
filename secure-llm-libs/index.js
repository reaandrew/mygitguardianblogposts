// Export all modules from a central location
const chunker = require('./src/chunker');
const gitguardian_wrapper = require('./src/gitguardian/gitguardian-wrapper');

module.exports = {
    chunker,
    gitguardian_wrapper
};
