const express = require('express');
const cors = require('cors');
const path = require('path');
const eventController = require('./controllers/eventController');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware para log de requisições
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Routes
app.get('/api/events', eventController.getEvents);
app.post('/api/scrape', eventController.triggerScrape);
app.post('/api/events/:id/toggle-save', eventController.toggleSave);

app.listen(PORT, () => {
    const timestamp = new Date().toISOString();
    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`[${timestamp}] ✅ Server running on http://localhost:${PORT}`);
    console.log(`[${timestamp}] 🎯 Environment: NodeJS MVP for Recife Events`);
    console.log(`[${timestamp}] 📍 Recife | Events Aggregator`);
    console.log(`═══════════════════════════════════════════════\n`);
});