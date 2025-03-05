import 'dotenv/config';
import { Telegraf, session, Scenes, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { adminMiddleware } from "./middlewares/admin.js";
import { registerScene } from "./scenes/register.js";
import { addTournamentScene } from "./scenes/addTournament.js";
import { editTournamentScene } from "./scenes/editTournament.js";
import { joinTournamentScene } from "./scenes/joinTournament.js";
import { withdrawScene } from "./scenes/withdraw.js";
import { formatTournament, sendNotification } from "./utils.js";

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Set up session and scene management
const stage = new Scenes.Stage([
  registerScene,
  addTournamentScene,
  editTournamentScene,
  joinTournamentScene,
  withdrawScene,
]);
bot.use(session());
bot.use(stage.middleware());

// Start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;

  // Check if user exists in database
  const { data: user } = await supabase.from("users").select("*").eq("telegram_id", userId).single();

  if (!user) {
    // Create new user
    await supabase.from("users").insert({
      telegram_id: userId,
      username: username,
      wallet_balance: 0,
      created_at: new Date(),
    });
  }

  ctx.reply(
    `👋 Welcome to the Tournament Bot!\n\nUse the buttons below to navigate:`,
    Markup.keyboard([["🏆 Tournaments", "📝 Register"], ["🎮 My Tournaments", "💰 Wallet"], ["❓ Help"]]).resize(),
  );
});

// Help command
bot.command("help", (ctx) => {
  ctx.reply(
    `*Tournament Bot Commands*\n\n` +
      `🎮 *Basic Commands*\n` +
      `/start - Start the bot\n` +
      `/register - Register for tournaments\n` +
      `/tournaments - View upcoming tournaments\n` +
      `/join <id> - Join a specific tournament\n` +
      `/roomid <id> - Get room ID for a tournament\n` +
      `/withdraw - Request a withdrawal\n` +
      `/help - Show this help message\n\n` +
      `💰 *Wallet Commands*\n` +
      `/wallet - Check your wallet balance\n` +
      `/deposit - Add funds to your wallet\n\n` +
      `👤 *User Commands*\n` +
      `/mytournaments - View your registered tournaments\n\n` +
      `🔐 *Admin Commands*\n` +
      `/addtournament - Add a new tournament\n` +
      `/edittournament <id> - Edit a tournament\n` +
      `/deletetournament <id> - Delete a tournament\n` +
      `/setroomid <id> <room_id> <password> - Set room details\n` +
      `/approvewithdraw <user_id> - Approve withdrawal`,
    { parse_mode: "Markdown" },
  );
});

// Register command
bot.command("register", (ctx) => ctx.scene.enter("register"));

// Tournaments command
bot.command("tournaments", async (ctx) => {
  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select("*")
    .gt("start_time", new Date().toISOString())
    .order("start_time", { ascending: true });

  if (error || !tournaments.length) {
    return ctx.reply("No upcoming tournaments found.");
  }

  let message = "🏆 *Upcoming Tournaments*\n\n";

  tournaments.forEach((tournament) => {
    message += formatTournament(tournament);
    message += `\nJoin with: /join ${tournament.id}\n\n`;
  });

  ctx.reply(message, {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });
});

// Join tournament command
bot.command("join", (ctx) => {
  const tournamentId = ctx.message.text.split(" ")[1];
  if (!tournamentId) {
    return ctx.reply("Please provide a tournament ID. Example: /join 123");
  }
  ctx.scene.enter("joinTournament", { tournamentId });
});

// My tournaments command
bot.command("mytournaments", async (ctx) => {
  const userId = ctx.from.id;

  const { data: registrations, error } = await supabase
    .from("registrations")
    .select(`
      *,
      tournaments (*)
    `)
    .eq("user_id", userId);

  if (error || !registrations.length) {
    return ctx.reply("You are not registered for any tournaments.");
  }

  let message = "🎮 *Your Tournaments*\n\n";

  registrations.forEach((reg) => {
    const tournament = reg.tournaments;
    message += formatTournament(tournament);
    message += `\nStatus: ${reg.payment_status}\n`;

    if (tournament.room_id && tournament.start_time < new Date().toISOString()) {
      message += `Room ID: ${tournament.room_id}\n`;
      message += `Password: ${tournament.room_password}\n`;
    }

    message += "\n";
  });

  ctx.reply(message, { parse_mode: "Markdown" });
});

