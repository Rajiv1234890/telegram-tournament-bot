/**
 * Handle referral command
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function referralCommand(bot, supabase) {
  bot.command("referral", async (ctx) => {
    await handleReferral(ctx, supabase)
  })

  bot.hears("🔗 Referral", async (ctx) => {
    await handleReferral(ctx, supabase)
  })
}

/**
 * Handle referral request
 * @param {Context} ctx - Telegraf context
 * @param {SupabaseClient} supabase - Supabase client
 */
async function handleReferral(ctx, supabase) {
  try {
    // Check if user is registered
    const { data: user, error } = await supabase.from("users").select("*").eq("telegram_id", ctx.from.id).single()

    if (error || !user) {
      return ctx.reply("You need to register first. Use /register command.")
    }

    // Get referral stats
    const { data: referrals, error: refError } = await supabase
      .from("referral_pending")
      .select("referred_telegram_id")
      .eq("referrer_telegram_id", ctx.from.id)

    if (refError) {
      console.error("Error fetching referrals:", refError)
    }

    const pendingReferrals = referrals ? referrals.length : 0

    // Get completed referrals
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", "referral_bonus")

    if (txError) {
      console.error("Error fetching transactions:", txError)
    }

    const completedReferrals = transactions ? transactions.length : 0
    const totalEarned = transactions ? transactions.reduce((sum, tx) => sum + tx.amount, 0) : 0

    // Generate referral link
    const botUsername = (await ctx.telegram.getMe()).username
    const referralLink = `https://t.me/${botUsername}?start=${ctx.from.id}`

    await ctx.reply(
      `🔗 Your Referral Program 🔗\n\n` +
        `Invite friends to join our BGMI tournaments and earn rewards!\n\n` +
        `Your Referral Link:\n${referralLink}\n\n` +
        `Stats:\n` +
        `Pending Invites: ${pendingReferrals}\n` +
        `Completed Referrals: ${completedReferrals}\n` +
        `Total Earned: ₹${totalEarned}\n\n` +
        `How it works:\n` +
        `1. Share your referral link with friends\n` +
        `2. When they register, you both get ₹10\n` +
        `3. The more friends you invite, the more you earn!`,
    )
  } catch (error) {
    console.error("Referral error:", error)
    await ctx.reply("An error occurred. Please try again or contact support.")
  }
}

module.exports = { referralCommand }

