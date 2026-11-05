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

const TOTAL_BOTS = 4; // Aap chaho toh badha kar 8 bhi kar sakte ho baad me
const MESSAGE_INTERVAL = 12000; // 12 seconds anti-spam delay
const RUN_DURATION_LIMIT = 40 * 60 * 1000; // 40 minutes limit

let activeBots = new Map(); // Slot-based tracking (1 to TOTAL_BOTS)
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

// Single Bot Spawner for a Specific Slot ID
function spawnBotInstance(botId) {
    if (!isRunning || isSleeping) return;

    // Agar pehle se us slot me koi bot tha, toh use forcefully clear karo
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
        }, MESSAGE_INTERVAL + (botId * 500));

        // Event Listeners for Disconnection / Kick / Error
        bot.on('end', (reason) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) disconnected. Reason: ${reason}`);
            handleBotDisconnect(botId);
        });

        bot.on('kicked', (reason) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) kicked! Reason: ${reason}`);
            sendWebhook('🔴 Bot Kicked', `**${username}** kick ho gaya. Reason: ${reason}`, 15158332).catch(() => {});
            handleBotDisconnect(botId);
        });

        bot.on('error', (err) => {
            console.log(`[-] Bot ${username} (Slot ${botId}) error: ${err.message}`);
            handleBotDisconnect(botId);
        });
    });
}

// Turant usi slot par naya bot spawn karne ka handler
function handleBotDisconnect(botId) {
    if (isSleeping || !isRunning) return;

    // Purane intervals clear karo aur map se delete karo
    if (activeBots.has(botId)) {
        const data = activeBots.get(botId);
        if (data.chatInterval) clearInterval(data.chatInterval);
        if (data.moveInterval) clearInterval(data.moveInterval);
        activeBots.delete(botId);
    }

    console.log(`[↺] Slot [${botId}] empty ho gaya hai. 3 second me naya bot spawn ho raha hai...`);
    
    // 3 seconds ke andar turant naya bot usi slot par aa jayega
    setTimeout(() => {
        if (isRunning && !isSleeping && !activeBots.has(botId)) {
            spawnBotInstance(botId);
        }
    }, 3000);
}

// Background safety loop jo check karega ki agar koi slot khali reh gaya ho toh use fill karde
function maintainSlotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;

        for (let i = 1; i <= TOTAL_BOTS; i++) {
            if (!activeBots.has(i) && isRunning && !isSleeping) {
                console.log(`[!] Safety Check: Slot [${i}] khali mila. Respawning...`);
                spawnBotInstance(i);
            }
        }
    }, 6000); // Har 6 second me check karega
}

// Initial Launch sequence
function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target: ${SERVER_IP}:${SERVER_PORT}`);
    sendWebhook('🚀 Raid Bot Service Started', `Target: \`${SERVER_IP}:${SERVER_PORT}\`. Spawning ${TOTAL_BOTS} slots...`, 3447003).catch(() => {});

    for (let i = 1; i <= TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnBotInstance(i);
        }, (i - 1) * 2000); // 2 seconds gap between each bot startup
    }

    maintainSlotsLoop();

    setTimeout(() => {
        enterSleepMode(`40 minutes time limit completed.`);
    }, RUN_DURATION_LIMIT);
}

setTimeout(() => {
    startRaidBots();
}, 2000);
