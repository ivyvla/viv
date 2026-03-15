const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // Serve static files from the root

// Setup Multer for picture uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'pictures', 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// File paths
const dataFile = path.join(__dirname, 'data.json');
const statsFile = path.join(__dirname, 'stats.json');

// Helper functions
const readData = (file) => {
    try {
        if (!fs.existsSync(file)) return {};
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading data:', err);
        return {};
    }
};

const writeData = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing data:', err);
    }
};

// --- ENDPOINTS ---

// Get main website data (text edits and picture sources)
app.get('/api/data', (req, res) => {
    const data = readData(dataFile);
    res.json(data);
});

// Save edits (requires basic auth or simply unprotected for this demo, you can add auth later)
app.post('/api/data', (req, res) => {
    const updates = req.body;
    let data = readData(dataFile);
    data = { ...data, ...updates };
    writeData(dataFile, data);
    res.json({ success: true, message: 'Data saved successfully' });
});

// Upload a single picture and return its path
app.post('/api/upload', upload.single('picture'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const relativePath = 'pictures/uploads/' + req.file.filename;
    res.json({ success: true, filePath: relativePath });
});

// Track unique visitors with Geography (using ip-api.com)
app.get('/api/track', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const date = new Date().toISOString().split('T')[0];
    
    let stats = readData(statsFile);
    if (!stats.totalVisits) stats.totalVisits = 0;
    if (!stats.visitors) stats.visitors = [];
    if (!stats.dailyVisits) stats.dailyVisits = {};
    if (!stats.locations) stats.locations = {};

    stats.totalVisits++;
    
    if (!stats.visitors.includes(ip)) {
        stats.visitors.push(ip);
        // Track Geography only for unique visitors
        try {
            // For local testing ::1 or 127.0.0.1 won't return a valid location from the API
            const geoRes = await fetch(`http://ip-api.com/json/${ip}`);
            const geoData = await geoRes.json();
            
            let locString = 'Unknown';
            if (geoData.status === 'success') {
                locString = `${geoData.city}, ${geoData.country}`;
            } else if (ip === '::1' || ip.includes('127.0.0.1')) {
                locString = 'Localhost (Testing)';
            }
            
            if (!stats.locations[locString]) stats.locations[locString] = 0;
            stats.locations[locString]++;

        } catch (e) {
            console.log("Geography API error", e);
        }
    }

    if (!stats.dailyVisits[date]) stats.dailyVisits[date] = 0;
    stats.dailyVisits[date]++;

    writeData(statsFile, stats);
    res.json({ success: true });
});

// Track interactions (popularity)
app.post('/api/action', (req, res) => {
    const { actionId } = req.body;
    if (!actionId) return res.status(400).json({ success: false });

    let stats = readData(statsFile);
    if (!stats.popularItems) stats.popularItems = {};
    
    if (!stats.popularItems[actionId]) stats.popularItems[actionId] = 0;
    stats.popularItems[actionId]++;

    writeData(statsFile, stats);
    res.json({ success: true });
});

// Get admin stats combined
app.get('/api/stats', (req, res) => {
    const stats = readData(statsFile);
    res.json({
        totalVisits: stats.totalVisits || 0,
        uniqueVisitors: stats.visitors ? stats.visitors.length : 0,
        dailyVisits: stats.dailyVisits || {},
        locations: stats.locations || {},
        popularItems: stats.popularItems || {}
    });
});

// Handle incoming contact messages
const messagesFile = path.join(__dirname, 'messages.json');
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'All fields required.' });
    }

    const newMessage = {
        id: Date.now(),
        date: new Date().toISOString(),
        name,
        email,
        message,
        read: false
    };

    let messages = readData(messagesFile);
    if (!Array.isArray(messages)) messages = [];
    
    messages.push(newMessage);
    writeData(messagesFile, messages);
    
    res.json({ success: true, message: 'Message sent successfully.' });
});

// Get inbox messages for admin
app.get('/api/messages', (req, res) => {
    const messages = readData(messagesFile);
    res.json(Array.isArray(messages) ? messages : []);
});

// Simple Login (Hardcoded for demo: admin / ivy)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'ivy') {
        res.json({ success: true, token: 'fake-jwt-token-for-demo' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
