const { registerUser } = require("./register")
const { startCommand } = require("./start")
const { helpCommand } = require("./help")
const { depositCommand } = require("./deposit")
const { withdrawCommand } = require("./withdraw")
const { tournamentCommand } = require("./tournament")
const { profileCommand } = require("./profile")
const { balanceCommand } = require("./balance")
const { adminCommand } = require("./admin")
const { referralCommand } = require("./referral")
const { leaderboardCommand } = require("./leaderboard")

/**
 * Set up all bot commands
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function setupCommands(bot, supabase) {
  // Register bot commands with Telegram
  bot.telegram.setMyCommands([
    { command: "start", description: "Start the bot" },
    { command: "register", description: "Register for tournaments" },
    { command: "deposit", description: "Deposit money" },
    { command: "withdraw", description: "Withdraw your earnings" },
    { command: "tournaments", description: "View available tournaments" },
    { command: "profile", description: "View your profile" },
    { command: "balance", description: "Check your balance" },
    { command: "referral", description: "Get your referral link" },
    { command: "leaderboard", description: "View top players" },
    { command: "help", description: "Get help" },
  ])

  // Set up command handlers
  startCommand(bot, supabase)
  registerUser(bot, supabase)
  helpCommand(bot)
  depositCommand(bot, supabase)
  withdrawCommand(bot, supabase)
  tournamentCommand(bot, supabase)
  profileCommand(bot, supabase)
  balanceCommand(bot, supabase)
  adminCommand(bot, supabase)
  referralCommand(bot, supabase)
  leaderboardCommand(bot, supabase)
}

module.exports = { setupCommands }

