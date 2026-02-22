let allEvents = [];
let currentTab = 'all'; // 'all' or 'saved'

function getSiteLabel(link) {
    if (!link || link === '#') return '';
    try {
        const host = new URL(link).hostname.toLowerCase().replace(/^www\./, '');
        if (host.endsWith('sympla.queue-it.net')) return 'sympla.com.br';
        return host;
    } catch (err) {
        return '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchEvents();
});

// Fetch events from API
async function fetchEvents() {
    try {
        const res = await fetch('/api/events');
        allEvents = await res.json();
        renderEvents();
    } catch (err) {
        console.error('Error fetching events:', err);
    }
}

// Trigger Backend Scraper
async function syncEvents() {
    const btn = document.getElementById('btn-sync');
    btn.innerText = 'Sincronizando...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/scrape', { method: 'POST' });
        const data = await res.json();
        allEvents = data.data; // Update local list
        renderEvents();
        alert('Novos eventos encontrados!');
    } catch (err) {
        alert('Erro ao sincronizar.');
    } finally {
        btn.innerText = '🔄 Sincronizar Novos Eventos';
        btn.disabled = false;
    }
}

// Toggle Save Interest
async function toggleSave(id) {
    try {
        const res = await fetch(`/api/events/${id}/toggle-save`, { method: 'POST' });
        if (res.ok) {
            // Update local state optimized
            const event = allEvents.find(e => e.id === id);
            if (event) event.saved = !event.saved;
            renderEvents();
        }
    } catch (err) {
        console.error('Error saving:', err);
    }
}

// Render Logic
function renderEvents() {
    const grid = document.getElementById('events-grid');
    const countLabel = document.getElementById('events-count');
    grid.innerHTML = '';

    // Filter Logic
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const typeFilter = document.getElementById('filter-type').value;
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;

    let filtered = allEvents.filter(e => {
        // Tab Filter
        if (currentTab === 'saved' && !e.saved) return false;

        // Search Filter
        const matchesSearch = e.nome.toLowerCase().includes(searchTerm) ||
            e.local.toLowerCase().includes(searchTerm);

        // Type Filter
        const matchesType = typeFilter ? e.tipo.includes(typeFilter) : true;

        // Date Filter (Basic string comparison for MVP, ideally use Date objects)
        // Converting dd-mm-yyyy to yyyy-mm-dd for string comparison
        const [d, m, y] = e.data.split('-');
        const eventDateISO = `${y}-${m}-${d}`;

        const matchesStart = dateStart ? eventDateISO >= dateStart : true;
        const matchesEnd = dateEnd ? eventDateISO <= dateEnd : true;

        return matchesSearch && matchesType && matchesStart && matchesEnd;
    });

    // Sort by date ascending (dd-mm-yyyy -> Date)
    filtered.sort((a, b) => {
        const [da, ma, ya] = a.data.split('-').map(Number);
        const [db, mb, yb] = b.data.split('-').map(Number);
        const dateA = new Date(ya, ma - 1, da);
        const dateB = new Date(yb, mb - 1, db);
        return dateA - dateB;
    });

    if (filtered.length === 0) {
        if (countLabel) countLabel.innerText = '0 eventos na página';
        grid.innerHTML = '<p>Nenhum evento encontrado.</p>';
        return;
    }

    if (countLabel) {
        countLabel.innerText = `${filtered.length} evento${filtered.length > 1 ? 's' : ''} na página`;
    }

    filtered.forEach(e => {
        const siteLabel = getSiteLabel(e.link);
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <div class="card-body">
                <div class="card-header">
                    <span class="event-date">${e.data}</span>
                    <span class="tag">${e.tipo.split('|')[0]}</span>
                </div>
                <h3 class="card-title">${e.nome}</h3>
                <div class="card-info">📍 ${e.local} | 🕒 ${e.horario}</div>
                <!-- Linha de preco desabilitada temporariamente -->
                <!-- <div class="card-info">💰 ${e.gratuito ? 'Gratuito' : 'Pago'}</div> -->
                
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    ${e.link && e.link !== '#' ? `<a href="${e.link}" target="_blank" class="btn-link">Ver mais: ${siteLabel || 'site'}</a>` : ''}
                </div>

                <p class="card-desc">${e.descricao}</p>
            </div>
            <div class="card-footer">
                <button class="btn-save ${e.saved ? 'saved' : ''}" onclick="toggleSave('${e.id}')">
                    ${e.saved ? '❤️ Salvo' : '🤍 Salvar'}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function toggleFilters() {
    const menu = document.getElementById('filter-menu');
    menu.classList.toggle('open');
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderEvents();
}

function applyFilters() {
    renderEvents();
}

