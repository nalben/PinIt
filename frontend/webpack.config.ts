import path from 'path';
import webpack from 'webpack';
import { buildWebpack } from './config/build/buildWebpack';
import { BuildMode, BuildPaths, BuildPlatform } from './config/build/types/types';



interface EnvVariables {
    mode?: BuildMode;
    analyzer?: boolean;
    port?: number;
    platform?: BuildPlatform;
}

export default (env: EnvVariables = {}) => {
    const mode: BuildMode = env.mode ?? 'development';
    const buildPlatform: BuildPlatform = env.platform ?? 'desktop';
    const outputPath =
        mode === 'production'
            ? path.resolve(__dirname, 'build', buildPlatform)
            : path.resolve(__dirname, 'build');

    const paths: BuildPaths = {
        output: outputPath,
        entry: path.resolve(__dirname, 'src', 'index.tsx'),
        html: path.resolve(__dirname, 'public', 'index.html'),
        public: path.resolve(__dirname, 'public'),
        src: path.resolve(__dirname, 'src'),

    }
    
    const config: webpack.Configuration = buildWebpack({
        port: env.port ?? 3000,
        mode,
        paths,
        analyzer: env.analyzer,
        platform: buildPlatform,
    })

    return config;
}

