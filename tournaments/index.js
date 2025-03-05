const { Markup } = require("telegraf")
const { nanoid } = require("nanoid")

/**
 * Set up tournament system
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function setupTournamentSystem(bot, supabase) {
  // Handle tournaments command
  bot.hears("🏆 Tournaments", async (ctx) => {
    await listTournaments(ctx, supabase)
  })

  bot.command("tournaments", async (ctx) => {
    await listTournaments(ctx, supabase)
  })

  // Handle tournament creation (admin only)
  bot.command("create_tournament", async (ctx) => {
    // Check if user is admin
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) {
      return ctx.reply("You do not have permission to create tournaments.")
    }

    ctx.scene.enter("tournamentCreationScene")
  })

  // Handle tournament join
  bot.action(/join_tournament_(.+)/, async (ctx) => {
    const tournamentId = ctx.match[1]

    try {
      // Get tournament details
      const { data: tournament, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single()

      if (error || !tournament) {
        return ctx.reply("Tournament not found. Please try again.")
      }

      // Check if tournament is full
      if (tournament.registered_players >= tournament.max_players) {
        return ctx.reply("This tournament is already full. Please join another tournament.")
      }

      // Check if user is registered
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("telegram_id", ctx.from.id)
        .single()

      if (userError || !user) {
        return ctx.reply("You need to register first. Use /register command.")
      }

      // Check if user has already joined this tournament
      const { data: existingRegistration } = await supabase
        .from("tournament_registrations")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("user_id", user.id)
        .single()

      if (existingRegistration) {
        return ctx.reply("You have already registered for this tournament.")
      }

      // Check if user has sufficient balance
      if (user.balance < tournament.entry_fee) {
        return ctx.reply(
          `Insufficient balance. You need ₹${tournament.entry_fee} to join this tournament.\n\n` +
            `Your current balance: ₹${user.balance}\n\n` +
            `Please deposit more funds using the /deposit command.`,
        )
      }

      // Deduct entry fee and register user
      const { error: updateError } = await supabase
        .from("users")
        .update({ balance: user.balance - tournament.entry_fee })
        .eq("id", user.id)

      if (updateError) throw updateError

      // Register user for tournament
      await supabase.from("tournament_registrations").insert({
        tournament_id: tournamentId,
        user_id: user.id,
        registration_time: new Date(),
      })

      // Update tournament registered players count
      await supabase
        .from("tournaments")
        .update({ registered_players: tournament.registered_players + 1 })
        .eq("id", tournamentId)

      // Record transaction
      await supabase.from("transactions").insert({
        user_id: user.id,
        amount: -tournament.entry_fee,
        type: "tournament_entry",
        status: "completed",
        description: `Entry fee for tournament: ${tournament.name}`,
      })

      // Check if tournament is now full
      if (tournament.registered_players + 1 >= tournament.max_players) {
        // Generate room details
        const roomId = generateRoomId()
        const roomPassword = generateRoomPassword()

        // Update tournament with room details
        await supabase
          .from("tournaments")
          .update({
            room_id: roomId,
            room_password: roomPassword,
            status: "ready",
          })
          .eq("id", tournamentId)

        // Notify all registered players
        const { data: registrations } = await supabase
          .from("tournament_registrations")
          .select("user_id")
          .eq("tournament_id", tournamentId)

        if (registrations) {
          for (const reg of registrations) {
            const { data: playerUser } = await supabase
              .from("users")
              .select("telegram_id")
              .eq("id", reg.user_id)
              .single()

            if (playerUser) {
              try {
                await bot.telegram.sendMessage(
                  playerUser.telegram_id,
                  `🎮 Tournament is ready to start! 🎮\n\n` +
                    `Tournament: ${tournament.name}\n` +
                    `Mode: ${tournament.mode}\n` +
                    `Map: ${tournament.map}\n\n` +
                    `Room ID: ${roomId}\n` +
                    `Password: ${roomPassword}\n\n` +
                    `Please join the room 10 minutes before the start time. Good luck!`,
                )
              } catch (err) {
                console.error(`Failed to notify user ${playerUser.telegram_id}:`, err)
              }
            }
          }
        }
      }

      await ctx.reply(
        `✅ Successfully registered for tournament: ${tournament.name}\n\n` +
          `Entry Fee: ₹${tournament.entry_fee}\n` +
          `New Balance: ₹${(user.balance - tournament.entry_fee).toFixed(2)}\n\n` +
          `You will receive room details before the tournament starts.`,
      )
    } catch (error) {
      console.error("Tournament join error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }
  })

  // Handle tournament details
  bot.action(/tournament_details_(.+)/, async (ctx) => {
    const tournamentId = ctx.match[1]

    try {
      // Get tournament details
      const { data: tournament, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single()

      if (error || !tournament) {
        return ctx.reply("Tournament not found. Please try again.")
      }

      // Format tournament time
      const tournamentTime = new Date(tournament.start_time).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })

      // Check if user has registered
      const { data: registration } = await supabase
        .from("tournament_registrations")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("user_id", (await supabase.from("users").select("id").eq("telegram_id", ctx.from.id).single()).data.id)
        .single()

      const isRegistered = !!registration

      let message =
        `🏆 Tournament Details 🏆\n\n` +
        `Name: ${tournament.name}\n` +
        `Mode: ${tournament.mode}\n` +
        `Map: ${tournament.map}\n` +
        `Start Time: ${tournamentTime}\n\n` +
        `Entry Fee: ₹${tournament.entry_fee}\n` +
        `Per Kill Reward: ₹${tournament.per_kill_reward}\n` +
        `Winner Prize: ₹${tournament.winner_prize}\n\n` +
        `Registered Players: ${tournament.registered_players}/${tournament.max_players}\n` +
        `Status: ${tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}\n\n`

      if (isRegistered) {
        message += `✅ You are registered for this tournament.\n\n`

        if (tournament.room_id && tournament.room_password) {
          message +=
            `Room ID: ${tournament.room_id}\n` +
            `Password: ${tournament.room_password}\n\n` +
            `Please join the room 10 minutes before the start time. Good luck!`
        } else {
          message += `Room details will be shared before the tournament starts.`
        }

        await ctx.reply(message)
      } else {
        message += `You are not registered for this tournament.`

        // Show join button if tournament is not full
        if (tournament.registered_players < tournament.max_players && tournament.status === "open") {
          await ctx.reply(
            message,
            Markup.inlineKeyboard([Markup.button.callback("Join Tournament", `join_tournament_${tournamentId}`)]),
          )
        } else {
          await ctx.reply(message)
        }
      }
    } catch (error) {
      console.error("Tournament details error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }
  })
}

/**
 * List available tournaments
 * @param {Context} ctx - Telegraf context
 * @param {SupabaseClient} supabase - Supabase client
 */
