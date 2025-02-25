let path = require('path');
let Entry = require('./Entry');
let { Chunks } = require('../Chunks');
let webpackRules = require('./webpack-rules');
let webpackPlugins = require('./webpack-plugins');
let webpackDefaultConfig = require('./webpack-default');

process.noDeprecation = true;

class WebpackConfig {
    /**
     * Create a new instance.
     */
    constructor() {
        this.chunks = Chunks.instance();
    }

    /**
     * Build the Webpack configuration object.
     */
    async build() {
        this.webpackConfig = webpackDefaultConfig();

        await this.buildEntry();
        this.buildOutput();
        this.configureHMR();
        await this.buildRules();
        await this.buildPlugins();
        this.buildChunks();

        // We'll announce that the core config object has been
        // generated by Mix. At this point, any plugins may
        // hook in and modify the config as necessary.
        await Mix.dispatch('configReady', this.webpackConfig);

        // Rebuild the chunks as plugins may have added new ones
        this.buildChunks();

        // Finally, we'll make one last announcement for the user
        // to hook into - using mix.override().
        await Mix.dispatch('configReadyForUser', this.webpackConfig);

        // Rebuild the chunks as the user may have changed things
        this.buildChunks();

        return this.webpackConfig;
    }

    /**
     * Build the entry object.
     */
    async buildEntry() {
        let entry = new Entry();

        if (!Mix.bundlingJavaScript) {
            entry.addDefault();
        }

        await Mix.dispatch('loading-entry', entry);

        this.webpackConfig.entry = entry.get();
    }

    /**
     * Build the output object.
     */
    buildOutput() {
        this.webpackConfig.output = {
            path: path.resolve(Config.publicPath),
            filename: '[name].js',

            chunkFilename: pathData => {
                let hasAbsolutePathChunkName =
                    pathData.chunk.name && pathData.chunk.name.startsWith('/');

                if (Mix.components.get('js') && !hasAbsolutePathChunkName) {
                    let output = Mix.components.get('js').toCompile[0].output;

                    return `${output.normalizedOutputPath()}/[name].js`;
                }

                return '[name].js';
            },

            publicPath: '/'
        };
    }

    configureHMR() {
        if (!Mix.isUsing('hmr')) {
            return;
        }

        let http = process.argv.includes('--https') ? 'https' : 'http';
        const url = `${http}://${Config.hmrOptions.host}:${Config.hmrOptions.port}/`;

        this.webpackConfig.output = {
            ...this.webpackConfig.output,

            publicPath: url
        };

        const { host, port } = Config.hmrOptions;

        this.webpackConfig.devServer = {
            host,
            port,

            client: {
                host,
                port
            },

            public: url,
            liveReload: false,

            dev: {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers':
                        'X-Requested-With, Content-Type, Authorization'
                }
            },

            /**
             *
             * @param {{app: import("express").Application}} param0
             */
            onBeforeSetupMiddleware({ app }) {
                app.use(function(req, _, next) {
                    // Something causes hot update chunks (except for the JSON payload)
                    // to start with a double slash
                    // e.g. GET http://localhost:8080//js/app.[hash].hot-update.js

                    // This causes loading those chunks to fail so we patch it up here
                    // This is super hacky and a proper solution should be found eventually
                    req.url = req.url.replace(/^\/\//, '/');

                    next();
                });
            },

            ...this.webpackConfig.devServer
        };
    }

    /**
     * Build the rules array.
     */
    async buildRules() {
        this.webpackConfig.module.rules = this.webpackConfig.module.rules.concat(
            webpackRules()
        );

        await Mix.dispatch('loading-rules', this.webpackConfig.module.rules);
    }

    /**
     * Build the plugins array.
     */
    async buildPlugins() {
        this.webpackConfig.plugins = this.webpackConfig.plugins.concat(webpackPlugins());

        await Mix.dispatch('loading-plugins', this.webpackConfig.plugins);
    }

    /**
     * Build the resolve object.
     */
    buildChunks() {
        this.webpackConfig = require('./MergeWebpackConfig')(
            this.webpackConfig,
            this.chunks.config()
        );
    }
}

module.exports = WebpackConfig;
