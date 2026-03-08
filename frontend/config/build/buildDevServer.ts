import type { Configuration as DevServerConfiguration } from "webpack-dev-server";
import { BuildOptions } from "./types/types";

export function buildDevServer(options: BuildOptions): DevServerConfiguration {
    return {
        port: options.port ?? 5000,
        open: true,
        historyApiFallback: true,
        client: {
            overlay: {
                runtimeErrors: (error: Error) => {
                    const message = String(error?.message ?? '');
                    if (
                        message === 'ResizeObserver loop completed with undelivered notifications.' ||
                        message === 'ResizeObserver loop limit exceeded'
                    ) {
                        return false;
                    }
                    return true;
                },
            },
        },
    }
}
