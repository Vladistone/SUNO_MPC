const fs = require('fs');
const path = require('path');

function parseGearMatrix(filePath) {
    const matrix = {};
    
    // Читаем файл в UTF-8
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);

    for (let line of lines) {
        // Убираем лишние пробелы по краям и отсекаем комментарии
        line = line.trim();
        if (!line || line.startsWith('#')) continue;

        // Разделяем строго по знаку табуляции (TAB)
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const key = parts[0].trim();
        let value = parts.slice(1).join('\t').trim(); // Собираем остаток, если внутри были ТАБы

        // --- ТИПИЗАЦИЯ ДАННЫХ ДЛЯ JS ENGINE ---
        
        // 1. Булевы значения
        if (value.toLowerCase() === 'true') {
            value = true;
        } else if (value.toLowerCase() === 'false') {
            value = false;
        } 
        // 2. Отсутствие параметра (Not Available)
        else if (value === 'NA' || value === 'none' || value === 'null') {
            value = null;
        } 
        // 3. Числа (Integer / Float)
        else if (!isNaN(value) && value !== '') {
            value = Number(value);
        } 
        // 4. Массивы (если данные разделены запятыми, кроме строк типа шорткатов "Shift+S")
        else if (value.includes(',') && !value.includes('+')) {
            value = value.split(',').map(item => item.trim());
        }

        matrix[key] = value;
    }

    return matrix;
}

// Пример использования:
try {
    const configPath = path.join(__dirname, 'nucleus2_matrix.txt');
    const deviceJSON = parseGearMatrix(configPath);
    
    console.log("=== Успешно спарсено в JSON для Suno Studio ===");
    console.log(JSON.stringify(deviceJSON, null, 2));
    
    // Теперь этот объект deviceJSON можно отдавать на фронтенд через HTTP API (Express/Fastify)
} catch (err) {
    console.error("Ошибка парсинга GMT:", err.message);
}
