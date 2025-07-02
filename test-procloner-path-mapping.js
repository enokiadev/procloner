const fs = require('fs-extra');
const path = require('path');
const SmartCrawler = require('./server/crawlers/SmartCrawler');
const HtmlProcessor = require('./server/utils/HtmlProcessor');
const { logger } = require('./server/utils/logger');

// Test class for ProCloner's intelligent path mapping during cloning
class ProClonerPathMappingTest {
    constructor() {
        this.testDir = path.join(__dirname, 'test-procloner-output');
        this.testResults = [];
    }

    async runAllTests() {
        logger.info('Starting ProCloner path mapping tests');
        
        try {
            await this.setupTestEnvironment();
            
            // Test the core path mapping logic
            await this.testHtmlProcessorPathMapping();
            await this.testSmartCrawlerAssetPaths();
            await this.testBuildToolDetection();
            
            await this.printResults();
            await this.cleanup();
            
        } catch (error) {
            logger.error('ProCloner test execution failed', { error: error.message });
            throw error;
        }
    }

    async setupTestEnvironment() {
        await fs.ensureDir(this.testDir);
        logger.info('ProCloner test environment set up', { testDir: this.testDir });
    }

    async testHtmlProcessorPathMapping() {
        const testName = 'HtmlProcessor Path Mapping Logic';
        logger.info(`Running test: ${testName}`);
        
        try {
            // Test Vue CLI mapping strategy
            const vueProjectDir = path.join(this.testDir, 'vue-test');
            await fs.ensureDir(vueProjectDir);
            
            const vueBuildToolInfo = { tool: 'vue-cli', confidence: 0.9 };
            const discoveredAssets = new Map();
            
            // Mock asset
            const testAsset = {
                url: 'https://example.com/some-deep-path/logo.png',
                type: 'image',
                downloaded: true,
                localPath: path.join(vueProjectDir, 'img', 'logo.png')
            };
            discoveredAssets.set(testAsset.url, testAsset);
            
            const htmlProcessor = new HtmlProcessor(vueProjectDir, discoveredAssets, vueBuildToolInfo);
            
            // Test path mapping
            const expectedPath = htmlProcessor.getTargetAssetPath(testAsset.url, testAsset.type);
            const localPath = htmlProcessor.getLocalAssetPath(testAsset.url);
            
            const vueTestPassed = expectedPath === 'img/logo.png' && localPath === 'img/logo.png';
            
            // Test React CRA mapping strategy
            const reactBuildToolInfo = { tool: 'create-react-app', confidence: 0.9 };
            const reactProcessor = new HtmlProcessor(vueProjectDir, discoveredAssets, reactBuildToolInfo);
            
            const reactExpectedPath = reactProcessor.getTargetAssetPath(testAsset.url, testAsset.type);
            const reactTestPassed = reactExpectedPath === 'static/media/logo.png';
            
            // Test fallback strategy
            const unknownBuildToolInfo = { tool: 'unknown', confidence: 0.1 };
            const fallbackProcessor = new HtmlProcessor(vueProjectDir, discoveredAssets, unknownBuildToolInfo);
            
            const fallbackExpectedPath = fallbackProcessor.getTargetAssetPath(testAsset.url, testAsset.type);
            const fallbackTestPassed = fallbackExpectedPath.includes('logo.png');
            
            this.testResults.push({
                name: testName,
                passed: vueTestPassed && reactTestPassed && fallbackTestPassed,
                details: { 
                    vueMapping: expectedPath,
                    reactMapping: reactExpectedPath,
                    fallbackMapping: fallbackExpectedPath,
                    vueTestPassed,
                    reactTestPassed,
                    fallbackTestPassed
                }
            });
            
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                error: error.message
            });
        }
    }

    async testSmartCrawlerAssetPaths() {
        const testName = 'SmartCrawler Asset Path Intelligence';
        logger.info(`Running test: ${testName}`);
        
        try {
            const crawlerProjectDir = path.join(this.testDir, 'crawler-test');
            await fs.ensureDir(crawlerProjectDir);
            
            // Create a SmartCrawler instance
            const smartCrawler = new SmartCrawler({ outputDir: crawlerProjectDir });
            
            // Simulate detected build tool
            smartCrawler.detectedBuildTool = { tool: 'vue-cli', confidence: 0.9 };
            
            // Test asset path generation
            const mockAsset = { url: 'https://example.com/assets/logo.png', type: 'image' };
            const vueAssetPath = smartCrawler.getIntelligentAssetPath(mockAsset, 'logo.png');
            
            const expectedVuePath = path.join(crawlerProjectDir, 'img', 'logo.png');
            const vuePathCorrect = vueAssetPath === expectedVuePath;
            
            // Test with different build tool
            smartCrawler.detectedBuildTool = { tool: 'create-react-app', confidence: 0.9 };
            const reactAssetPath = smartCrawler.getIntelligentAssetPath(mockAsset, 'logo.png');
            
            const expectedReactPath = path.join(crawlerProjectDir, 'static', 'media', 'logo.png');
            const reactPathCorrect = reactAssetPath === expectedReactPath;
            
            // Test fallback behavior
            smartCrawler.detectedBuildTool = { tool: 'unknown', confidence: 0.1 };
            const fallbackAssetPath = smartCrawler.getIntelligentAssetPath(mockAsset, 'logo.png');
            
            const expectedFallbackPath = path.join(crawlerProjectDir, 'assets', 'image', 'logo.png');
            const fallbackPathCorrect = fallbackAssetPath === expectedFallbackPath;
            
            this.testResults.push({
                name: testName,
                passed: vuePathCorrect && reactPathCorrect && fallbackPathCorrect,
                details: { 
                    vueAssetPath: path.relative(crawlerProjectDir, vueAssetPath),
                    reactAssetPath: path.relative(crawlerProjectDir, reactAssetPath),
                    fallbackAssetPath: path.relative(crawlerProjectDir, fallbackAssetPath),
                    vuePathCorrect,
                    reactPathCorrect,
                    fallbackPathCorrect
                }
            });
            
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                error: error.message
            });
        }
    }

    async testBuildToolDetection() {
        const testName = 'Build Tool Detection Logic';
        logger.info(`Running test: ${testName}`);
        
        try {
            const crawlerProjectDir = path.join(this.testDir, 'detection-test');
            await fs.ensureDir(crawlerProjectDir);
            
            const smartCrawler = new SmartCrawler({ outputDir: crawlerProjectDir });
            
            // Test Vue.js detection
            const vueBuildInfo = {
                hasVue: true,
                hasReact: false,
                hasWebpack: false,
                hasVite: false,
                hasAngular: false,
                scriptSources: ['https://example.com/js/chunk-vendors.js', 'https://example.com/js/app.js']
            };
            
            const vueDetection = smartCrawler.analyzeBuildTool(vueBuildInfo);
            const vueDetectedCorrectly = vueDetection.tool === 'vue-cli' && vueDetection.confidence >= 0.8;
            
            // Test React detection
            const reactBuildInfo = {
                hasVue: false,
                hasReact: true,
                hasWebpack: false,
                hasVite: false,
                hasAngular: false,
                scriptSources: ['https://example.com/static/js/runtime-main.js', 'https://example.com/static/js/chunk.js']
            };
            
            const reactDetection = smartCrawler.analyzeBuildTool(reactBuildInfo);
            const reactDetectedCorrectly = reactDetection.tool === 'create-react-app' && reactDetection.confidence >= 0.8;
            
            // Test Vite detection (should override others due to high confidence)
            const viteBuildInfo = {
                hasVue: true, // Vite can build Vue apps
                hasReact: false,
                hasWebpack: false,
                hasVite: true,
                hasAngular: false,
                scriptSources: ['https://example.com/@vite/client', 'https://example.com/src/main.js?v=123']
            };
            
            const viteDetection = smartCrawler.analyzeBuildTool(viteBuildInfo);
            const viteDetectedCorrectly = viteDetection.tool === 'vite' && viteDetection.confidence >= 0.9;
            
            // Test unknown/fallback
            const unknownBuildInfo = {
                hasVue: false,
                hasReact: false,
                hasWebpack: false,
                hasVite: false,
                hasAngular: false,
                scriptSources: ['https://example.com/custom.js']
            };
            
            const unknownDetection = smartCrawler.analyzeBuildTool(unknownBuildInfo);
            const unknownHandledCorrectly = unknownDetection.tool === 'unknown' && unknownDetection.confidence === 0;
            
            this.testResults.push({
                name: testName,
                passed: vueDetectedCorrectly && reactDetectedCorrectly && viteDetectedCorrectly && unknownHandledCorrectly,
                details: { 
                    vueDetection,
                    reactDetection,
                    viteDetection,
                    unknownDetection,
                    vueDetectedCorrectly,
                    reactDetectedCorrectly,
                    viteDetectedCorrectly,
                    unknownHandledCorrectly
                }
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
        console.log('\n🔧 ProCloner Path Mapping Test Results');
        console.log('═'.repeat(60));
        
        let passed = 0;
        let total = this.testResults.length;
        
        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.name}`);
            
            if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    if (typeof value === 'object') {
                        console.log(`   ${key}: ${JSON.stringify(value)}`);
                    } else {
                        console.log(`   ${key}: ${value}`);
                    }
                });
            }
            
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            
            if (result.passed) passed++;
            console.log('');
        });
        
        console.log(`📊 Summary: ${passed}/${total} tests passed`);
        
        if (passed === total) {
            console.log('🎉 All ProCloner path mapping tests passed!');
            console.log('📝 ProCloner will now intelligently map asset paths during cloning.');
        } else {
            console.log('⚠️  Some ProCloner tests failed. Check the details above.');
        }
    }

    async cleanup() {
        try {
            await fs.remove(this.testDir);
            logger.info('ProCloner test cleanup completed');
        } catch (error) {
            logger.warn('ProCloner test cleanup failed', { error: error.message });
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const test = new ProClonerPathMappingTest();
    test.runAllTests()
        .then(() => {
            console.log('✨ ProCloner path mapping tests completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ ProCloner path mapping tests failed:', error.message);
            process.exit(1);
        });
}

module.exports = ProClonerPathMappingTest;