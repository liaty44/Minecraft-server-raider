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

const TOTAL_BOTS = 8;
const MESSAGE_INTERVAL = 12000; // 12 seconds gap taaki anti-spam bypass ho sake
const MAX_CONNECT_ATTEMPTS = 10;
const RUN_DURATION_LIMIT = 40 * 60 * 1000; // 40 minutes limit

let activeBots = [];
let isRunning = true;
let isSleeping = false;
let connectAttempts = 0;
let runTimer = null;

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
    
    activeBots.forEach(botData => {
        try { botData.bot.quit(); } catch (e) {}
    });
    activeBots = [];

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

// Single Bot Spawner with Unique Chat Counter
function spawnSingleBot(index) {
    if (!isRunning || isSleeping) return;

    const username = `${BASE_BOT_NAME}_${Math.floor(Math.random() * 9000 + 1000)}_${index}`;
    
    console.log(`[?] Connecting bot: ${username}`);

    const bot = mineflayer.createBot({
        host: SERVER_IP,
        port: SERVER_PORT,
        username: username,
        auth: 'offline',
        skipValidation: true
    });

    let botData = { bot: bot, username: username, chatInterval: null };
    activeBots.push(botData);

    bot.on('spawn', () => {
        connectAttempts = 0;
        console.log(`[+] Bot ${username} successfully joined!`);
        sendWebhook('🟢 Bot Connected', `**${username}** server par join ho gaya hai!`, 3066993).catch(() => {});

        // AuthMe Login Bypass with slight random stagger
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            setTimeout(() => {
                if (!isRunning || isSleeping) return;
                bot.chat(`/login ${PASSWORD}`);
            }, 2500);
        }, 3000 + Math.random() * 1000);

        // Anti-AFK / Anti-Bot Movement Bypass
        function startMovement() {
            if (!isRunning || isSleeping) return;
            try {
                bot.setControlState('forward', true);
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (!isRunning || isSleeping) return;
                    bot.setControlState('forward', false);
                    bot.setControlState('jump', false);
                }, 1500);
            } catch (e) {}
        }
        const moveInterval = setInterval(startMovement, 10000);

        // Individual Unique Message Counter for each bot to prevent duplication kick
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
        }, MESSAGE_INTERVAL + (Math.random() * 2000)); // Random offset to prevent simultaneous packets

        bot.on('end', (reason) => {
            clearInterval(botData.chatInterval);
            clearInterval(moveInterval);
            cleanupAndReplace(botData);
        });
    });

    bot.on('kicked', (reason) => {
        console.log(`[-] Bot ${username} kicked: ${reason}`);
        cleanupAndReplace(botData);
    });

    bot.on('error', (err) => {
        console.log(`[-] Bot ${username} error: ${err.message}`);
        if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
            connectAttempts++;
            if (connectAttempts >= MAX_CONNECT_ATTEMPTS) {
                enterSleepMode(`Server offline hai. 10 connection attempts fail ho chuke hain.`);
                return;
            }
        }
        cleanupAndReplace(botData);
    });
}

// Cleanup and replace disconnected/banned bots instantly
function cleanupAndReplace(botInstance) {
    if (isSleeping) return;

    const idx = activeBots.indexOf(botInstance);
    if (idx !== -1) {
        activeBots.splice(idx, 1);
    }

    // Turant naya bot spawn karega taaki count hamesha 8 maintain rahe
    if (isRunning && !isSleeping) {
        setTimeout(() => {
            if (isRunning && !isSleeping && activeBots.length < TOTAL_BOTS) {
                spawnSingleBot(Math.floor(Math.random() * 1000));
            }
        }, 3000);
    }
}

// Background loop to maintain exact 8 bot count
function maintainBotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;
        
        if (activeBots.length < TOTAL_BOTS) {
            const needed = TOTAL_BOTS - activeBots.length;
            for (let i = 0; i < needed; i++) {
                if (isSleeping) break;
                setTimeout(() => {
                    if (!isSleeping && activeBots.length < TOTAL_BOTS) {
                        spawnSingleBot(i + Math.floor(Math.random() * 500));
                    }
                }, i * 1500);
            }
        }
    }, 5000);
}

// Initial Launch with proper staggering (1.5 seconds gap between each bot join)
function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target: ${SERVER_IP}:${SERVER_PORT}`);
    sendWebhook('🚀 Raid Bot Service Started', `Target: \`${SERVER_IP}:${SERVER_PORT}\`. Spawning 8 bots...`, 3447003).catch(() => {});

    for (let i = 0; i < TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnSingleBot(i + 1);
        }, i * 1500); // 1.5s gap so server doesn't flag multi-connection DDoS
    }

    maintainBotsLoop();

    runTimer = setTimeout(() => {
        enterSleepMode(`40 minutes time limit completed.`);
    }, RUN_DURATION_LIMIT);
}

setTimeout(() => {
    startRaidBots();
}, 2000);
