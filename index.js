const express = require('express');
const mineflayer = require('mineflayer');

// Prevent Node.js from crashing on stream errors
process.on('uncaughtException', (err) => {
    console.error('[!] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[!] Unhandled Rejection:', reason);
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
const SERVER_HOST = process.env.SERVER_IP || 'CraftySmpseason2.pixelforge.gg';
const PASSWORD = process.env.BOT_PASSWORD || 'RaidPass123';
const BASE_BOT_NAME = process.env.BOT_NAME || 'Vblaste';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const TOTAL_BOTS = 2; // Anti-bot bypass ke liye abhi 2 bots se test karo
const MESSAGE_INTERVAL = 18000; // 18 seconds gap taaki anti-spam trigger na ho
const RUN_DURATION_LIMIT = 40 * 60 * 1000;

let activeBots = new Map();
let isRunning = true;
let isSleeping = false;

async function sendWebhook(title, description, color = 3447003) {
    if (!WEBHOOK_URL || isSleeping) return;
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ title, description, color, timestamp: new Date().toISOString() }]
            })
        });
    } catch (e) {}
}

function enterSleepMode(reason) {
    if (isSleeping) return;
    isSleeping = true;
    isRunning = false;
    activeBots.forEach((data) => {
        try { data.bot.quit(); } catch (e) {}
    });
    activeBots.clear();
}

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
            host: SERVER_HOST,
            username: username,
            auth: 'offline',
            skipValidation: true,
            version: '1.20.4' // Server version ke mutabiq
        });
    } catch (err) {
        handleBotDisconnect(botId);
        return;
    }

    let botData = { bot: bot, username: username, chatInterval: null, moveInterval: null };
    activeBots.set(botId, botData);

    bot.on('spawn', () => {
        console.log(`[+] Bot ${username} (Slot ${botId}) successfully joined!`);
        sendWebhook('🟢 Bot Connected', `**${username}** server par join ho gaya hai!`, 3066993).catch(() => {});

        // Anti-bot bypass ke liye spawn hone ke 6 seconds baad login command chalegi
        setTimeout(() => {
            try {
                if (!isRunning || isSleeping) return;
                bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.chat(`/login ${PASSWORD}`);
                }, 3000);
            } catch (e) {}
        }, 6000);

        // Anti-AFK movement loop
        botData.moveInterval = setInterval(() => {
            if (!isRunning || isSleeping) return;
            try {
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.setControlState('jump', false);
                }, 400);
            } catch (e) {}
        }, 15000);

        // Chat Spam Loop
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
        }, MESSAGE_INTERVAL + (botId * 3000));

        bot.on('end', (reason) => {
            console.log(`[-] Bot ${username} disconnected: ${reason}`);
            handleBotDisconnect(botId);
        });

        bot.on('kicked', (reason) => {
            // Kick reason ko string me safely convert karna taaki [object Object] error na aaye
            let reasonStr = typeof reason === 'object' ? JSON.stringify(reason) : reason;
            console.log(`[-] Bot ${username} kicked by server. Reason:`, reasonStr);
            handleBotDisconnect(botId);
        });

        bot.on('error', (err) => {
            console.log(`[-] Bot ${username} socket error: ${err.message}`);
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

    console.log(`[↺] Slot [${botId}] empty. Respawning in 8 seconds...`);
    setTimeout(() => {
        if (isRunning && !isSleeping && !activeBots.has(botId)) {
            spawnBotInstance(botId);
        }
    }, 8000); // Thoda lamba delay taaki anti-bot plugin trigger na ho
}

function maintainSlotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;
        for (let i = 1; i <= TOTAL_BOTS; i++) {
            if (!activeBots.has(i) && isRunning && !isSleeping) {
                spawnBotInstance(i);
                break;
            }
        }
    }, 10000);
}

function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target Host: ${SERVER_HOST}`);
    sendWebhook('🚀 Raid Bot Service Started', `Target: \`${SERVER_HOST}\``, 3447003).catch(() => {});

    for (let i = 1; i <= TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnBotInstance(i);
        }, (i - 1) * 6000); // 6 seconds gap between initial joins
    }

    maintainSlotsLoop();

    setTimeout(() => {
        enterSleepMode(`40 minutes time limit completed.`);
    }, RUN_DURATION_LIMIT);
}

setTimeout(() => {
    startRaidBots();
}, 2000);
