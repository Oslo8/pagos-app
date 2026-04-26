const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// En producción usa DB_PATH del entorno, en local usa el directorio del backend
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite');
console.log(`Using database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

const SEED_TEMPLATES = [
    { name: 'Celulares Bitel Familia', code: '',          locationGroup: 'Casa Ayacucho', day: 1  },
    { name: 'Pagos Internet Papá',     code: '',          locationGroup: 'Casa Ayacucho', day: 8  },
    { name: '2do Piso Agua Ayacucho',  code: '70042090',  locationGroup: 'Casa Ayacucho', day: 7  },
    { name: 'Luz Ayacucho 2do Piso',   code: '76773975',  locationGroup: 'Casa Ayacucho', day: 10 },
    { name: 'Internet Tienda (Yape)',   code: '921627689', locationGroup: 'Star Music',    day: 29 },
    { name: 'Luz Starmusic',           code: '83751922',  locationGroup: 'Star Music',    day: 8  },
    { name: 'Agua Starmusic',          code: '20067272',  locationGroup: 'Star Music',    day: 10 },
    { name: 'Luz Music Pro',           code: '65602728',  locationGroup: 'Star Music',    day: 7  },
    { name: 'Internet Casa Lima',      code: '',          locationGroup: 'Leo y Sebas',   day: 25 },
];

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT, name TEXT, locationGroup TEXT,
            dueDate TEXT, amount REAL, paid BOOLEAN DEFAULT 0, observations TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY, phone TEXT, reimbursed REAL DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS service_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, code TEXT DEFAULT '',
            locationGroup TEXT DEFAULT 'Casa Ayacucho', day INTEGER NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS monthly_archives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL, month INTEGER NOT NULL,
            total_paid REAL DEFAULT 0, reimbursed REAL DEFAULT 0,
            services_json TEXT DEFAULT '[]',
            closed_at TEXT DEFAULT (datetime('now','localtime'))
        )`, () => {
            db.get('SELECT COUNT(*) as cnt FROM service_templates', [], (err, row) => {
                if (!err && row.cnt === 0) {
                    const stmt = db.prepare(
                        'INSERT INTO service_templates (name, code, locationGroup, day) VALUES (?, ?, ?, ?)'
                    );
                    SEED_TEMPLATES.forEach(t => stmt.run(t.name, t.code, t.locationGroup, t.day));
                    stmt.finalize(() => console.log('Service templates seeded.'));
                }
            });
        });

        db.run('INSERT OR IGNORE INTO settings (id, phone, reimbursed) VALUES (1, \'\', 0)');
        db.run('ALTER TABLE settings ADD COLUMN reimbursed REAL DEFAULT 0', () => {});
        db.run('', () => console.log('Database tables ready.'));
    });
}

module.exports = db;
