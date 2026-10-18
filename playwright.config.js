const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    // Rendering a multi-megapixel scan takes a while, especially throttled
    timeout: 120000,
    expect: { timeout: 15000 },
    // The export tests drive a single shared server and download files
    workers: 1,
    fullyParallel: false,
    globalSetup: require.resolve('./tests/global-setup'),
    use: {
        baseURL: 'http://localhost:3000',
        acceptDownloads: true
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ],
    webServer: {
        command: 'node server.js',
        url: 'http://localhost:3000/index.html',
        reuseExistingServer: true,
        timeout: 30000
    }
});
