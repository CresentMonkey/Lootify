require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");

const app = express();
app.use(bodyParser.json());

// Environment Variables
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VIP_ROLE_ID = process.env.VIP_ROLE_ID;

// File to store VIP player data
const VIP_DATA_FILE = "vipPlayers.json";

// Helper function to read the JSON file
const readVIPData = () => {
    try {
        const data = fs.readFileSync(VIP_DATA_FILE, "utf8");
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading VIP data:", err);
        return [];
    }
};

// Helper function to write to the JSON file
const writeVIPData = (data) => {
    try {
        fs.writeFileSync(VIP_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing VIP data:", err);
    }
};

// Discord Bot Setup
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required for assigning roles
    ],
});

// Login Discord bot
bot.login(DISCORD_BOT_TOKEN);

// Register Slash Commands
const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log("Registering slash commands...");

        await rest.put(Routes.applicationGuildCommands(bot.user.id, GUILD_ID), {
            body: [
                {
                    name: "get-role",
                    description: "Assign the VIP role to your account if eligible",
                },
            ],
        });

        console.log("Slash commands registered successfully!");
    } catch (err) {
        console.error("Error registering slash commands:", err);
    }
})();

// Handle HTTP POST requests from Roblox
app.post("/update-vip", (req, res) => {
    const { userId, username, gamePass } = req.body;

    if (!userId || !username || !gamePass) {
        return res.status(400).send("Missing data: userId, username, or gamePass");
    }

    // Read current VIP data
    let vipPlayers = readVIPData();

    // Check if the player already exists (avoid duplicates)
    const existingPlayerIndex = vipPlayers.findIndex(
        (player) => player.userId === userId && player.gamePass === gamePass
    );

    if (existingPlayerIndex === -1) {
        // Add a new player
        vipPlayers.push({ userId, username, gamePass });
        writeVIPData(vipPlayers);
        console.log(`Added: ${username} with game pass: ${gamePass}`);
    } else {
        console.log(`Player ${username} with game pass ${gamePass} already exists.`);
    }

    res.status(200).send("VIP data updated successfully.");
});

// Handle Discord Slash Command `/get-role`
bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand() || interaction.commandName !== "get-role") return;

    const member = interaction.member;
    const displayName = member.displayName;
    const robloxUsernameMatch = displayName.match(/\(@(.+?)\)$/);

    if (!robloxUsernameMatch) {
        return interaction.reply({
            content: "Your Discord account is not linked to a Roblox username via Bloxlink. Please link your account and try again.",
            ephemeral: true,
        });
    }

    const robloxUsername = robloxUsernameMatch[1];

    // Read VIP data
    const vipPlayers = readVIPData();
    const vipPlayer = vipPlayers.find((player) => player.username === robloxUsername);

    if (!vipPlayer) {
        return interaction.reply({
            content: "You do not have VIP status in the game.",
            ephemeral: true,
        });
    }

    try {
        await member.roles.add(VIP_ROLE_ID);
        interaction.reply({ content: "VIP role successfully assigned!", ephemeral: true });
    } catch (err) {
        console.error("Error assigning role:", err);
        interaction.reply({ content: "Failed to assign the VIP role. Please try again later.", ephemeral: true });
    }
});

// Start the Express Server
const PORT = 3000; // Change if needed
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
