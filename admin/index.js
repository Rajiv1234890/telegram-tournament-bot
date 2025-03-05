const { Markup } = require("telegraf")

/**
 * Set up admin panel
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function setupAdminPanel(bot, supabase) {
  // Admin command
  bot.command("admin", async (ctx) => {
    // Check if user is admin
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) {
      return ctx.reply("You do not have permission to access the admin panel.")
    }

    await ctx.reply(
      "👨‍💻 Admin Panel 👨‍💻\n\n" + "Select an option:",
      Markup.keyboard([
        ["🏆 Create Tournament", "📊 Tournament Results"],
        ["💰 Pending Withdrawals", "👥 User Management"],
        ["📢 Broadcast Message", "📈 Analytics"],
        ["🔙 Back to Main Menu"],
      ]).resize(),
    )
  })

  // Handle admin options
  bot.hears("🏆 Create Tournament", (ctx) => {
    checkAdmin(ctx.from.id, supabase).then((isAdmin) => {
      if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")
      ctx.scene.enter("tournamentCreationScene")
    })
  })

  bot.hears("📊 Tournament Results", async (ctx) => {
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")

    // Get active tournaments
    const { data: tournaments, error } = await supabase
      .from("tournaments")
      .select("*")
      .in("status", ["ready", "live"])
      .order("start_time", { ascending: true })

    if (error) {
      console.error("Error fetching tournaments:", error)
      return ctx.reply("An error occurred. Please try again.")
    }

    if (!tournaments || tournaments.length === 0) {
      return ctx.reply("No active tournaments found.")
    }

    // Display tournaments
    await ctx.reply("Select a tournament to input results:")

    for (const tournament of tournaments) {
      await ctx.reply(
        `${tournament.name}\n` +
          `Mode: ${tournament.mode}\n` +
          `Status: ${tournament.status}\n` +
          `Players: ${tournament.registered_players}/${tournament.max_players}`,
        Markup.inlineKeyboard([Markup.button.callback("Input Results", `input_results_${tournament.id}`)]),
      )
    }
  })

  bot.action(/input_results_(.+)/, (ctx) => {
    const tournamentId = ctx.match[1]
    ctx.scene.enter("resultInputScene", { tournamentId })
  })

  bot.hears("💰 Pending Withdrawals", async (ctx) => {
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")

    // Get pending withdrawals
    const { data: withdrawals, error } = await supabase
      .from("withdrawals")
      .select("*, users(name, mobile)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Error fetching withdrawals:", error)
      return ctx.reply("An error occurred. Please try again.")
    }

    if (!withdrawals || withdrawals.length === 0) {
      return ctx.reply("No pending withdrawals found.")
    }

    // Display withdrawals
    await ctx.reply(`Found ${withdrawals.length} pending withdrawals:`)

    for (const withdrawal of withdrawals) {
      await ctx.reply(
        `Withdrawal #${withdrawal.id}\n\n` +
          `User: ${withdrawal.users.name}\n` +
          `Mobile: ${withdrawal.users.mobile}\n` +
          `Amount: ₹${withdrawal.amount}\n` +
          `UPI ID: ${withdrawal.upi_id}\n` +
          `Requested: ${new Date(withdrawal.created_at).toLocaleString("en-IN")}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Approve", `approve_withdrawal_${withdrawal.id}`),
            Markup.button.callback("❌ Reject", `reject_withdrawal_${withdrawal.id}`),
          ],
        ]),
      )
    }
  })

  bot.hears("👥 User Management", async (ctx) => {
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")

    await ctx.reply(
      "User Management Options:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Search User", "search_user")],
        [Markup.button.callback("Adjust Balance", "adjust_balance")],
        [Markup.button.callback("Ban/Unban User", "ban_user")],
      ]),
    )
  })

  bot.action("search_user", (ctx) => {
    ctx.reply("Please enter the mobile number or Telegram username of the user:")
    // Set up a listener for the next message
    bot.use(async (ctx, next) => {
      if (ctx.message && ctx.message.text && !ctx.message.text.startsWith("/")) {
        const searchTerm = ctx.message.text.trim()

        // Search by mobile or username
        const { data: users, error } = await supabase
          .from("users")
          .select("*")
          .or(`mobile.eq.${searchTerm},telegram_username.eq.${searchTerm}`)

        if (error) {
          console.error("Error searching users:", error)
          return ctx.reply("An error occurred. Please try again.")
        }

        if (!users || users.length === 0) {
          return ctx.reply("No users found with that mobile number or username.")
        }

        // Display user details
        for (const user of users) {
          await ctx.reply(
            `User Details:\n\n` +
              `Name: ${user.name}\n` +
              `Mobile: ${user.mobile}\n` +
              `Telegram: @${user.telegram_username}\n` +
              `BGMI IGN: ${user.bgmi_ign}\n` +
              `BGMI ID: ${user.bgmi_player_id}\n` +
              `Balance: ₹${user.balance.toFixed(2)}\n` +
              `Status: ${user.is_banned ? "Banned" : "Active"}\n` +
              `Registered: ${new Date(user.created_at).toLocaleDateString("en-IN")}`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback("Adjust Balance", `adjust_balance_${user.id}`),
                Markup.button.callback(user.is_banned ? "Unban" : "Ban", `toggle_ban_${user.id}`),
              ],
            ]),
          )
        }

        return
      }

      return next()
    })
  })

  bot.hears("📢 Broadcast Message", (ctx) => {
    checkAdmin(ctx.from.id, supabase).then((isAdmin) => {
      if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")
      ctx.reply("Please enter the message you want to broadcast to all users:")

      // Set up a listener for the next message
      bot.use(async (ctx, next) => {
        if (ctx.message && ctx.message.text && !ctx.message.text.startsWith("/")) {
          const broadcastMessage = ctx.message.text

          await ctx.reply(
            `You are about to send the following message to all users:\n\n${broadcastMessage}\n\nAre you sure?`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback("✅ Send", `confirm_broadcast`),
                Markup.button.callback("❌ Cancel", `cancel_broadcast`),
              ],
            ]),
          )

          // Store the message in context
          ctx.session.broadcastMessage = broadcastMessage

          return
        }

        return next()
      })
    })
  })

  bot.action("confirm_broadcast", async (ctx) => {
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")

    const broadcastMessage = ctx.session.broadcastMessage
    if (!broadcastMessage) {
      return ctx.reply("No message to broadcast. Please try again.")
    }

    // Get all users
    const { data: users, error } = await supabase.from("users").select("telegram_id").eq("is_banned", false)

    if (error) {
      console.error("Error fetching users:", error)
      return ctx.reply("An error occurred. Please try again.")
    }

    if (!users || users.length === 0) {
      return ctx.reply("No users found to broadcast to.")
    }

    // Send message to all users
    let successCount = 0
    let failCount = 0

    await ctx.reply(`Broadcasting message to ${users.length} users...`)

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, `📢 Announcement 📢\n\n${broadcastMessage}`)
        successCount++
      } catch (err) {
        console.error(`Failed to send message to user ${user.telegram_id}:`, err)
        failCount++
      }

      // Add a small delay to avoid hitting rate limits
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    await ctx.reply(`Broadcast complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`)

    // Clear the stored message
    delete ctx.session.broadcastMessage
  })

  bot.action("cancel_broadcast", (ctx) => {
    delete ctx.session.broadcastMessage
    ctx.reply("Broadcast cancelled.")
  })

  bot.hears("📈 Analytics", async (ctx) => {
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) return ctx.reply("You do not have permission to access this feature.")

    try {
      // Get total users
      const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true })

      // Get total tournaments
      const { count: tournamentCount } = await supabase.from("tournaments").select("*", { count: "exact", head: true })

      // Get total deposits
      const { data: deposits } = await supabase
        .from("transactions")
        .select("amount")
        .eq("type", "deposit")
        .eq("status", "completed")

      const totalDeposits = deposits ? deposits.reduce((sum, tx) => sum + tx.amount, 0) : 0

      // Get total withdrawals
      const { data: withdrawals } = await supabase
        .from("transactions")
        .select("amount")
        .eq("type", "withdrawal")
        .eq("status", "completed")

      const totalWithdrawals = withdrawals ? withdrawals.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) : 0

      // Get new users in last 7 days
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      const { count: newUserCount } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", oneWeekAgo.toISOString())

      await ctx.reply(
        `📊 Analytics Dashboard 📊\n\n` +
          `Total Users: ${userCount}\n` +
          `New Users (7 days): ${newUserCount}\n` +
          `Total Tournaments: ${tournamentCount}\n\n` +
          `Total Deposits: ₹${totalDeposits.toFixed(2)}\n` +
          `Total Withdrawals: ₹${totalWithdrawals.toFixed(2)}\n` +
          `Net Balance: ₹${(totalDeposits - totalWithdrawals).toFixed(2)}`,
      )
    } catch (error) {
      console.error("Analytics error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }
  })

  bot.hears("🔙 Back to Main Menu", (ctx) => {
    ctx.reply(
      "Main Menu:",
      Markup.keyboard([
        ["🏆 Tournaments", "💰 Deposit"],
        ["💸 Withdraw", "👤 Profile"],
        ["📊 Leaderboard", "🔗 Referral"],
      ]).resize(),
    )
  })
}

/**
 * Check if user is admin
 * @param {number} telegramId - Telegram user ID
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Promise<boolean>} Whether user is admin
 */
async function checkAdmin(telegramId, supabase) {
  try {
    const { data: user, error } = await supabase.from("users").select("is_admin").eq("telegram_id", telegramId).single()

    if (error || !user) return false

    return user.is_admin === true
  } catch (error) {
    console.error("Check admin error:", error)
    return false
  }
}

module.exports = { setupAdminPanel }

