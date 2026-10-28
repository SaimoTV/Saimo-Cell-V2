#!/usr/bin/env node
/**
 * Script para dividir arquivos JSON grandes em partes menores
 * Uso: node scripts/split-large-json.cjs <input.json> <output-prefix> <max-items>
 * Exemplo: node scripts/split-large-json.cjs data/acao.json data/acao-part 500
 * 
 * Isso criará: acao-part-1.json, acao-part-2.json, etc. com no máximo 500 itens cada
 */

const fs = require('fs');
const path = require('path');

const MAX_ITEMS_DEFAULT = 500;
const TARGET_SIZE_MB = 15; // Alvo de 15MB por arquivo

async function splitJsonFile(inputPath, outputPrefix, maxItems = MAX_ITEMS_DEFAULT) {
    console.log(`📂 Lendo arquivo: ${inputPath}`);

    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Arquivo não encontrado: ${inputPath}`);
        process.exit(1);
    }

    const stats = fs.statSync(inputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📊 Tamanho do arquivo: ${sizeMB}MB`);

    // Ler arquivo
    console.log('⏳ Carregando JSON...');
    const content = fs.readFileSync(inputPath, 'utf-8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
        console.error('❌ O arquivo JSON deve conter um array');
        process.exit(1);
    }

    console.log(`📝 Total de itens: ${data.length}`);

    // Calcular quantas partes criar
    const numParts = Math.ceil(data.length / maxItems);
    console.log(`✂️ Dividindo em ${numParts} partes com até ${maxItems} itens cada`);

    // Criar diretório de saída se não existir
    const outputDir = path.dirname(outputPrefix);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const createdFiles = [];

    for (let i = 0; i < numParts; i++) {
        const start = i * maxItems;
        const end = Math.min(start + maxItems, data.length);
        const chunk = data.slice(start, end);

        const outputPath = `${outputPrefix}-${i + 1}.json`;

        console.log(`💾 Salvando parte ${i + 1}: ${chunk.length} itens -> ${outputPath}`);

        fs.writeFileSync(outputPath, JSON.stringify(chunk, null, 0));

        const newStats = fs.statSync(outputPath);
        const newSizeMB = (newStats.size / 1024 / 1024).toFixed(2);
        console.log(`   📦 Tamanho: ${newSizeMB}MB`);

        createdFiles.push({
            path: outputPath,
            items: chunk.length,
            sizeMB: parseFloat(newSizeMB)
        });
    }

    console.log('\n✅ Divisão concluída!');
    console.log('📋 Arquivos criados:');
    createdFiles.forEach(f => {
        console.log(`   - ${f.path} (${f.items} itens, ${f.sizeMB}MB)`);
    });

    // Gerar código para DOWNLOAD_CATEGORIES
    console.log('\n📝 Adicione estas categorias ao downloadService.ts:');
    const baseName = path.basename(outputPrefix);
    createdFiles.forEach((f, i) => {
        console.log(`  { id: '${baseName}-${i + 1}', name: '${baseName.charAt(0).toUpperCase() + baseName.slice(1)} Pt.${i + 1}', sizeMB: ${f.sizeMB}, canDownload: true },`);
    });

    return createdFiles;
}

// Main
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Uso: node split-large-json.cjs <input.json> <output-prefix> [max-items]');
    console.log('Exemplo: node split-large-json.cjs data/acao.json data/acao-part 500');
    process.exit(1);
}

const inputPath = args[0];
const outputPrefix = args[1];
const maxItems = parseInt(args[2]) || MAX_ITEMS_DEFAULT;

splitJsonFile(inputPath, outputPrefix, maxItems).catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
});
