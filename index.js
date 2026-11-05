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

const TOTAL_BOTS = 6; // Aap ise badha kar 8 bhi kar sakte hain!
const MESSAGE_INTERVAL = 8000; // Har 8 seconds me message (anti-spam bypass ke liye safe)
const RUN_DURATION_LIMIT = 40 * 60 * 1000; // 40 minutes limit

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

    // Purana instance saaf karo agar bacha ho
    if (activeBots.has(botId)) {
        try { activeBots.get(botId).bot.quit(); } catch(e) {}
        activeBots.delete(botId);
    }

    const username = `${BASE_BOT_NAME}_${botId}_${Math.floor(Math.random() * 900 + 100)}`;
    console.log(`[?] Connecting Slot [${botId}] -> Username: ${username}`);

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
        console.log(`[+] Bot ${username} (Slot ${botId}) successfully joined!`);
        sendWebhook('🟢 Bot Connected', `**${username}** (Slot ${botId}) server par join ho gaya hai!`, 3066993).catch(() => {});

        // Login & Register sequence (Thoda delay taaki server load na le)
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            setTimeout(() => {
                if (!isRunning || isSleeping) return;
                bot.chat(`/login ${PASSWORD}`);
            }, 2500);
        }, 4000);

        // Anti-AFK movement loop
        botData.moveInterval = setInterval(() => {
            if (!isRunning || isSleeping) return;
            try {
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.setControlState('jump', false);
                }, 600);
            } catch (e) {}
        }, 12000);

        // Robust Chat Spam Loop (Har bot ka apna unique counter aur random delay)
        let localMsgCounter = 1;
        botData.chatInterval = setInterval(() => {
            if (!isRunning || isSleeping) {
                clearInterval(botData.chatInterval);
                return;
            }

            // Alag-alag random numbers attach honge taaki server spam block na kare
            const randomTag = Math.floor(Math.random() * 90000 + 10000);
            const raidMsg = `this server fukxed by spyer.lol [${localMsgCounter}] #${randomTag}`;
            
            try {
                bot.chat(raidMsg);
                console.log(`[💬] (${username}) Sent: "${raidMsg}"`);
                localMsgCounter++;
            } catch (e) {
                console.log(`[!] Chat error for ${username}:`, e.message);
                clearInterval(botData.chatInterval);
            }
        }, MESSAGE_INTERVAL + (botId * 1500)); // Har bot ke beech me timing offset

        // Event Listeners
        bot.on('end', (reason) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) disconnected: ${reason}`);
            handleBotDisconnect(botId);
        });

        bot.on('kicked', (reason) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) kicked: ${reason}`);
            sendWebhook('🔴 Bot Kicked', `**${username}** kick ho gaya. Reason: ${reason}`, 15158332).catch(() => {});
            handleBotDisconnect(botId);
        });

        bot.on('error', (err) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) error: ${err.message}`);
            handleBotDisconnect(botId);
        });
    });
}

// Disconnect hone par turant slot refill karna
function handleBotDisconnect(botId) {
    if (isSleeping || !isRunning) return;

    if (activeBots.has(botId)) {
        const data = activeBots.get(botId);
        if (data.chatInterval) clearInterval(data.chatInterval);
        if (data.moveInterval) clearInterval(data.moveInterval);
        activeBots.delete(botId);
    }

    console.log(`[↺] Slot [${botId}] empty. Respawning in 3 seconds...`);
    setTimeout(() => {
        if (isRunning && !isSleeping && !activeBots.has(botId)) {
            spawnBotInstance(botId);
        }
    }, 3000);
}

// Safety Loop: Agar koi bot gayab ho toh use wapas lana
function maintainSlotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;

        for (let i = 1; i <= TOTAL_BOTS; i++) {
            if (!activeBots.has(i) && isRunning && !isSleeping) {
                console.log(`[!] Safety Check: Slot [${i}] khali mila. Respawning...`);
                spawnBotInstance(i);
                break; // Ek baar me ek spawn karega taaki network overload na ho
            }
        }
    }, 4000);
}

// Initial Launch Sequence (Safe Staggering for 6-8 bots)
function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target: ${SERVER_IP}:${SERVER_PORT}`);
    sendWebhook('🚀 Raid Bot Service Started', `Target: \`${SERVER_IP}:${SERVER_PORT}\`. Spawning ${TOTAL_BOTS} bots...`, 3447003).catch(() => {});

    for (let i = 1; i <= TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnBotInstance(i);
        }, (i - 1) * 3000); // 3 seconds gap between each bot to prevent Render/Server connection drop
    }

    maintainSlotsLoop();

    setTimeout(() => {
        enterSleepMode(`40 minutes time limit completed.`);
    }, RUN_DURATION_LIMIT);
}

setTimeout(() => {
    startRaidBots();
}, 2000);
