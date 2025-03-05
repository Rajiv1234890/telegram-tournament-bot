require("dotenv").config()
const { Telegraf, session, Scenes } = require("telegraf")
const { createClient } = require("@supabase/supabase-js")
const { registerScenes } = require("./scenes")
const { setupMiddlewares } = require("./middlewares")
const { setupCommands } = require("./commands")
const { setupCallbacks } = require("./callbacks")
const { setupPaymentSystem } = require("./payment")
const { setupTournamentSystem } = require("./tournaments")
const { setupAdminPanel } = require("./admin")
const { setupWithdrawalSystem } = require("./withdrawal")

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN)

// Set up session middleware
bot.use(session())

// Register scenes
const stage = registerScenes(supabase)
bot.use(stage.middleware())

// Set up middlewares
setupMiddlewares(bot, supabase)

// Set up commands
setupCommands(bot, supabase)

// Set up callbacks
setupCallbacks(bot, supabase)

// Set up payment system
setupPaymentSystem(bot, supabase)

// Set up tournament system
setupTournamentSystem(bot, supabase)

// Set up admin panel
setupAdminPanel(bot, supabase)

// Set up withdrawal system
setupWithdrawalSystem(bot, supabase)

// Start the bot
bot
  .launch()
  .then(() => {
    console.log("Bot started successfully!")
  })
  .catch((err) => {
    console.error("Error starting bot:", err)
  })

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))

