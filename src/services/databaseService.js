const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { isBefore, startOfDay } = require('date-fns');

const CSV_PATH = path.join(__dirname, '../../data/events.csv');

// Garante que a pasta data existe
if (!fs.existsSync(path.dirname(CSV_PATH))) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
}

// Configuração dos cabeçalhos do CSV
const csvWriter = createCsvWriter({
    path: CSV_PATH,
    header: [
        { id: 'id', title: 'Id' },
        { id: 'nome', title: 'Nome' },
        { id: 'descricao', title: 'Descricao' },
        { id: 'data', title: 'Data' },
        { id: 'local', title: 'Local' },
        { id: 'horario', title: 'Horario' },
        { id: 'gratuito', title: 'Gratuito' },
        { id: 'tipo', title: 'Tipo' },
        { id: 'link', title: 'Link' },
        { id: 'saved', title: 'Saved' }
    ]
});

/**
 * Lê todos os eventos do CSV.
 */
const readEvents = () => {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString();
        const results = [];
        if (!fs.existsSync(CSV_PATH)) {
            console.log(`[${timestamp}] 📝 CSV file doesn't exist, creating empty one...`);
            // Se não existe arquivo, cria um vazio e retorna lista vazia
            csvWriter.writeRecords([]).then(() => resolve([]));
            return;
        }

        fs.createReadStream(CSV_PATH)
            .pipe(csv({ mapHeaders: ({ header }) => header.toLowerCase() }))
            .on('data', (data) => {
                // Converte strings 'true'/'false' de volta para booleanos
                data.saved = data.saved === 'true';
                data.gratuito = data.gratuito === 'true';
                results.push(data);
            })
            .on('end', () => {
                const timestamp = new Date().toISOString();
                console.log(`[${timestamp}] 📖 Read ${results.length} events from CSV`);
                resolve(results);
            })
            .on('error', (error) => {
                const timestamp = new Date().toISOString();
                console.error(`[${timestamp}] ❌ Error reading CSV:`, error.message);
                reject(error);
            });
    });
};

/**
 * Salva a lista de eventos, sobrescrevendo o arquivo.
 * Inclui proteção contra dados corrompidos (Guard Clauses).
 */
const saveEvents = async (events) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 💾 Saving ${events.length} events to CSV...`);
    const today = startOfDay(new Date());

    const validEvents = events.filter(event => {
        // 1. SEGURANÇA: Se o evento for nulo ou não tiver data, ignora
        if (!event || !event.data || typeof event.data !== 'string') {
            return false;
        }

        try {
            // Espera formato dd-mm-yyyy
            const parts = event.data.split('-');

            // 2. SEGURANÇA: Garante que temos dia, mês e ano
            if (parts.length !== 3) return false;

            const [day, month, year] = parts;
            // Helper para criar data em fuso local (00:00:00)
            // O construtor new Date(ano, mes-1, dia) usa o fuso local do sistema
            const eventDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

            // Se a data for inválida (ex: 30 de fevereiro), ignora
            if (isNaN(eventDate)) return false;

            // Remove se a data já passou (Regra do seu rascunho)
            return !isBefore(eventDate, today);
        } catch (err) {
            console.warn(`Skipping invalid event data: ${event.nome}`);
            return false;
        }
    });

    // Escreve apenas os eventos válidos no CSV
    await csvWriter.writeRecords(validEvents);
    const timestamp2 = new Date().toISOString();
    console.log(`[${timestamp2}] ✅ Saved ${validEvents.length} valid events (filtered ${events.length - validEvents.length} invalid)`);
};

// ESTA É A LINHA IMPORTANTE QUE ESTAVA FALTANDO OU COM PROBLEMA
module.exports = { readEvents, saveEvents };