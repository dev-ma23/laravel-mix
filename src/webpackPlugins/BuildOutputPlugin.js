const _ = require('lodash');
const argv = require('yargs');
const chalk = require('chalk');
const Table = require('cli-table3');
const readline = require('readline');
const stripAnsi = require('strip-ansi');
const { formatSize } = require('webpack/lib/SizeFormatHelpers');
const { version } = require('../../package.json');

/**
 * @typedef {object} BuildOutputOptions
 * @property {boolean} clearConsole
 **/

class BuildOutputPlugin {
    /**
     *
     * @param {BuildOutputOptions} options
     */
    constructor(options) {
        this.options = options;
        this.patched = false;
    }

    /**
     * Apply the plugin.
     *
     * @param {import("webpack").Compiler} compiler
     */
    apply(compiler) {
        if (argv['$0'].includes('ava')) {
            return;
        }

        compiler.hooks.done.tap('BuildOutputPlugin', stats => {
            if (stats.hasErrors()) {
                return false;
            }

            if (this.options.clearConsole) {
                this.clearConsole();
            }

            let data = stats.toJson({
                assets: true,
                builtAt: true,
                hash: true,
                performance: true
            });

            this.heading(`Laravel Mix v${version}`);

            console.log(chalk.green.bold(`✔ Compiled Successfully in ${data.time}ms`));

            if (data.assets.length) {
                console.log(this.statsTable(data));
            }
        });
    }

    /**
     * Print a block section heading.
     *
     * @param {string} text
     */
    heading(text) {
        console.log();

        console.log(chalk.bgBlue.white.bold(this.section(text)));

        console.log();
    }

    /**
     * Create a block section.
     *
     * @param {string} text
     */
    section(text) {
        const padLength = 3;
        const padding = ' '.repeat(padLength);

        text = `${padding}${text}${padding}`;

        const line = ' '.repeat(text.length);

        return `${line}\n${text}\n${line}`;
    }

    /**
     * Generate the stats table.
     *
     * @param {any} data
     * @returns {string}
     */
    statsTable(data) {
        data = this.sortAssets(data);

        const table = new Table({
            head: [chalk.bold('File'), chalk.bold('Size')],
            colWidths: [35],
            colAligns: ['right'],
            style: {
                head: [],
                compact: true
            }
        });

        for (const asset of data.assets) {
            table.push([chalk.green(asset.name), formatSize(asset.size)]);
        }

        this.extendTableWidth(table);
        this.monkeyPatchTruncate();

        return table.toString();
    }

    /**
     *
     * @param {any} data
     */
    sortAssets(data) {
        data.assets = _.orderBy(data.assets, ['name', 'size'], ['asc', 'asc']);

        return data;
    }

    /**
     * Clear the entire screen.
     */
    clearConsole() {
        const blank = '\n'.repeat(process.stdout.rows);
        console.log(blank);

        readline.cursorTo(process.stdout, 0, 0);
        readline.clearScreenDown(process.stdout);
    }

    /**
     * Extend the width of the table
     *
     * Currently only increases the file column size
     *
     * @param {import("cli-table3").Table} table
     * @param {number|null} targetWidth
     * @param {number} maxWidth
     */
    extendTableWidth(table, targetWidth = null, maxWidth = Infinity) {
        targetWidth = targetWidth === null ? process.stdout.columns : targetWidth;

        if (!targetWidth) {
            return;
        }

        const tableWidth = this.calculateTableWidth(table);
        const fileColIncrease = Math.min(targetWidth - tableWidth, maxWidth - tableWidth);

        if (fileColIncrease <= 0) {
            return;
        }

        // @ts-ignore
        table.options.colWidths[0] += fileColIncrease;
    }

    // Yeah, I know.
    monkeyPatchTruncate() {
        if (this.patched) {
            return;
        }

        this.patched = true;

        // @ts-ignore
        const utils = require('cli-table3/src/utils');
        const oldTruncate = utils.truncate;

        // cli-table3 can only do truncation at the end
        // We want the asset name to be truncated at the beginning if it's too long
        // FIXME: We really should set truncation location via a paramter or something
        // (or PR support for alignment-based truncation)

        /**
         *
         * @param {string} str
         * @param {number} desiredLength
         * @param {string} truncateChar
         */
        utils.truncate = (str, desiredLength, truncateChar) => {
            if (str.length > desiredLength) {
                str = `…${str.substr(-desiredLength + 2)}`;
            }

            return oldTruncate(str, desiredLength, truncateChar);
        };
    }

    /**
     * Calculate the width of the CLI Table
     *
     * `table.width` does not report the correct width
     * because it includes ANSI control characters
     *
     * @internal
     * @param {import("cli-table3").Table} table
     */
    calculateTableWidth(table) {
        const firstRow = table.toString().split('\n')[0];

        return stripAnsi(firstRow).length;
    }
}

module.exports = BuildOutputPlugin;
