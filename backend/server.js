const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// Serve compiled frontend in production
if (IS_PROD) {
    app.use(express.static(path.join(__dirname, 'public')));
}

// --- WhatsApp Client Setup ---
let qrCodeData = null;
let isWhatsAppReady = false;

const whatsapp = new Client({
    authStrategy: new LocalAuth({
        dataPath: process.env.WA_AUTH_PATH || '.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

whatsapp.on('qr', (qr) => {
    console.log('WhatsApp QR Code generated.');
    qrCodeData = qr;
});

whatsapp.on('ready', () => {
    console.log('WhatsApp is ready!');
    isWhatsAppReady = true;
    qrCodeData = null;
});

whatsapp.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    isWhatsAppReady = false;
});

whatsapp.initialize();

// ─── Helper: close month (archive + reset) ───────────────────────────────────
function closeMonth(callback) {
    const now = new Date();
    // Archive previous month's data
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year  = prevMonth.getFullYear();
    const month = prevMonth.getMonth() + 1; // 1-12

    db.all('SELECT * FROM services WHERE paid = 1', [], (err, services) => {
        if (err) { if (callback) callback(err); return; }

        db.get('SELECT reimbursed FROM settings WHERE id = 1', [], (err2, settings) => {
            const reimbursed   = (settings && settings.reimbursed) || 0;
            const total_paid   = services.reduce((s, x) => s + x.amount, 0);
            const services_json = JSON.stringify(services);

            // Check if this month was already archived
            db.get('SELECT id FROM monthly_archives WHERE year = ? AND month = ?', [year, month], (err3, existing) => {
                const doReset = () => {
                    db.run('DELETE FROM services');
                    db.run('UPDATE settings SET reimbursed = 0 WHERE id = 1');
                    console.log(`Month ${month}/${year} closed. Paid: S/.${total_paid.toFixed(2)}`);
                    if (callback) callback(null, { year, month, total_paid, reimbursed });
                };

                if (existing) {
                    // Already archived this month, just reset
                    doReset();
                } else {
                    db.run(
                        'INSERT INTO monthly_archives (year, month, total_paid, reimbursed, services_json) VALUES (?, ?, ?, ?, ?)',
                        [year, month, total_paid, reimbursed, services_json],
                        (err4) => {
                            if (err4) console.error('Archive error:', err4);
                            doReset();
                        }
                    );
                }
            });
        });
    });
}

// ─── API: WhatsApp ────────────────────────────────────────────────────────────
app.get('/api/whatsapp/status', (req, res) => {
    res.json({ ready: isWhatsAppReady, qr: qrCodeData });
});

app.post('/api/whatsapp/test', async (req, res) => {
    const { phone } = req.body;
    if (!isWhatsAppReady) return res.status(400).json({ error: 'WhatsApp not ready' });
    try {
        const chatId = `${phone.replace(/\+/g, '')}@c.us`;
        await whatsapp.sendMessage(chatId, '¡Hola! Este es un mensaje de prueba de tu sistema de Pagos App. ✅');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/whatsapp/notify', async (req, res) => {
    if (!isWhatsAppReady) return res.status(400).json({ error: 'WhatsApp no está listo' });

    db.get('SELECT phone FROM settings WHERE id = 1', [], async (err, setting) => {
        if (err || !setting || !setting.phone)
            return res.status(400).json({ error: 'No hay número de teléfono configurado' });

        const targetPhone = `${setting.phone.replace(/\+/g, '')}@c.us`;

        db.all('SELECT * FROM services WHERE paid = 0', [], async (err2, services) => {
            if (err2) return res.status(500).json({ error: err2.message });

            const todayD = new Date(); todayD.setHours(0,0,0,0);
            let messages = [];

            for (let svc of services) {
                const due = new Date(svc.dueDate + 'T00:00:00');
                const diff = Math.ceil((due - todayD) / 86400000);
                if (diff === 3)       messages.push(`🟠 *Faltan 3 días* para pagar *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
                else if (diff === 1)  messages.push(`🔴 *Mañana vence* el pago de *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
                else if (diff === 0)  messages.push(`🔴 *HOY vence* el pago de *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
                else if (diff < 0)   messages.push(`🟣 *VENCIDO* el pago de *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
            }

            if (messages.length === 0)
                return res.json({ success: true, message: 'No hay pagos urgentes pendientes por el momento.' });

            const text = `⚠️ *Recordatorio de Pagos App*\n\n${messages.join('\n')}`;
            try {
                await whatsapp.sendMessage(targetPhone, text);
                res.json({ success: true, sent: messages.length });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
    });
});

// ─── API: Services ────────────────────────────────────────────────────────────
app.get('/api/services', (req, res) => {
    db.all('SELECT * FROM services ORDER BY locationGroup, name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/services', (req, res) => {
    const { code, name, locationGroup, dueDate, amount, observations, paid } = req.body;
    const q = 'INSERT INTO services (code, name, locationGroup, dueDate, amount, paid, observations) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.run(q, [code, name, locationGroup, dueDate, amount, paid ? 1 : 0, observations || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/services/:id', (req, res) => {
    const { code, name, locationGroup, dueDate, amount, paid, observations } = req.body;
    const q = 'UPDATE services SET code=?, name=?, locationGroup=?, dueDate=?, amount=?, paid=?, observations=? WHERE id=?';
    db.run(q, [code, name, locationGroup, dueDate, amount, paid ? 1 : 0, observations, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/services/:id', (req, res) => {
    db.run('DELETE FROM services WHERE id = ?', [parseInt(req.params.id, 10)], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// ─── API: Templates ───────────────────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
    db.all('SELECT * FROM service_templates ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/templates', (req, res) => {
    const { name, code, locationGroup, day } = req.body;
    db.run(
        'INSERT INTO service_templates (name, code, locationGroup, day) VALUES (?, ?, ?, ?)',
        [name, code || '', locationGroup || 'Casa Ayacucho', day],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.delete('/api/templates/:id', (req, res) => {
    db.run('DELETE FROM service_templates WHERE id = ?', [parseInt(req.params.id, 10)], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// ─── API: Settings ────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
    db.get('SELECT * FROM settings WHERE id = 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { phone: '', reimbursed: 0 });
    });
});

app.post('/api/settings', (req, res) => {
    const { phone, reimbursed } = req.body;
    db.get('SELECT id FROM settings WHERE id = 1', [], (err, row) => {
        const fields = [], vals = [];
        if (phone !== undefined)     { fields.push('phone = ?');      vals.push(phone); }
        if (reimbursed !== undefined) { fields.push('reimbursed = ?'); vals.push(reimbursed); }
        if (fields.length === 0) return res.json({ success: true });
        vals.push(1);
        if (row) {
            db.run(`UPDATE settings SET ${fields.join(', ')} WHERE id = ?`, vals);
        } else {
            db.run('INSERT INTO settings (id, phone, reimbursed) VALUES (1, ?, ?)', [phone || '', reimbursed || 0]);
        }
        res.json({ success: true });
    });
});

// ─── API: Monthly Archives ────────────────────────────────────────────────────
app.get('/api/archives', (req, res) => {
    db.all('SELECT * FROM monthly_archives ORDER BY year DESC, month DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse services_json
        const parsed = rows.map(r => ({ ...r, services: JSON.parse(r.services_json || '[]') }));
        res.json(parsed);
    });
});

// Manual close-month endpoint (triggered from UI)
app.post('/api/archives/close-month', (req, res) => {
    closeMonth((err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, ...result });
    });
});

// ─── Cron: Daily 9:00 AM — WhatsApp reminders ────────────────────────────────
cron.schedule('0 9 * * *', () => {
    console.log('Running daily payment check...');
    if (!isWhatsAppReady) return;

    db.get('SELECT phone FROM settings WHERE id = 1', [], (err, setting) => {
        if (err || !setting || !setting.phone) return;
        const target = `${setting.phone.replace(/\+/g, '')}@c.us`;

        db.all('SELECT * FROM services WHERE paid = 0', [], async (err2, services) => {
            if (err2) return;
            const todayD = new Date(); todayD.setHours(0,0,0,0);
            let messages = [];

            for (let svc of services) {
                const due  = new Date(svc.dueDate + 'T00:00:00');
                const diff = Math.ceil((due - todayD) / 86400000);
                if (diff === 3)      messages.push(`🟠 *Faltan 3 días* para pagar *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
                else if (diff === 1) messages.push(`🔴 *Mañana vence* el pago de *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
                else if (diff === 0) messages.push(`🔴 *HOY vence* el pago de *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
                else if (diff < 0)  messages.push(`🟣 *VENCIDO* el pago de *${svc.name}* (S/.${svc.amount.toFixed(2)})`);
            }

            if (messages.length > 0) {
                try {
                    await whatsapp.sendMessage(target, `⚠️ *Recordatorio de Pagos App*\n\n${messages.join('\n')}`);
                } catch(e) { console.error('WA notify error', e); }
            }
        });
    });
});

// ─── Cron: 1st of every month at 00:01 — auto close month ───────────────────
cron.schedule('1 0 1 * *', () => {
    console.log('Auto-closing month...');
    closeMonth((err, result) => {
        if (err) return console.error('Auto-close month error:', err);
        console.log('Month auto-closed:', result);
    });
});

// ─── SPA catch-all (must be AFTER all API routes) ────────────────────────────
if (IS_PROD) {
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
