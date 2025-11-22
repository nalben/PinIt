// config/build/buildPlugins.ts
import webpack, { Configuration } from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { BuildOptions } from './types/types';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import ReactrefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import path from 'path';

const ImageminWebpWebpackPlugin = require('imagemin-webp-webpack-plugin');

export function buildPlugins({ mode, paths, analyzer, platform }: BuildOptions): Configuration['plugins'] {
  const isProd = mode === 'production';
  const plugins: Configuration['plugins'] = [
    new HtmlWebpackPlugin({ template: paths.html, favicon: path.resolve(paths.public, 'Logo.svg') }),
    new webpack.DefinePlugin({
      __PLATFORM__: JSON.stringify(platform),
      __ENV__: JSON.stringify(mode),
    }),
  ];

  if (!isProd) {
    plugins.push(new webpack.ProgressPlugin());
    plugins.push(new ForkTsCheckerWebpackPlugin());
    plugins.push(new ReactrefreshWebpackPlugin());
  }

  if (isProd) {
    plugins.push(
      new MiniCssExtractPlugin({
        filename: 'css/[name].[contenthash:8].css',
        chunkFilename: 'css/[name].[contenthash:8].css',
      })
    );

    const ImageMinimizerPlugin = require('image-minimizer-webpack-plugin');

plugins.push(
    new ImageMinimizerPlugin({
        minimizer: {
            implementation: ImageMinimizerPlugin.imageminMinify,
            options: {
                plugins: [
                    ['mozjpeg', { quality: 85 }],
                    ['pngquant', { quality: [0.7, 0.8] }],
                    ['gifsicle', { optimizationLevel: 2 }],
                    ['imagemin-webp', { quality: 85 }]
                ],
            },
        },
        generator: [
            {
                preset: 'webp',
                implementation: ImageMinimizerPlugin.imageminGenerate,
                options: {
                    plugins: [['imagemin-webp', { quality: 75 }]],
                },
                filename: 'img/[name].[contenthash:8].webp',
            },
        ],
        deleteOriginalAssets: true,
    })
);
  }

  if (analyzer) {
    plugins.push(new BundleAnalyzerPlugin());
  }

  return plugins;
}
