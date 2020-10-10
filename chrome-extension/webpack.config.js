const { DefinePlugin, EnvironmentPlugin } = require('webpack')
const path = require('path')
const CleanWebpackPlugin = require('clean-webpack-plugin').CleanWebpackPlugin
const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const WriteFilePlugin = require('write-file-webpack-plugin')

const config = require('./utils/config.js')

const nodeEnv = process.env.NODE_ENV || 'development'
const sharedConfig = require('shared')(nodeEnv).config
const sharedConfigKeys = Object.keys(sharedConfig)

const fileExtensions = ['jpg', 'jpeg', 'png', 'gif', 'eot', 'otf', 'svg', 'ttf', 'woff', 'woff2']

let options = {
  mode: nodeEnv === 'development' ? 'development' : 'production',
  entry: {
    popup: path.join(__dirname, 'src', 'js', 'popup.js'),
    //    options: path.join(__dirname, "src", "js", "options.js"),
    background: path.join(__dirname, 'src', 'js', 'background.js')
  },
  output: {
    path: path.join(__dirname, 'build'),
    filename: '[name].bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.(sa|sc|c)ss$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        loader: 'file-loader?name=[name].[ext]'
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/
      },
      {
        test: /\.(js|jsx)$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: fileExtensions.map(extension => '.' + extension).concat(['.jsx', '.js', '.css'])
  },
  plugins: [
    // clean the build folder
    new CleanWebpackPlugin(),
    new DefinePlugin(config),
    // expose and write the allowed env vars on the compiled bundle
    new EnvironmentPlugin(['NODE_ENV', ...sharedConfigKeys]),
    new CopyWebpackPlugin([
      {
        from: 'src/manifest.json',
        transform: function(content, path) {
          // generates the manifest file using the package.json informations
          return Buffer.from(
            JSON.stringify({
              description: process.env.npm_package_description,
              version: process.env.npm_package_version,
              key: config.EXTENSION_KEY,
              oauth2: {
                client_id: config.GOOGLE_CLIENT_ID,
                scopes: [config.PLAYER_API_URL] // TODO: does the path need to be removed?
              },
              ...JSON.parse(content.toString())
            })
          )
        }
      }
    ]),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'popup.html'),
      filename: 'popup.html',
      chunks: ['popup']
    }),
    /*    new HtmlWebpackPlugin({
          template: path.join(__dirname, "src", "options.html"),
          filename: "options.html",
          chunks: ["options"]
        }),*/
    // new HtmlWebpackPlugin({
    //   template: path.join(__dirname, "src", "background.html"),
    //   filename: "background.html",
    //   chunks: ["background"]
    // }),
    new WriteFilePlugin()
  ]
}

if (nodeEnv === 'development') {
  options.devtool = 'cheap-module-eval-source-map'
}

module.exports = options
