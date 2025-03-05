/**
 * Handle leaderboard command
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function leaderboardCommand(bot, supabase) {
  bot.command("leaderboard", async (ctx) => {
    await showLeaderboard(ctx, supabase)
  })

  bot.hears("📊 Leaderboard", async (ctx) => {
    await showLeaderboard(ctx, supabase)
  })
}

/**
 * Show leaderboard
 * @param {Context} ctx - Telegraf context
 * @param {SupabaseClient} supabase - Supabase client
 */
async function showLeaderboard(ctx, supabase) {
  try {
    // Get top players by kills
    const { data: topKillers, error: killsError } = await supabase.rpc("get_top_killers", { limit_count: 5 })

    if (killsError) {
      console.error("Error fetching top killers:", killsError)
      return ctx.reply("An error occurred. Please try again.")
    }

    // Get top winners
    const { data: topWinners, error: winnersError } = await supabase.rpc("get_top_winners", { limit_count: 5 })

    if (winnersError) {
      console.error("Error fetching top winners:", winnersError)
      return ctx.reply("An error occurred. Please try again.")
    }

    // Get top earners
    const { data: topEarners, error: earnersError } = await supabase.rpc("get_top_earners", { limit_count: 5 })

    if (earnersError) {
      console.error("Error fetching top earners:", earnersError)
      return ctx.reply("An error occurred. Please try again.")
    }

    // Format leaderboard message
    let message = `📊 BGMI Tournament Leaderboard 📊\n\n`

    // Top Killers
    message += `🔫 Top Killers 🔫\n`
    if (topKillers && topKillers.length > 0) {
      topKillers.forEach((player, index) => {
        message += `${index + 1}. ${player.bgmi_ign} - ${player.total_kills} kills\n`
      })
    } else {
      message += `No data available yet.\n`
    }

    message += `\n`

    // Top Winners
    message += `🏆 Top Winners 🏆\n`
    if (topWinners && topWinners.length > 0) {
      topWinners.forEach((player, index) => {
        message += `${index + 1}. ${player.bgmi_ign} - ${player.total_wins} wins\n`
      })
    } else {
      message += `No data available yet.\n`
    }

    message += `\n`

    // Top Earners
    message += `💰 Top Earners 💰\n`
    if (topEarners && topEarners.length > 0) {
      topEarners.forEach((player, index) => {
        message += `${index + 1}. ${player.bgmi_ign} - ₹${player.total_earnings}\n`
      })
    } else {
      message += `No data available yet.\n`
    }

    await ctx.reply(message)
  } catch (error) {
    console.error("Leaderboard error:", error)
    await ctx.reply("An error occurred. Please try again or contact support.")
  }
}

module.exports = { leaderboardCommand }

