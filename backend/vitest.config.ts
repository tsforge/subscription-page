import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
    test: {
        globals: true,
        root: './',
        include: [
            'test/**/*.e2e-spec.ts',
            'test/**/*.spec.ts',
            'src/**/*.spec.ts',
            // Live contract tests against the real Remnawave panel. They
            // self-skip unless LIVE_* env vars are set (see the file header),
            // so they are harmless in normal / CI runs.
            'test/**/*.live-spec.ts',
        ],
        setupFiles: ['test/setup-e2e.ts'],
        // NestJS DI + supertest servers need a real Node env, not jsdom.
        environment: 'node',
        // App bootstrap (Nest module compile) can be slow on first run.
        hookTimeout: 30_000,
        testTimeout: 20_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            // Only business code counts toward coverage.
            include: ['src/**/*.ts', 'libs/contract/**/*.ts'],
            exclude: [
                'src/main.ts',
                '**/*.module.ts',
                '**/index.ts',
                '**/interfaces/**',
                '**/*.interface.ts',
                '**/dtos/**',
                '**/*.dto.ts',
                '**/types/**',
                '**/*.type.ts',
                // Infrastructure / logging glue — not worth unit-testing.
                'src/common/utils/startup-app/**',
                'src/common/utils/filter-logs/**',
                'libs/contract/**/*.command.ts',
            ],
        },
    },
    plugins: [
        // Resolve @common / @modules / @contract path aliases from tsconfig.
        tsconfigPaths(),
        // SWC transpiles TS decorators AND emits decorator metadata, which
        // esbuild (vitest default) does not — required for Nest DI to work.
        swc.vite({
            module: { type: 'es6' },
            jsc: {
                target: 'es2022',
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
            },
        }),
    ],
});
