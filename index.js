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
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE; // Verified Role ID
const PORT = process.env.PORT || 3000;

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

// Root route for testing if the server is running
app.get("/", (req, res) => {
    res.send("Welcome to the Lootify API! The server is up and running.");
});

// Middleware to validate API key
app.use((req, res, next) => {
    const apiKey = req.headers.authorization;
    if (apiKey !== process.env.API_KEY) {
        console.warn("Unauthorized request detected!");
        return res.status(403).send("Forbidden: Invalid API Key");
    }
    next();
});

// Route to handle VIP updates from Roblox
app.post("/update-vip", (req, res) => {
    const { userId, username, gamePass } = req.body;

    if (!userId || !username || !gamePass) {
        return res.status(400).send("Missing required data: userId, username, or gamePass");
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

// Discord Bot Setup
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required for assigning roles
    ],
});

// Register Discord Slash Commands
const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

bot.once("ready", async () => {
    console.log(`${bot.user.tag} is online and ready!`);

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
});

// Login Discord bot
bot.login(DISCORD_BOT_TOKEN);

// Handle Discord Slash Command `/get-role`
bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand() || interaction.commandName !== "get-role") return;

    try {
        const member = interaction.member;

        // Fetch the latest member data to ensure role data is up-to-date
        const updatedMember = await interaction.guild.members.fetch(member.id);

        // Step 1: Check if the member has the verified role
        if (!updatedMember.roles.cache.has(VERIFIED_ROLE_ID)) {
            return interaction.reply({
                content: "You must be verified with Bloxlink first!",
                ephemeral: true,
            });
        }

        // Step 2: Check if the member is in the VIP players JSON
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

        // Step 3: Assign the VIP role
        await updatedMember.roles.add(VIP_ROLE_ID);
        return interaction.reply({ content: "VIP role successfully assigned!", ephemeral: true });
    } catch (err) {
        console.error("Error processing the command:", err);
        interaction.reply({
            content: "An error occurred while processing your request. Please try again later.",
            ephemeral: true,
        });
    }
});

// Start the Express Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
