/**
 * Handle user registration
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function registerUser(bot, supabase) {
  // Command handler
  bot.command("register", (ctx) => {
    ctx.scene.enter("registerScene")
  })

  // Button handler
  bot.hears("📝 Register", (ctx) => {
    ctx.scene.enter("registerScene")
  })
}

module.exports = { registerUser }

