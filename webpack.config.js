const path = require('path')
const webpack = require('webpack')
const minJSON = require('jsonminify')
const Fiber = require('fibers')
const fs = require('fs')

const plugins = {
  progress: require('webpackbar'),
  clean: (() => {
    const { CleanWebpackPlugin } = require('clean-webpack-plugin')
    return CleanWebpackPlugin
  })(),
  extractCSS: require('mini-css-extract-plugin'),
  sync: require('browser-sync-webpack-plugin'),
  html: require('html-webpack-plugin'),
  copy: require('copy-webpack-plugin'),
  sri: require('webpack-subresource-integrity'),
}

function fileList(dir) {
  return fs.readdirSync(dir).filter(function(file) {
      const name = path.join(dir, file);
      if (fs.statSync(name).isDirectory()) {
          return true;
      }
      const parts = file.split('.');
      const extension = parts[parts.length - 1];
      return (extension == "html");
  }).reduce(function (list, file) {
      const name = path.join(dir, file);
      if (fs.statSync(name).isDirectory()) {
          return list.concat(fileList(name));
          fs.r
      }
      return list.concat([name]);
  }, []);
}

function generateHtmlPlugins(pagesDir) {
  console.log('----> ' + __dirname);
  const pagesFiles = fileList(pagesDir);
  return pagesFiles.map(item => {
    const template = path.relative(`src`,item);
    const destination = path.relative(pagesDir,item);
    console.log(`=====> ${template}   -to-   ${destination}`);
    return new plugins.html({
      template: `${template}`,
      filename: `${destination}`,
      base: true,
      inject: `head`,
      // root: path.relative(path.dirname(destination), path.resolve(__dirname, 'src')),
      minify: {
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true
      }
    })
  })
}

module.exports = (env = {}, argv) => {
  const isProduction = argv.mode === 'production'

  let config = {
    context: path.resolve(__dirname, 'src'),

    entry: {
      vendor: [
        './styles/vendor.scss',
        './scripts/vendor.js'
      ],
      app: [
        './styles/app.scss',
        './scripts/app.js'
      ]
    },

    output: {
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/',
      filename: 'scripts/[name].js',
      crossOriginLoading: 'anonymous'
    },

    module: {
      rules: [
        {
          test: /\.((s[ac]|c)ss)$/,
          use: [
            {
              loader: plugins.extractCSS.loader,
              options: {
                publicPath: '../' // use relative path for everything in CSS
              }
            },
            {
              loader: 'css-loader',
              options: {
                sourceMap: !isProduction
              }
            },
            {
              loader: 'postcss-loader',
              options: {
                ident: 'postcss',
                sourceMap: !isProduction,
                plugins: (() => [
                  require('autoprefixer')(),
                  ...isProduction ? [
                    require('cssnano')({
                      preset: ['default', {
                        minifySelectors: false
                      }]
                    })
                  ] : []
                ])
              }
            },
            {
              loader: 'sass-loader',
              options: {
                implementation: require('sass'),
                fiber: Fiber,
                outputStyle: 'expanded',
                sourceMap: !isProduction
              }
            }
          ]
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env'
              ]
            }
          }
        },
        {
          test: /\.(gif|png|jpe?g|svg)$/i,
          exclude: /fonts/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: '[path][name].[ext]',
                // publicPath: '..' // use relative path
              }
            },
            {
              loader: 'image-webpack-loader',
              options: {
                bypassOnDebug: !isProduction,
                mozjpeg: {
                  progressive: true,
                  quality: 65
                },
                optipng: {
                  enabled: false
                },
                pngquant: {
                  quality: '65-90',
                  speed: 4
                },
                gifsicle: {
                  interlaced: false
                }
              }
            }
          ]
        },
        {
          test: /.(ttf|otf|eot|svg|woff(2)?)(\?[a-z0-9]+)?$/,
          exclude: /images/,
          use: [{
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'fonts/',
              // publicPath: '../fonts/' // use relative path
            }
          }]
        },
        {
          test: /\.html$/,
          include: path.resolve(__dirname, 'src/templates'),
          // use: {
          //   loader: 'raw-loader'
          // },
          use: {
            loader: 'html-loader',
            options: {
              // minimize: true,
              removeComments: true,
              collapseWhitespace: true,
              removeScriptTypeAttributes: true,
              removeStyleTypeAttributes: true
            }
          },
        }
      ]
    },

    devServer: {
      contentBase: path.join(__dirname, 'src'),
      port: 8080,
      overlay: {
        warnings: true,
        errors: true
      },
      quiet: true
    },

    plugins: (() => {
      let common = [
        new plugins.extractCSS({
          filename: 'styles/[name].css'
        }),
        // new plugins.html({
        //   template: 'html/index.html',
        //   filename: 'index.html',
        //   minify: {
        //     removeScriptTypeAttributes: true,
        //     removeStyleLinkTypeAttributes: true
        //   }
        // }),
        new plugins.progress({
          color: '#5C95EE'
        }),
        new webpack.DefinePlugin({
          root: JSON.stringify(path.resolve(__dirname, 'src'))
        })
      ].concat(generateHtmlPlugins('src/html'))

      const production = [
        new plugins.clean(),
        new plugins.copy([
          {
            from: 'data/**/*.json',
            transform: content => {
              return minJSON(content.toString())
            }
          }
        ]),
        new plugins.sri({
          hashFuncNames: ['sha384'],
          enabled: true
        })
      ]

      const development = [
        new plugins.sync(
          {
            host: 'localhost',
            port: 9090,
            proxy: 'http://localhost:8080/'
          },
          {
            reload: false
          }
        )
      ]

      return isProduction
        ? common.concat(production)
        : common.concat(development)
    })(),

    devtool: (() => {
      return isProduction
        ? '' // 'hidden-source-map'
        : 'source-map'
    })(),

    resolve: {
      modules: [path.resolve(__dirname, 'src'), 'node_modules'],
      alias: {
        '~': path.resolve(__dirname, 'src/scripts/')
      }
    },

    stats: 'errors-only'
  }

  return config
}
