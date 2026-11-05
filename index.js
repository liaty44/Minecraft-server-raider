const express = require('express');
const mineflayer = require('mineflayer');

// Prevent Node.js from crashing on stream errors
process.on('uncaughtException', (err) => {
    console.error('[!] Uncaught Exception Filtered:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[!] Unhandled Rejection Filtered:', reason);
});

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
// Sirf host/domain daalna hai (e.g., CraftySmpseason2.pixelforge.gg)
const SERVER_HOST = process.env.SERVER_IP || 'CraftySmpseason2.pixelforge.gg';
const PASSWORD = process.env.BOT_PASSWORD || 'RaidPass123';
const BASE_BOT_NAME = process.env.BOT_NAME || 'Vblaste';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const TOTAL_BOTS = 3; // Stable count taaki firewall trigger na ho
const MESSAGE_INTERVAL = 15000; // 15 seconds anti-spam gap
const RUN_DURATION_LIMIT = 40 * 60 * 1000;

let activeBots = new Map();
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
    } catch (error) {}
}

function enterSleepMode(reason) {
    if (isSleeping) return;
    isSleeping = true;
    isRunning = false;

    console.log(`[💤] SLEEP MODE ACTIVATED: ${reason}`);
    activeBots.forEach((botData) => {
        try { botData.bot.quit(); } catch (e) {}
    });
    activeBots.clear();
}

// Single Bot Spawner (Pure Host - No Port)
function spawnBotInstance(botId) {
    if (!isRunning || isSleeping) return;

    if (activeBots.has(botId)) {
        try { activeBots.get(botId).bot.quit(); } catch(e) {}
        activeBots.delete(botId);
    }

    const username = `${BASE_BOT_NAME}_${botId}_${Math.floor(Math.random() * 900 + 100)}`;
    console.log(`[?] Connecting Slot [${botId}] -> Username: ${username} to ${SERVER_HOST}`);

    let bot;
    try {
        bot = mineflayer.createBot({
            host: SERVER_HOST, // Bilkul pure host, bina kisi port ke
            username: username,
            auth: 'offline',
            skipValidation: true,
            version: '1.20.4' // Agar version match na kare toh apne server ke version se replace kar dena (jaise '1.20', '1.21')
        });
    } catch (err) {
        console.log(`[!] Initialization Error for Slot [${botId}]:`, err.message);
        handleBotDisconnect(botId);
        return;
    }

    let botData = { bot: bot, username: username, chatInterval: null, moveInterval: null };
    activeBots.set(botId, botData);

    bot.on('spawn', () => {
        console.log(`[+] Bot ${username} (Slot ${botId}) successfully joined!`);
        sendWebhook('🟢 Bot Connected', `**${username}** (Slot ${botId}) server par join ho gaya hai!`, 3066993).catch(() => {});

        // Login sequence
        setTimeout(() => {
            try {
                if (!isRunning || isSleeping) return;
                bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.chat(`/login ${PASSWORD}`);
                }, 2500);
            } catch (e) {}
        }, 4000);

        // Anti-AFK movement loop
        botData.moveInterval = setInterval(() => {
            if (!isRunning || isSleeping) return;
            try {
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.setControlState('jump', false);
                }, 500);
            } catch (e) {}
        }, 12000);

        // Safe Chat Spam Loop
        let localMsgCounter = 1;
        botData.chatInterval = setInterval(() => {
            if (!isRunning || isSleeping) {
                clearInterval(botData.chatInterval);
                return;
            }

            const randomTag = Math.floor(Math.random() * 90000 + 10000);
            const raidMsg = `this server fukxed by spyer.lol [${localMsgCounter}] #${randomTag}`;
            
            try {
                if (bot && bot._client && bot._client.socket && !bot._client.socket.destroyed) {
                    bot.chat(raidMsg);
                    console.log(`[💬] (${username}) Sent: "${raidMsg}"`);
                    localMsgCounter++;
                }
            } catch (e) {
                clearInterval(botData.chatInterval);
            }
        }, MESSAGE_INTERVAL + (botId * 2000));

        bot.on('end', (reason) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) disconnected: ${reason}`);
            handleBotDisconnect(botId);
        });

        bot.on('kicked', (reason) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) kicked: ${reason}`);
            handleBotDisconnect(botId);
        });

        bot.on('error', (err) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) socket error: ${err.message}`);
            handleBotDisconnect(botId);
        });
    });
}

function handleBotDisconnect(botId) {
    if (isSleeping || !isRunning) return;

    if (activeBots.has(botId)) {
        const data = activeBots.get(botId);
        if (data.chatInterval) clearInterval(data.chatInterval);
        if (data.moveInterval) clearInterval(data.moveInterval);
        activeBots.delete(botId);
    }

    console.log(`[↺] Slot [${botId}] empty. Respawning safely in 5 seconds...`);
    setTimeout(() => {
        if (isRunning && !isSleeping && !activeBots.has(botId)) {
            spawnBotInstance(botId);
        }
    }, 5000);
}

function maintainSlotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;

        for (let i = 1; i <= TOTAL_BOTS; i++) {
            if (!activeBots.has(i) && isRunning && !isSleeping) {
                console.log(`[!] Safety Check: Slot [${i}] khali mila. Respawning...`);
                spawnBotInstance(i);
                break;
            }
        }
    }, 6000);
}

function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target Host: ${SERVER_HOST}`);
    sendWebhook('🚀 Raid Bot Service Started', `Target Host: \`${SERVER_HOST}\`. Spawning ${TOTAL_BOTS} bots securely...`, 3447003).catch(() => {});

    for (let i = 1; i <= TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnBotInstance(i);
        }, (i - 1) * 4000);
    }

    maintainSlotsLoop();

    setTimeout(() => {
        enterSleepMode(`40 minutes time limit completed.`);
    }, RUN_DURATION_LIMIT);
}

setTimeout(() => {
    startRaidBots();
}, 2000);
