const { Scenes, Markup } = require("telegraf")

/**
 * Create tournament creation scene
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Scenes.WizardScene} Tournament creation wizard scene
 */
function tournamentCreationScene(supabase) {
  const scene = new Scenes.WizardScene(
    "tournamentCreationScene",
    // Step 1: Ask for tournament name
    async (ctx) => {
      // Check if user is admin
      const isAdmin = await checkAdmin(ctx.from.id, supabase)
      if (!isAdmin) {
        await ctx.reply("You do not have permission to create tournaments.")
        return ctx.scene.leave()
      }

      await ctx.reply("Please enter the tournament name:")
      ctx.wizard.state.tournamentData = {}
      return ctx.wizard.next()
    },
    // Step 2: Ask for tournament mode
    async (ctx) => {
      ctx.wizard.state.tournamentData.name = ctx.message.text
      await ctx.reply(
        "Select the tournament mode:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("Solo", "mode_solo"),
            Markup.button.callback("Duo", "mode_duo"),
            Markup.button.callback("Squad", "mode_squad"),
          ],
        ]),
      )
      return ctx.wizard.next()
    },
    // Step 3: Ask for map
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.wizard.next()
    },
    // Step 4: Ask for entry fee
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.wizard.next()
    },
    // Step 5: Ask for per kill reward
    async (ctx) => {
      const entryFee = Number.parseInt(ctx.message.text)
      if (isNaN(entryFee) || entryFee < 0) {
        await ctx.reply("Please enter a valid entry fee (a positive number):")
        return
      }

      ctx.wizard.state.tournamentData.entry_fee = entryFee
      await ctx.reply("Enter the per kill reward amount (in ₹):")
      return ctx.wizard.next()
    },
    // Step 6: Ask for winner prize
    async (ctx) => {
      const perKillReward = Number.parseInt(ctx.message.text)
      if (isNaN(perKillReward) || perKillReward < 0) {
        await ctx.reply("Please enter a valid per kill reward (a positive number):")
        return
      }

      ctx.wizard.state.tournamentData.per_kill_reward = perKillReward
      await ctx.reply("Enter the winner prize amount (in ₹):")
      return ctx.wizard.next()
    },
    // Step 7: Ask for max players
    async (ctx) => {
      const winnerPrize = Number.parseInt(ctx.message.text)
      if (isNaN(winnerPrize) || winnerPrize < 0) {
        await ctx.reply("Please enter a valid winner prize (a positive number):")
        return
      }

      ctx.wizard.state.tournamentData.winner_prize = winnerPrize
      await ctx.reply(
        "Select the maximum number of players:",
        Markup.inlineKeyboard([
          [Markup.button.callback("50 Players", "players_50"), Markup.button.callback("100 Players", "players_100")],
        ]),
      )
      return ctx.wizard.next()
    },
    // Step 8: Ask for tournament date and time
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.wizard.next()
    },
    // Step 9: Confirm tournament details
    async (ctx) => {
      // This step will be handled by action handlers
      const tournamentData = ctx.wizard.state.tournamentData

      await ctx.reply(
        `📋 Tournament Details 📋\n\n` +
          `Name: ${tournamentData.name}\n` +
          `Mode: ${tournamentData.mode}\n` +
          `Map: ${tournamentData.map}\n` +
          `Entry Fee: ₹${tournamentData.entry_fee}\n` +
          `Per Kill Reward: ₹${tournamentData.per_kill_reward}\n` +
          `Winner Prize: ₹${tournamentData.winner_prize}\n` +
          `Max Players: ${tournamentData.max_players}\n` +
          `Start Time: ${tournamentData.start_time}\n\n` +
          `Is this information correct?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Confirm", "confirm_tournament"),
            Markup.button.callback("❌ Cancel", "cancel_tournament"),
          ],
        ]),
      )

      return ctx.wizard.next()
    },
    // Step 10: Create tournament
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.scene.leave()
    },
  )

  // Handle mode selection
  scene.action(/mode_(.+)/, async (ctx) => {
    ctx.wizard.state.tournamentData.mode = ctx.match[1]
    await ctx.reply(
      "Select the map:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Erangel", "map_erangel"), Markup.button.callback("Miramar", "map_miramar")],
        [Markup.button.callback("Sanhok", "map_sanhok"), Markup.button.callback("Vikendi", "map_vikendi")],
      ]),
    )
    ctx.answerCbQuery()
  })

  // Handle map selection
  scene.action(/map_(.+)/, async (ctx) => {
    ctx.wizard.state.tournamentData.map = ctx.match[1]
    await ctx.reply("Enter the entry fee amount (in ₹):")
    ctx.answerCbQuery()
    ctx.wizard.next()
  })

  // Handle player count selection
  scene.action(/players_(\d+)/, async (ctx) => {
    ctx.wizard.state.tournamentData.max_players = Number.parseInt(ctx.match[1])
    await ctx.reply("Enter the tournament date and time (format: DD/MM/YYYY HH:MM):")
    ctx.answerCbQuery()
    ctx.wizard.next()
  })

  // Handle date and time input
  scene.on("text", async (ctx, next) => {
    if (ctx.wizard.cursor === 8) {
      const dateTimeStr = ctx.message.text.trim()
      const dateTimeRegex = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/
      const match = dateTimeStr.match(dateTimeRegex)

      if (!match) {
        await ctx.reply("Invalid date format. Please enter in DD/MM/YYYY HH:MM format:")
        return
      }

      const [_, day, month, year, hour, minute] = match
      const tournamentDate = new Date(year, month - 1, day, hour, minute)

      if (isNaN(tournamentDate.getTime()) || tournamentDate <= new Date()) {
        await ctx.reply("Please enter a valid future date and time:")
        return
      }

      ctx.wizard.state.tournamentData.start_time = tournamentDate.toISOString()
      ctx.wizard.next()
      return next()
    }
    return next()
  })

  // Handle tournament confirmation
  scene.action("confirm_tournament", async (ctx) => {
    const tournamentData = ctx.wizard.state.tournamentData

    try {
      // Create tournament in database
      const { data: tournament, error } = await supabase
        .from("tournaments")
        .insert({
          name: tournamentData.name,
          mode: tournamentData.mode,
          map: tournamentData.map,
          entry_fee: tournamentData.entry_fee,
          per_kill_reward: tournamentData.per_kill_reward,
          winner_prize: tournamentData.winner_prize,
          max_players: tournamentData.max_players,
          registered_players: 0,
          start_time: tournamentData.start_time,
          status: "open",
          created_by: ctx.from.id,
          created_at: new Date(),
        })
        .select()
        .single()

      if (error) throw error

      await ctx.reply(`✅ Tournament created successfully!\n\nTournament ID: ${tournament.id}`)

      // Notify users who have opted in for tournament notifications
      const { data: subscribedUsers } = await supabase
        .from("users")
        .select("telegram_id")
        .eq("tournament_notifications", true)
        .eq("is_banned", false)

      if (subscribedUsers && subscribedUsers.length > 0) {
        const tournamentTime = new Date(tournament.start_time).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })

        for (const user of subscribedUsers) {
          try {
            await ctx.telegram.sendMessage(
              user.telegram_id,
              `🏆 New Tournament Alert 🏆\n\n` +
                `${tournament.name}\n\n` +
                `Mode: ${tournament.mode}\n` +
                `Map: ${tournament.map}\n` +
                `Time: ${tournamentTime}\n\n` +
                `Entry Fee: ₹${tournament.entry_fee}\n` +
                `Per Kill: ₹${tournament.per_kill_reward}\n` +
                `Winner Prize: ₹${tournament.winner_prize}\n\n` +
                `Use /tournaments to join!`,
            )
          } catch (err) {
            console.error(`Failed to notify user ${user.telegram_id}:`, err)
          }

          // Add a small delay to avoid hitting rate limits
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
    } catch (error) {
      console.error("Tournament creation error:", error)
      await ctx.reply("An error occurred while creating the tournament. Please try again.")
    }

    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  // Handle tournament cancellation
  scene.action("cancel_tournament", async (ctx) => {
    await ctx.reply("Tournament creation cancelled.")
    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  // Handle scene cancellation
  scene.command("cancel", async (ctx) => {
    await ctx.reply("Tournament creation cancelled.")
    return ctx.scene.leave()
  })

  return scene
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

module.exports = { tournamentCreationScene }

