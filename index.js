import 'dotenv/config';
import mineflayer from 'mineflayer';
import { readFileSync, existsSync } from 'fs';
import express from 'express';

// ==================== ⚙️ CONFIGURATION ====================
const CONFIG = {
    HOST: process.env.MC_HOST || "process.env.MC_HOST",
    PORT: process.env.MC_PORT ? Number(process.env.MC_PORT) : null,
    MC_PASSWORD: process.env.MC_PASSWORD || "Gian2342341",
    BOT_PREFIX: process.env.BOT_PREFIX || "Spikelol",
    MAX_BOTS: process.env.MAX_BOTS ? Number(process.env.MAX_BOTS) : 4,
    VERSION: process.env.MC_VERSION || "1.20.1",
    SPAM_INTERVAL: 1500,
    WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || "" // Yahan webhook URL aayega
};

// ==================== 🌐 Express Uptime Server ====================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.status(200).send('⚡ Spike.lol Bot Webhook Mode is Live!');
});

app.listen(PORT, () => {
    console.log(`[HTTP Server] Listening on port ${PORT}`);
});

setInterval(() => {
    console.log(`[HEARTBEAT] Service active. Uptime: ${Math.floor(process.uptime())}s`);
}, 45000);
// ===================================================================================

let bots = [];
let isRunning = true;

// 🔔 Discord Webhook par message bhejne ka function
async function sendDiscordWebhook(content, color = 3066993) {
    if (!CONFIG.WEBHOOK_URL) return;
    try {
        await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    description: content,
                    color: color,
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch (err) {
        console.log(`[WEBHOOK ERROR]: ${err.message}`);
    }
}

function getSpamMessages() {
    try {
        if (!existsSync('spam.txt')) return ['Spike.lol Raid! .gg/spike.lol'];
        const content = readFileSync('spam.txt', 'utf8');
        return content.split('\n').map(m => m.trim()).filter(m => m.length > 0);
    } catch {
        return ['Spike.lol Raid active!'];
    }
}

function sendLog(message) {
    console.log(`[RAID LOG] ${message}`);
}

function createBot(index) {
    if (!isRunning) return;

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const botName = `${CONFIG.BOT_PREFIX}_${randomNum}`;

    const botOptions = {
        host: CONFIG.HOST,
        username: botName,
        version: CONFIG.VERSION,
        hideErrors: false
    };
    if (CONFIG.PORT) botOptions.port = CONFIG.PORT;

    let bot;
    try {
        bot = mineflayer.createBot(botOptions);
    } catch (err) {
        console.log(`[ERROR] Failed to create bot instance: ${err.message}`);
        return;
    }

    bots.push(bot);

    bot.once('spawn', () => {
        const logMsg = `🟢 **Bot Connected:** \`${botName}\` joined **${CONFIG.HOST}**`;
        sendLog(logMsg);
        sendDiscordWebhook(logMsg, 65280); // Green color
        startHumanBehavior(bot);
        startSpamming(bot);
    });

    bot.on('death', () => {
        const logMsg = `💀 **Bot Died:** \`${botName}\` died. Respawning...`;
        sendLog(logMsg);
        sendDiscordWebhook(logMsg, 16776960); // Yellow color
        try { bot.respawn(); } catch (e) {}
    });

    bot.on('windowOpen', (window) => {
        sendLog(`🔐 Bot ${botName} detected GUI/Chest login.`);
        setTimeout(() => {
            if (window && window.slots && window.slots[11]) {
                bot.clickWindow(11, 0, 0).catch(() => {});
            }
        }, 1000);
    });

    bot.on('chat', (username, message) => {
        if (!bot || username === bot.username) return;
        const msgLower = message.toLowerCase();
        if (msgLower.includes('register') || msgLower.includes('/reg')) {
            bot.chat(`/register ${CONFIG.MC_PASSWORD} ${CONFIG.MC_PASSWORD}`);
        } else if (msgLower.includes('login') || msgLower.includes('/l')) {
            bot.chat(`/login ${CONFIG.MC_PASSWORD}`);
        }
    });

    bot.on('end', (reason) => {
        const logMsg = `🔴 **Bot Disconnected:** \`${botName}\` disconnected (Reason: *${reason}*). Replacing...`;
        sendLog(logMsg);
        sendDiscordWebhook(logMsg, 16711680); // Red color
        
        bots = bots.filter(b => b !== bot);
        setTimeout(() => {
            if (isRunning) {
                createBot(index);
            }
        }, 2000);
    });

    bot.on('error', (err) => {
        console.log(`[BOT ERROR - ${botName}]: ${err.message}`);
    });
}

function startHumanBehavior(bot) {
    const moveInterval = setInterval(() => {
        if (!bot || !bot.entity || !bot._client || bot._client.ended) {
            clearInterval(moveInterval);
            return;
        }
        const directions = ['forward', 'back', 'left', 'right'];
        const randomDir = directions[Math.floor(Math.random() * directions.length)];
        bot.setControlState(randomDir, true);
        setTimeout(() => { if (bot && bot.clearControlStates) bot.clearControlStates(); }, 4000);
    }, 6000);

    const jumpInterval = setInterval(() => {
        if (!bot || !bot.entity || !bot._client || bot._client.ended) {
            clearInterval(jumpInterval);
            return;
        }
        bot.setControlState('jump', true);
        setTimeout(() => { if (bot && bot.setControlState) bot.setControlState('jump', false); }, 500);
    }, 10000);

    const lookInterval = setInterval(() => {
        if (!bot || !bot.entity || !bot._client || bot._client.ended) {
            clearInterval(lookInterval);
            return;
        }
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
        bot.look(yaw, pitch, true).catch(() => {});
    }, 8000);
}

function startSpamming(bot) {
    const spamInterval = setInterval(() => {
        if (!bot || !bot.entity || !bot._client || bot._client.ended) {
            clearInterval(spamInterval);
            return;
        }
        const messages = getSpamMessages();
        const rawMsg = messages[Math.floor(Math.random() * messages.length)];
        const randomSuffix = Math.floor(10 + Math.random() * 90);
        const finalMsg = `${rawMsg} [${randomSuffix}]`;
        
        try {
            if (bot && typeof bot.chat === 'function') {
                bot.chat(finalMsg);
            }
        } catch (e) {}
    }, CONFIG.SPAM_INTERVAL);
}

// 🔄 Main Continuous Loop Handler
console.log(`[RAID SYSTEM] Initializing webhook-enabled loop for server: ${CONFIG.HOST}`);
setInterval(() => {
    if (bots.length < CONFIG.MAX_BOTS && isRunning) {
        createBot(bots.length + 1);
    }
}, 1500);
