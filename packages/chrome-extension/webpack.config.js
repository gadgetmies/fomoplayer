const { DefinePlugin, EnvironmentPlugin } = require('webpack')
const path = require('path')
const CleanWebpackPlugin = require('clean-webpack-plugin').CleanWebpackPlugin
const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const config = require('./utils/config.js')

const nodeEnv = process.env.NODE_ENV || 'development'
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config

const alias = {
  'react-dom': '@hot-loader/react-dom',
}

const fileExtensions = ['jpg', 'jpeg', 'png', 'gif', 'eot', 'otf', 'svg', 'ttf', 'woff', 'woff2']

let options = {
  mode: nodeEnv === 'development' ? 'development' : 'production',
  entry: {
    popup: path.join(__dirname, 'src', 'js', 'popup.js'),
    options: path.join(__dirname, 'src', 'js', 'options.js'),
    background: path.join(__dirname, 'src', 'js', 'background.js'),
  },
  output: {
    path: path.join(__dirname, 'build'),
    filename: '[name].bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.(sa|sc|c)ss$/,
        use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
        },
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: 'source-map-loader',
          },
          {
            loader: 'babel-loader',
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: alias,
    extensions: fileExtensions.map((extension) => '.' + extension).concat(['.jsx', '.js', '.css']),
  },
  plugins: [
    // clean the build folder
    new CleanWebpackPlugin(),
    new DefinePlugin(config),
    // expose and write the allowed env vars on the compiled bundle
    new EnvironmentPlugin({ ...sharedConfig, IP: sharedConfig.IP || '' }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          force: true,
          transform: function (content, path) {
            // generates the manifest file using the package.json informations
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                key: config.EXTENSION_KEY,
                oauth2: {
                  client_id: config.GOOGLE_OIDC_CLIENT_ID,
                  scopes: [''],
                },
                ...JSON.parse(content.toString()),
              }),
            )
          },
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'popup.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'options.html'),
      filename: 'options.html',
      chunks: ['options'],
      cache: false,
    }),
    // new HtmlWebpackPlugin({
    //   template: path.join(__dirname, "src", "background.html"),
    //   filename: "background.html",
    //   chunks: ["background"]
    // })
  ],
}

if (nodeEnv === 'development') {
  options.devtool = 'cheap-module-source-map'
}

module.exports = options
