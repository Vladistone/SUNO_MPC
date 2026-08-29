async loadSelectors(version = 'v1') {
    try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        
        const configPath = path.resolve(__dirname, `../config/selectors_${version}.json`);
        const data = await fs.readFile(configPath, 'utf8');
        this.selectors = JSON.parse(data);
        
        this.logger.log('✅ Селекторы загружены');
        return this.selectors;
    } catch (error) {
        this.logger.error('❌ Ошибка загрузки селекторов:', error.message);
        throw error;
    }
}
