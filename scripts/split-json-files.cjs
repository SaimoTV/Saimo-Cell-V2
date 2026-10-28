#!/usr/bin/env node
/**
 * Script para dividir arquivos JSON grandes em partes menores
 * 
 * COMO USAR:
 * 1. Clone seu repositório free-tv
 * 2. Copie este script para a raiz do repositório
 * 3. Execute: node split-json-files.cjs
 * 4. Faça commit e push das mudanças
 * 
 * O script vai:
 * - Encontrar todos os arquivos JSON em public/data/enriched/
 * - Dividir arquivos > 20MB em partes de 15MB cada
 * - Criar arquivos como: acao-part-1.json, acao-part-2.json, etc.
 */

const fs = require('fs');
const path = require('path');

const ENRICHED_DIR = path.join(__dirname, 'public', 'data', 'enriched');
const MAX_SIZE_MB = 20; // Arquivos maiores que isso serão divididos
const TARGET_SIZE_MB = 15; // Cada parte terá aproximadamente esse tamanho
const ITEMS_PER_PART = 300; // Aproximadamente 300 itens por arquivo de 15MB

async function main() {
    console.log('🔍 Procurando arquivos JSON grandes...\n');

    if (!fs.existsSync(ENRICHED_DIR)) {
        console.error(`❌ Diretório não encontrado: ${ENRICHED_DIR}`);
        console.log('\nCertifique-se de executar este script na raiz do repositório free-tv');
        process.exit(1);
    }

    const files = fs.readdirSync(ENRICHED_DIR).filter(f => f.endsWith('.json'));
    const largeFiles = [];

    // Identificar arquivos grandes
    for (const file of files) {
        const filePath = path.join(ENRICHED_DIR, file);
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > MAX_SIZE_MB) {
            largeFiles.push({ file, path: filePath, sizeMB });
        }
    }

    if (largeFiles.length === 0) {
        console.log('✅ Nenhum arquivo grande encontrado (todos < 20MB)');
        return;
    }

    console.log(`📦 Encontrados ${largeFiles.length} arquivos grandes:\n`);
    largeFiles.forEach(f => console.log(`  - ${f.file}: ${f.sizeMB.toFixed(1)}MB`));
    console.log('');

    // Dividir cada arquivo grande
    for (const { file, path: filePath, sizeMB } of largeFiles) {
        console.log(`\n📂 Processando: ${file} (${sizeMB.toFixed(1)}MB)`);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);

            if (!Array.isArray(data)) {
                console.log(`  ⚠️ Não é um array, pulando...`);
                continue;
            }

            const baseName = file.replace('.json', '');
            const numParts = Math.ceil(data.length / ITEMS_PER_PART);

            console.log(`  📊 Total de itens: ${data.length}`);
            console.log(`  ✂️ Dividindo em ${numParts} partes...`);

            const createdFiles = [];

            for (let i = 0; i < numParts; i++) {
                const start = i * ITEMS_PER_PART;
                const end = Math.min(start + ITEMS_PER_PART, data.length);
                const chunk = data.slice(start, end);

                const partFileName = `${baseName}-part-${i + 1}.json`;
                const partPath = path.join(ENRICHED_DIR, partFileName);

                fs.writeFileSync(partPath, JSON.stringify(chunk));

                const partStats = fs.statSync(partPath);
                const partSizeMB = partStats.size / (1024 * 1024);

                console.log(`  💾 Criado: ${partFileName} (${chunk.length} itens, ${partSizeMB.toFixed(1)}MB)`);
                createdFiles.push({ name: partFileName, items: chunk.length, sizeMB: partSizeMB });
            }

            // Opcional: renomear arquivo original para backup
            const backupPath = filePath.replace('.json', '.original.json');
            fs.renameSync(filePath, backupPath);
            console.log(`  📁 Original movido para: ${baseName}.original.json`);

        } catch (e) {
            console.error(`  ❌ Erro: ${e.message}`);
        }
    }

    console.log('\n✅ Divisão concluída!');
    console.log('\n📝 Próximos passos:');
    console.log('1. Verifique os arquivos criados em public/data/enriched/');
    console.log('2. Faça commit e push das mudanças');
    console.log('3. Atualize o downloadService.ts no app para usar os novos arquivos');
}

main().catch(console.error);