// Room ID command
bot.command("roomid", async (ctx) => {
  const tournamentId = ctx.message.text.split(" ")[1];
  if (!tournamentId) {
    return ctx.reply("Please provide a tournament ID. Example: /roomid 123");
  }

  const { data: tournament, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single();

  if (error || !tournament) {
    return ctx.reply("Tournament not found.");
  }

  // Check if user is registered
  const userId = ctx.from.id;
  const { data: registration } = await supabase
    .from("registrations")
    .select("*")
    .eq("user_id", userId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!registration) {
    return ctx.reply("You are not registered for this tournament.");
  }

  if (!tournament.room_id) {
    return ctx.reply("Room details have not been set yet. Please check back later.");
  }

  ctx.reply(
    `🔑 *Room Details for ${tournament.name}*\n\n` +
      `Room ID: \`${tournament.room_id}\`\n` +
      `Password: \`${tournament.room_password}\`\n\n` +
      `Tournament starts at: ${new Date(tournament.start_time).toLocaleString()}`,
    { parse_mode: "Markdown" },
  );
});

// Wallet command
bot.command("wallet", async (ctx) => {
  const userId = ctx.from.id;

  const { data: user, error } = await supabase.from("users").select("wallet_balance").eq("telegram_id", userId).single();

  if (error || !user) {
    return ctx.reply("Error fetching wallet balance. Please try again.");
  }

  ctx.reply(
    `💰 *Your Wallet*\n\n` +
      `Current Balance: ₹${user.wallet_balance.toFixed(2)}\n\n` +
      `Use /deposit to add funds\n` +
      `Use /withdraw to request a withdrawal`,
    { parse_mode: "Markdown" },
  );
});

// Withdraw command
bot.command("withdraw", (ctx) => ctx.scene.enter("withdraw"));

// Admin commands with middleware
bot.command("addtournament", adminMiddleware, (ctx) => ctx.scene.enter("addTournament"));
bot.command("edittournament", adminMiddleware, (ctx) => {
  const tournamentId = ctx.message.text.split(" ")[1];
  if (!tournamentId) {
    return ctx.reply("Please provide a tournament ID. Example: /edittournament 123");
  }
  ctx.scene.enter("editTournament", { tournamentId });
});

bot.command("deletetournament", adminMiddleware, async (ctx) => {
  const tournamentId = ctx.message.text.split(" ")[1];
  if (!tournamentId) {
    return ctx.reply("Please provide a tournament ID. Example: /deletetournament 123");
  }

  const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);

  if (error) {
    return ctx.reply("Error deleting tournament. Please try again.");
  }

  ctx.reply("Tournament deleted successfully.");
});

bot.command("setroomid", adminMiddleware, async (ctx) => {
  const parts = ctx.message.text.split(" ");
  if (parts.length < 4) {
    return ctx.reply("Please provide tournament ID, room ID and password. Example: /setroomid 123 ABCDEF 123456");
  }

  const tournamentId = parts[1];
  const roomId = parts[2];
  const password = parts[3];

  const { error } = await supabase
    .from("tournaments")
    .update({
      room_id: roomId,
      room_password: password,
    })
    .eq("id", tournamentId);

  if (error) {
    return ctx.reply("Error setting room details. Please try again.");
  }

  // Notify all registered users
  const { data: registrations } = await supabase
    .from("registrations")
    .select("user_id")
    .eq("tournament_id", tournamentId);

  if (registrations && registrations.length > 0) {
    const { data: tournament } = await supabase.from("tournaments").select("name").eq("id", tournamentId).single();

    registrations.forEach((reg) => {
      sendNotification(
        bot,
        reg.user_id,
        `🔑 Room details for *${tournament.name}* are now available!\n\nUse /roomid ${tournamentId} to view them.`,
      );
    });
  }

  ctx.reply("Room details set successfully and notifications sent to participants.");
});

bot.command("approvewithdraw", adminMiddleware, async (ctx) => {
  const parts = ctx.message.text.split(" ");
  if (parts.length < 2) {
    return ctx.reply("Please provide a withdrawal ID. Example: /approvewithdraw 123");
  }

  const withdrawalId = parts[1];

  // Get withdrawal details
  const { data: withdrawal, error } = await supabase.from("withdrawals").select("*").eq("id", withdrawalId).single();

  if (error || !withdrawal) {
    return ctx.reply("Withdrawal not found.");
  }

  // Update withdrawal status
  await supabase.from("withdrawals").update({ status: "completed", processed_at: new Date() }).eq("id", withdrawalId);

  // Notify user
  sendNotification(
    bot,
    withdrawal.user_id,
    `💰 Your withdrawal request for ₹${withdrawal.amount.toFixed(2)} has been approved and processed!`,
  );

  ctx.reply("Withdrawal approved and user notified.");
});

// Handle text messages for menu navigation
bot.hears("🏆 Tournaments", (ctx) => ctx.command.tournaments());
bot.hears("📝 Register", (ctx) => ctx.scene.enter("register"));
bot.hears("🎮 My Tournaments", (ctx) => ctx.command.mytournaments());
bot.hears("💰 Wallet", (ctx) => ctx.command.wallet());
bot.hears("❓ Help", (ctx) => ctx.command.help());

// Error handling
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  ctx.reply("An error occurred. Please try again later.");
});

// Start the bot
bot
  .launch()
  .then(() => {
    console.log("Bot started successfully!");
  })
  .catch((err) => {
    console.error("Failed to start bot:", err);
  });

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));