async function listTournaments(ctx, supabase) {
  try {
    // Get upcoming tournaments
    const { data: tournaments, error } = await supabase
      .from("tournaments")
      .select("*")
      .in("status", ["open", "ready"])
      .order("start_time", { ascending: true })

    if (error) throw error

    if (!tournaments || tournaments.length === 0) {
      return ctx.reply(
        "No upcoming tournaments available at the moment.\n\n" +
          "Check back later or use /notify_tournaments to get notified when new tournaments are created.",
      )
    }

    await ctx.reply("🏆 Upcoming Tournaments 🏆")

    // Display each tournament
    for (const tournament of tournaments) {
      const tournamentTime = new Date(tournament.start_time).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })

      await ctx.reply(
        `${tournament.name}\n\n` +
          `Mode: ${tournament.mode}\n` +
          `Map: ${tournament.map}\n` +
          `Time: ${tournamentTime}\n\n` +
          `Entry Fee: ₹${tournament.entry_fee}\n` +
          `Per Kill: ₹${tournament.per_kill_reward}\n` +
          `Winner Prize: ₹${tournament.winner_prize}\n\n` +
          `Players: ${tournament.registered_players}/${tournament.max_players}`,
        Markup.inlineKeyboard([Markup.button.callback("View Details", `tournament_details_${tournament.id}`)]),
      )
    }
  } catch (error) {
    console.error("List tournaments error:", error)
    await ctx.reply("An error occurred. Please try again or contact support.")
  }
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

/**
 * Generate random room ID
 * @returns {string} Room ID
 */
function generateRoomId() {
  return Math.floor(10000000 + Math.random() * 90000000).toString()
}

/**
 * Generate random room password
 * @returns {string} Room password
 */
function generateRoomPassword() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

module.exports = { setupTournamentSystem }

