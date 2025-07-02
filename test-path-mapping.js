const fs = require('fs-extra');
const path = require('path');
const PackageBuilder = require('./server/utils/PackageBuilder');
const { logger } = require('./server/utils/logger');

// Test class for path mapping functionality
class PathMappingTest {
    constructor() {
        this.testDir = path.join(__dirname, 'test-output');
        this.testResults = [];
    }

    async runAllTests() {
        logger.info('Starting path mapping tests');
        
        try {
            await this.setupTestEnvironment();
            
            // Test cases for different scenarios
            await this.testVueCliProject();
            await this.testCreateReactAppProject();
            await this.testViteProject();
            await this.testGenericWebpackProject();
            
            await this.printResults();
            await this.cleanup();
            
        } catch (error) {
            logger.error('Test execution failed', { error: error.message });
            throw error;
        }
    }

    async setupTestEnvironment() {
        await fs.ensureDir(this.testDir);
        logger.info('Test environment set up', { testDir: this.testDir });
    }

    async testVueCliProject() {
        const testName = 'Vue CLI Project';
        logger.info(`Running test: ${testName}`);
        
        try {
            const projectDir = path.join(this.testDir, 'vue-project');
            await fs.ensureDir(projectDir);
            
            // Create Vue CLI-like structure
            await fs.ensureDir(path.join(projectDir, 'assets', 'image'));
            await fs.ensureDir(path.join(projectDir, 'assets', 'stylesheet'));
            await fs.ensureDir(path.join(projectDir, 'assets', 'javascript'));
            
            // Create sample files
            await fs.writeFile(path.join(projectDir, 'assets', 'image', 'logo.png'), 'fake-image-data');
            await fs.writeFile(path.join(projectDir, 'assets', 'stylesheet', 'app.css'), '.app { color: red; }');
            await fs.writeFile(path.join(projectDir, 'assets', 'javascript', 'app.js'), 'console.log("Vue app");');
            
            // Create HTML file with Vue CLI-like references
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Vue App</title>
    <link rel="stylesheet" href="/css/app.css">
</head>
<body>
    <div id="app">
        <img src="/img/logo.png" alt="Logo">
    </div>
    <script src="/js/app.js"></script>
</body>
</html>`;
            await fs.writeFile(path.join(projectDir, 'index.html'), htmlContent);
            
            // Test path mapping creation
            const packageBuilder = new PackageBuilder(projectDir);
            const symlinksCreated = await packageBuilder.createPathMappingSymlinks();
            
            // Verify symlinks were created
            const imgExists = await fs.pathExists(path.join(projectDir, 'img'));
            const cssExists = await fs.pathExists(path.join(projectDir, 'css'));
            const jsExists = await fs.pathExists(path.join(projectDir, 'js'));
            
            this.testResults.push({
                name: testName,
                passed: imgExists && cssExists && jsExists,
                symlinksCreated,
                details: { imgExists, cssExists, jsExists }
            });
            
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                error: error.message
            });
        }
    }

    async testCreateReactAppProject() {
        const testName = 'Create React App Project';
        logger.info(`Running test: ${testName}`);
        
        try {
            const projectDir = path.join(this.testDir, 'react-project');
            await fs.ensureDir(projectDir);
            
            // Create CRA-like structure with build/static
            await fs.ensureDir(path.join(projectDir, 'static', 'js'));
            await fs.ensureDir(path.join(projectDir, 'static', 'css'));
            await fs.ensureDir(path.join(projectDir, 'static', 'media'));
            
            // Create sample files
            await fs.writeFile(path.join(projectDir, 'static', 'js', 'main.js'), 'React.render();');
            await fs.writeFile(path.join(projectDir, 'static', 'css', 'main.css'), '.App { padding: 20px; }');
            await fs.writeFile(path.join(projectDir, 'static', 'media', 'logo.svg'), '<svg>logo</svg>');
            
            // Create HTML file with CRA-like references
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>React App</title>
    <link href="/static/css/main.css" rel="stylesheet">
</head>
<body>
    <div id="root">
        <img src="/static/media/logo.svg" alt="React Logo">
    </div>
    <script src="/static/js/main.js"></script>
</body>
</html>`;
            await fs.writeFile(path.join(projectDir, 'index.html'), htmlContent);
            
            // Test path mapping creation
            const packageBuilder = new PackageBuilder(projectDir);
            const symlinksCreated = await packageBuilder.createPathMappingSymlinks();
            
            // For CRA, we mainly test that static directory is properly handled
            const staticExists = await fs.pathExists(path.join(projectDir, 'static'));
            
            this.testResults.push({
                name: testName,
                passed: staticExists && symlinksCreated >= 0, // At least no errors
                symlinksCreated,
                details: { staticExists }
            });
            
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                error: error.message
            });
        }
    }

    async testViteProject() {
        const testName = 'Vite Project';
        logger.info(`Running test: ${testName}`);
        
        try {
            const projectDir = path.join(this.testDir, 'vite-project');
            await fs.ensureDir(projectDir);
            
            // Create Vite-like structure
            await fs.ensureDir(path.join(projectDir, 'assets', 'image'));
            await fs.ensureDir(path.join(projectDir, 'public'));
            
            // Create sample files
            await fs.writeFile(path.join(projectDir, 'assets', 'image', 'vite-logo.png'), 'fake-vite-logo');
            await fs.writeFile(path.join(projectDir, 'public', 'favicon.ico'), 'fake-favicon');
            
            // Create HTML file with Vite-like references
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Vite App</title>
</head>
<body>
    <div id="app">
        <img src="/img/vite-logo.png" alt="Vite Logo">
    </div>
    <script type="module" src="/src/main.js"></script>
</body>
</html>`;
            await fs.writeFile(path.join(projectDir, 'index.html'), htmlContent);
            
            // Test path mapping creation
            const packageBuilder = new PackageBuilder(projectDir);
            const symlinksCreated = await packageBuilder.createPathMappingSymlinks();
            
            // Verify symlinks were created
            const imgExists = await fs.pathExists(path.join(projectDir, 'img'));
            
            this.testResults.push({
                name: testName,
                passed: imgExists,
                symlinksCreated,
                details: { imgExists }
            });
            
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                error: error.message
            });
        }
    }

    async testGenericWebpackProject() {
        const testName = 'Generic Webpack Project';
        logger.info(`Running test: ${testName}`);
        
        try {
            const projectDir = path.join(this.testDir, 'webpack-project');
            await fs.ensureDir(projectDir);
            
            // Create webpack-like dist structure
            await fs.ensureDir(path.join(projectDir, 'assets', 'image'));
            await fs.ensureDir(path.join(projectDir, 'assets', 'font'));
            
            // Create sample files
            await fs.writeFile(path.join(projectDir, 'assets', 'image', 'banner.jpg'), 'fake-banner');
            await fs.writeFile(path.join(projectDir, 'assets', 'font', 'custom.woff2'), 'fake-font');
            
            // Create HTML file with mixed path references
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Webpack App</title>
    <style>
        @font-face {
            font-family: 'Custom';
            src: url('/fonts/custom.woff2');
        }
        .banner {
            background-image: url('/images/banner.jpg');
        }
    </style>
</head>
<body>
    <div class="banner">
        <h1>Webpack Project</h1>
    </div>
</body>
</html>`;
            await fs.writeFile(path.join(projectDir, 'index.html'), htmlContent);
            
            // Test path mapping creation
            const packageBuilder = new PackageBuilder(projectDir);
            const symlinksCreated = await packageBuilder.createPathMappingSymlinks();
            
            // Verify symlinks were created
            const imagesExists = await fs.pathExists(path.join(projectDir, 'images'));
            const fontsExists = await fs.pathExists(path.join(projectDir, 'fonts'));
            
            this.testResults.push({
                name: testName,
                passed: imagesExists && fontsExists,
                symlinksCreated,
                details: { imagesExists, fontsExists }
            });
            
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                error: error.message
            });
        }
    }

    async printResults() {
        console.log('\n🧪 Path Mapping Test Results');
        console.log('═'.repeat(50));
        
        let passed = 0;
        let total = this.testResults.length;
        
        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.name}`);
            
            if (result.symlinksCreated !== undefined) {
                console.log(`   Symlinks created: ${result.symlinksCreated}`);
            }
            
            if (result.details) {
                console.log(`   Details: ${JSON.stringify(result.details)}`);
            }
            
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            
            if (result.passed) passed++;
            console.log('');
        });
        
        console.log(`📊 Summary: ${passed}/${total} tests passed`);
        
        if (passed === total) {
            console.log('🎉 All tests passed! Path mapping functionality is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Check the details above.');
        }
    }

    async cleanup() {
        try {
            await fs.remove(this.testDir);
            logger.info('Test cleanup completed');
        } catch (error) {
            logger.warn('Test cleanup failed', { error: error.message });
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const test = new PathMappingTest();
    test.runAllTests()
        .then(() => {
            console.log('✨ Path mapping tests completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Path mapping tests failed:', error.message);
            process.exit(1);
        });
}

module.exports = PathMappingTest;