const { Markup } = require("telegraf")

/**
 * Handle /start command
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function startCommand(bot, supabase) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id

    // Check if user exists in database
    const { data: user, error } = await supabase.from("users").select("*").eq("telegram_id", userId).single()

    if (error || !user) {
      // New user
      await ctx.reply(
        `🎮 Welcome to BGMI Tournament Bot! 🎮\n\n` +
          `Join exciting tournaments, win cash prizes, and withdraw your earnings instantly!\n\n` +
          `To get started, please register using the button below.`,
        Markup.keyboard([["📝 Register"], ["ℹ️ Help", "👤 Profile"]]).resize(),
      )

      // Check if user was referred
      const startPayload = ctx.startPayload
      if (startPayload) {
        try {
          const referrerId = Number.parseInt(startPayload)
          // Store this information temporarily - will be used during registration
          await supabase.from("referral_pending").insert({
            referred_telegram_id: userId,
            referrer_telegram_id: referrerId,
            created_at: new Date(),
          })

          await ctx.reply(`You were invited by a friend! You'll both receive a bonus after registration.`)
        } catch (err) {
          console.error("Error processing referral:", err)
        }
      }
    } else {
      // Existing user
      await ctx.reply(
        `Welcome back, ${user.name || "Player"}! 🎮\n\n` +
          `Your current balance: ₹${user.balance.toFixed(2)}\n\n` +
          `What would you like to do today?`,
        Markup.keyboard([
          ["🏆 Tournaments", "💰 Deposit"],
          ["💸 Withdraw", "👤 Profile"],
          ["📊 Leaderboard", "🔗 Referral"],
        ]).resize(),
      )
    }
  })
}

module.exports = { startCommand }

