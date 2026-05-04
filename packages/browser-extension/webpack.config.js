const { DefinePlugin, EnvironmentPlugin } = require('webpack')
const path = require('path')
const fs = require('fs')
const CleanWebpackPlugin = require('clean-webpack-plugin').CleanWebpackPlugin
const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const config = require('./utils/config.js')
const pkg = require('./package.json')

const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'safari']
const browser = process.env.BROWSER || 'chrome'
if (!SUPPORTED_BROWSERS.includes(browser)) {
  throw new Error(`Unsupported BROWSER="${browser}". Expected one of: ${SUPPORTED_BROWSERS.join(', ')}.`)
}

const nodeEnv = process.env.NODE_ENV || 'development'
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config

const sharedConfigForEnv = Object.fromEntries(
  Object.entries(sharedConfig).filter(([, value]) => value !== undefined && value !== null),
)

const fileExtensions = ['jpg', 'jpeg', 'png', 'gif', 'eot', 'otf', 'svg', 'ttf', 'woff', 'woff2']

const buildManifest = (baseContent) => {
  const base = JSON.parse(baseContent.toString())
  const overlayPath = path.join(__dirname, 'src', `manifest.${browser}.json`)
  const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
  const merged = deepMerge(base, overlay)
  return Buffer.from(
    JSON.stringify(
      {
        description: pkg.description,
        version: pkg.version,
        ...(config.EXTENSION_KEY ? { key: config.EXTENSION_KEY } : {}),
        ...merged,
      },
      null,
      2,
    ),
  )
}

const deepMerge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b]
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a }
    for (const [key, value] of Object.entries(b)) {
      out[key] = key in a ? deepMerge(a[key], value) : value
    }
    return out
  }
  return b
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

const options = {
  mode: nodeEnv === 'development' ? 'development' : 'production',
  entry: {
    popup: path.join(__dirname, 'src', 'js', 'popup.js'),
    options: path.join(__dirname, 'src', 'js', 'options.js'),
    background: path.join(__dirname, 'src', 'js', 'service_worker.js'),
    'auth-callback': path.join(__dirname, 'src', 'js', 'auth-callback.js'),
    'audio-player': path.join(__dirname, 'src', 'js', 'audio-player.js'),
    'content-beatport': path.join(__dirname, 'src', 'js', 'content', 'beatport.js'),
    'content-bandcamp': path.join(__dirname, 'src', 'js', 'content', 'bandcamp.js'),
  },
  output: {
    path: path.join(__dirname, 'build', browser),
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
    alias: {
      'react-dom': '@hot-loader/react-dom',
    },
    extensions: fileExtensions.map((extension) => '.' + extension).concat(['.jsx', '.js', '.css']),
  },
  plugins: [
    new CleanWebpackPlugin(),
    new DefinePlugin({ ...config, BROWSER: JSON.stringify(browser) }),
    new EnvironmentPlugin({ ...sharedConfigForEnv, IP: sharedConfig.IP || '' }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.base.json',
          to: 'manifest.json',
          force: true,
          transform: buildManifest,
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
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'auth-callback.html'),
      filename: 'auth-callback.html',
      chunks: ['auth-callback'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'audio-player.html'),
      filename: 'audio-player.html',
      chunks: ['audio-player'],
      cache: false,
    }),
  ],
}

if (nodeEnv === 'development') {
  options.devtool = 'cheap-module-source-map'
}

module.exports = options
