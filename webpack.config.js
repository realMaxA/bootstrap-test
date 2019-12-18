const fs = require('fs');
const path = require('path');
const slash = require('slash');
// const webpack = require('webpack');
// const minJSON = require('jsonminify');

const librarypath = 'src/html';

const plugins = {
  progress: require('webpackbar'),
  clean: (() => {
    const { CleanWebpackPlugin } = require('clean-webpack-plugin');
    return CleanWebpackPlugin;
  })(),
  extractCSS: require('mini-css-extract-plugin'),
  sync: require('browser-sync-webpack-plugin'),
  html: require('html-webpack-plugin'),
}

const librarySettings = readSettings(librarypath)

function setSettings(dest, src) {
  for (prop in dest) {
    if (prop in src) {
      dest[prop] = src[prop]
    }
  }
}

function readSettings(location) {

  var result = {
    type: 'common',
    title: '',
    altName: '',
    content: {},
  }

  var indexfile = path.join(location, 'content.json')

  if (fs.existsSync(indexfile) && fs.statSync(indexfile).isFile()) {
    content = JSON.parse(fs.readFileSync(indexfile, 'utf8'))

    setSettings(result, content)
  }

  return result

}

function templatePath(object) {

  location = '';

  if ('overrideBlocks' in object) {
    if ('body' in object.overrideBlocks) {
      location = object.overrideBlocks.body.template.path;
    }
  } else if ('template' in object) {
    location = object.template.path;
  }

  return location;

}

function templateLocation(object) {

  return path.dirname(templatePath(object));

}

function fileList(dir, ext) {
  return fs.readdirSync(dir).filter(function (file) {
    const name = path.join(dir, file)
    if (fs.statSync(name).isDirectory())
      return true
    const parts = file.split('.')
    const extension = parts[parts.length - 1]
    return (extension == ext)
  }).reduce(function (list, file) {
    const name = path.join(dir, file)
    if (fs.statSync(name).isDirectory())
      return list.concat(fileList(name, ext))
    return list.concat([name])
  }, [])
}

function generateHtmlPlugins(pagesDir) {
  const pagesFiles = fileList(pagesDir, 'html');
  return pagesFiles.map(item => {
    const template = path.relative(`src`, item);
    const destination = path.relative(pagesDir, item);
    return new plugins.html({
      template: `${template}`,
      filename: `${destination}`,
      inject: `true`,
      minify: true
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
                sassOptions: {
                  fiber: require('fibers'),
                  outputStyle: 'expanded',
                  sourceMap: !isProduction
                }
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
                disable: !isProduction,
                mozjpeg: {
                  progressive: true,
                  quality: 65
                },
                optipng: {
                  enabled: false
                },
                pngquant: {
                  quality: [0.65, 0.90],
                  speed: 4
                },
                gifsicle: {
                  interlaced: false
                },
                webp: {
                  quality: 75
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
          use: [{
            loader: 'html-loader',
            options: {
              minimize: isProduction ? true : false
            },
          },
          {
            loader: 'twig-html-loader',
            options: {
              data: {
              },
              namespaces: {
                'templates': path.resolve(__dirname, 'src/templates'),
              },
              functions: {
                init_template() {
                  var result = {};

                  result.pageFile = templatePath(this);
                  result.librarySettings = librarySettings;
                  result.templateSettings = readSettings(templateLocation(this));

                  return result
                },
                isCurrentSection(location, section) {
                  return (path.basename(location) == section)
                },
              },
            }
          },
          ]
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

    node: {
      fs: "empty" // avoids error messages
    },

    plugins: (() => {
      let common = [
        new plugins.extractCSS({
          filename: 'styles/[name].css'
        }),
        new plugins.progress({
          color: '#5C95EE'
        }),
      ].concat(generateHtmlPlugins('src/html'))

      const production = [
        new plugins.clean(),
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

    stats: 'verbose'
  }

  return config
}
