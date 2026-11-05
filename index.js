const express = require('express');
const mineflayer = require('mineflayer');

// Render Web Service Uptime
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Minecraft Raid Bot Service is Active & Running!');
});

app.listen(PORT, () => {
    console.log(`[+] Web server listening on port ${PORT}`);
});

// ---------------- ENVIRONMENT CONFIGURATION ----------------
const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.SERVER_PORT || '25565');
const PASSWORD = process.env.BOT_PASSWORD || 'RaidPass123';
const BASE_BOT_NAME = process.env.BOT_NAME || 'RaidBot';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const TOTAL_BOTS = 4; // Abhi stable 4 bots par set hai (aap baad me badha sakte hain)
const MESSAGE_INTERVAL = 12000; // 12 seconds anti-spam delay
const RUN_DURATION_LIMIT = 40 * 60 * 1000; // 40 minutes limit

let activeBots = new Map(); // Unique tracking using Map to prevent duplication bugs
let isRunning = true;
let isSleeping = false;

// Discord Webhook Function
async function sendWebhook(title, description, color = 3447003) {
    if (!WEBHOOK_URL || isSleeping) return;

    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: title,
                    description: description,
                    color: color,
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch (error) {
        console.error('[-] Webhook Failed to Send:', error.message);
    }
}

// Sleep Mode Function
function enterSleepMode(reason) {
    if (isSleeping) return;
    isSleeping = true;
    isRunning = false;

    console.log(`[💤] SLEEP MODE ACTIVATED: ${reason}`);
    
    activeBots.forEach((botData) => {
        try { botData.bot.quit(); } catch (e) {}
    });
    activeBots.clear();

    if (WEBHOOK_URL) {
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: "💤 Bot Went to Sleep",
                    description: `Reason: ${reason}`,
                    color: 10066329,
                    timestamp: new Date().toISOString()
                }]
            })
        }).catch(() => {});
    }
}

// Single Bot Spawner
function spawnBotInstance(botId) {
    if (!isRunning || isSleeping) return;

    // Unique username with random suffix
    const username = `${BASE_BOT_NAME}_${botId}_${Math.floor(Math.random() * 900 + 100)}`;
    
    if (activeBots.has(botId)) {
        try { activeBots.get(botId).bot.quit(); } catch(e) {}
        activeBots.delete(botId);
    }

    console.log(`[?] Connecting bot ID ${botId}: ${username}`);

    const bot = mineflayer.createBot({
        host: SERVER_IP,
        port: SERVER_PORT,
        username: username,
        auth: 'offline',
        skipValidation: true
    });

    let botData = { bot: bot, username: username, chatInterval: null, moveInterval: null };
    activeBots.set(botId, botData);

    bot.on('spawn', () => {
        console.log(`[+] Bot ${username} successfully joined!`);
        sendWebhook('🟢 Bot Connected', `**${username}** server par join ho gaya hai!`, 3066993).catch(() => {});

        // Login & Register sequence
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            setTimeout(() => {
                if (!isRunning || isSleeping) return;
                bot.chat(`/login ${PASSWORD}`);
            }, 2000);
        }, 3000);

        // Simple Anti-AFK movement to prevent timeout disconnect
        botData.moveInterval = setInterval(() => {
            if (!isRunning || isSleeping) return;
            try {
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.setControlState('jump', false);
                }, 500);
            } catch (e) {}
        }, 15000);

        // Individual Chat Spam Loop
        let localMsgCounter = 1;
        botData.chatInterval = setInterval(() => {
            if (!isRunning || isSleeping) {
                clearInterval(botData.chatInterval);
                return;
            }

            const raidMsg = `this server fukxed by spyer.lol [${localMsgCounter}]`;
            try {
                bot.chat(raidMsg);
                console.log(`[💬] (${username}) Sent: "${raidMsg}"`);
                localMsgCounter++;
            } catch (e) {
                clearInterval(botData.chatInterval);
            }
        }, MESSAGE_INTERVAL + (botId * 1000)); // Staggered interval per bot id to avoid simultaneous packet drops

        bot.on('end', (reason) => {
            cleanupAndRespawn(botId, `Disconnected: ${reason}`);
        });
    });

    bot.on('kicked', (reason) => {
        console.log(`[-] Bot ${username} kicked: ${reason}`);
        cleanupAndRespawn(botId, `Kicked: ${reason}`);
    });

    bot.on('error', (err) => {
        console.log(`[-] Bot ${username} error: ${err.message}`);
        cleanupAndRespawn(botId, `Error: ${err.message}`);
    });
}

// Clean and respawn specific bot ID instantly
function cleanupAndRespawn(botId, reason) {
    if (isSleeping || !isRunning) return;

    if (activeBots.has(botId)) {
        const data = activeBots.get(botId);
        if (data.chatInterval) clearInterval(data.chatInterval);
        if (data.moveInterval) clearInterval(data.moveInterval);
        activeBots.delete(botId);
    }

    console.log(`[↺] Respawning Bot ID ${botId} in 4 seconds...`);
    setTimeout(() => {
        if (isRunning && !isSleeping) {
            spawnBotInstance(botId);
        }
    }, 4000);
}

// Maintain exact total bots loop
function maintainBotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;

        for (let i = 1; i <= TOTAL_BOTS; i++) {
            if (!activeBots.has(i) && isRunning && !isSleeping) {
                console.log(`[+] Slot ${i} is empty. Spawning replacement bot...`);
                spawnBotInstance(i);
                break; // Ek baar me ek spawn karega taaki overload na ho
            }
        }
    }, 5000);
}

// Initial Launch sequence with 2.5 seconds gap between each bot
function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target: ${SERVER_IP}:${SERVER_PORT}`);
    sendWebhook('🚀 Raid Bot Service Started', `Target: \`${SERVER_IP}:${SERVER_PORT}\`. Spawning ${TOTAL_BOTS} bots securely...`, 3447003).catch(() => {});

    for (let i = 1; i <= TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnBotInstance(i);
        }, (i - 1) * 2500); // 2.5 seconds gap securely between each connection
    }

    maintainBotsLoop();

    setTimeout(() => {
        enterSleepMode(`40 minutes time limit completed.`);
    }, RUN_DURATION_LIMIT);
}

setTimeout(() => {
    startRaidBots();
}, 2000);

