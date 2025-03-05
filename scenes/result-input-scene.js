const { Scenes, Markup } = require("telegraf")

/**
 * Create result input scene
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Scenes.WizardScene} Result input wizard scene
 */
function resultInputScene(supabase) {
  const scene = new Scenes.WizardScene(
    "resultInputScene",
    // Step 1: Initialize and show registered players
    async (ctx) => {
      // Check if user is admin
      const isAdmin = await checkAdmin(ctx.from.id, supabase)
      if (!isAdmin) {
        await ctx.reply("You do not have permission to input results.")
        return ctx.scene.leave()
      }

      const tournamentId = ctx.scene.state.tournamentId
      if (!tournamentId) {
        await ctx.reply("Invalid tournament ID.")
        return ctx.scene.leave()
      }

      // Get tournament details
      const { data: tournament, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single()

      if (error || !tournament) {
        await ctx.reply("Tournament not found.")
        return ctx.scene.leave()
      }

      ctx.scene.state.tournament = tournament

      // Get registered players
      const { data: registrations, error: regError } = await supabase
        .from("tournament_registrations")
        .select("*, users(id, name, bgmi_ign, bgmi_player_id)")
        .eq("tournament_id", tournamentId)

      if (regError) {
        console.error("Error fetching registrations:", regError)
        await ctx.reply("An error occurred. Please try again.")
        return ctx.scene.leave()
      }

      if (!registrations || registrations.length === 0) {
        await ctx.reply("No players registered for this tournament.")
        return ctx.scene.leave()
      }

      ctx.scene.state.registrations = registrations
      ctx.scene.state.currentPlayerIndex = 0
      ctx.scene.state.results = []

      await ctx.reply(
        `📊 Result Input for ${tournament.name} 📊\n\n` +
          `Total Players: ${registrations.length}\n` +
          `Per Kill Reward: ₹${tournament.per_kill_reward}\n` +
          `Winner Prize: ₹${tournament.winner_prize}\n\n` +
          `Please input results for each player. Let's start with the first player.`,
      )

      await showPlayerPrompt(ctx)

      return ctx.wizard.next()
    },
    // Step 2: Process player results
    async (ctx) => {
      const killsText = ctx.message.text.trim()
      const kills = Number.parseInt(killsText)

      if (isNaN(kills) || kills < 0) {
        await ctx.reply("Please enter a valid number of kills (0 or positive number):")
        return
      }

      const currentIndex = ctx.scene.state.currentPlayerIndex
      const registration = ctx.scene.state.registrations[currentIndex]

      // Store result
      ctx.scene.state.results.push({
        user_id: registration.user_id,
        kills,
        position: null, // Will be set later for the winner
      })

      // Move to next player or finish
      ctx.scene.state.currentPlayerIndex++

      if (ctx.scene.state.currentPlayerIndex < ctx.scene.state.registrations.length) {
        // More players to process
        await showPlayerPrompt(ctx)
        return
      } else {
        // All players processed, ask for winner
        await ctx.reply(
          "All player kills recorded. Now, please enter the player number who won the tournament:",
          Markup.inlineKeyboard(
            ctx.scene.state.registrations.map((reg, index) =>
              Markup.button.callback(`${index + 1}. ${reg.users.bgmi_ign}`, `winner_${index}`),
            ),
          ),
        )

        return ctx.wizard.next()
      }
    },
    // Step 3: Process winner and finalize results
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.wizard.next()
    },
    // Step 4: Confirm and save results
    async (ctx) => {
      const tournament = ctx.scene.state.tournament
      const results = ctx.scene.state.results
      const winner = ctx.scene.state.winner

      // Calculate total kills and rewards
      let totalKills = 0
      let totalRewards = 0

      const resultsSummary = results.map((result, index) => {
        const registration = ctx.scene.state.registrations[index]
        const killReward = result.kills * tournament.per_kill_reward
        const winnerReward = result.user_id === winner.user_id ? tournament.winner_prize : 0
        const totalReward = killReward + winnerReward

        totalKills += result.kills
        totalRewards += totalReward

        return {
          ...result,
          player_name: registration.users.bgmi_ign,
          kill_reward: killReward,
          winner_reward: winnerReward,
          total_reward: totalReward,
        }
      })

      // Display summary
      let summaryMessage =
        `📊 Tournament Results Summary 📊\n\n` +
        `Tournament: ${tournament.name}\n` +
        `Total Kills: ${totalKills}\n` +
        `Total Rewards: ₹${totalRewards}\n\n` +
        `Winner: ${winner.player_name} (₹${tournament.winner_prize})\n\n` +
        `Player Results:\n`

      resultsSummary.forEach((result) => {
        summaryMessage += `${result.player_name}: ${result.kills} kills (₹${result.kill_reward})`
        if (result.user_id === winner.user_id) {
          summaryMessage += ` + Winner Prize (₹${result.winner_reward})`
        }
        summaryMessage += ` = ₹${result.total_reward}\n`
      })

      await ctx.reply(
        summaryMessage + "\n\nIs this correct?",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Confirm", "confirm_results"),
            Markup.button.callback("❌ Cancel", "cancel_results"),
          ],
        ]),
      )

      return ctx.wizard.next()
    },
    // Step 5: Save results to database
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.scene.leave()
    },
  )

  // Handle winner selection
  scene.action(/winner_(\d+)/, async (ctx) => {
    const winnerIndex = Number.parseInt(ctx.match[1])
    const registration = ctx.scene.state.registrations[winnerIndex]
    const result = ctx.scene.state.results[winnerIndex]

    // Set winner
    ctx.scene.state.winner = {
      user_id: registration.user_id,
      player_name: registration.users.bgmi_ign,
    }

    // Update result with position
    result.position = 1

    await ctx.reply(`Winner set to: ${registration.users.bgmi_ign}`)
    ctx.answerCbQuery()
    ctx.wizard.next()
  })

  // Handle results confirmation
  scene.action("confirm_results", async (ctx) => {
    try {
      const tournament = ctx.scene.state.tournament
      const results = ctx.scene.state.results
      const winner = ctx.scene.state.winner

      // Update tournament status
      await supabase.from("tournaments").update({ status: "completed" }).eq("id", tournament.id)

      // Save results
      for (const result of results) {
        const registration = ctx.scene.state.registrations.find((r) => r.user_id === result.user_id)
        const killReward = result.kills * tournament.per_kill_reward
        const winnerReward = result.user_id === winner.user_id ? tournament.winner_prize : 0
        const totalReward = killReward + winnerReward

        // Save result
        await supabase.from("tournament_results").insert({
          tournament_id: tournament.id,
          user_id: result.user_id,
          kills: result.kills,
          position: result.user_id === winner.user_id ? 1 : null,
          kill_reward: killReward,
          winner_reward: winnerReward,
          total_reward: totalReward,
        })

        // Update user balance
        if (totalReward > 0) {
          await supabase
            .from("users")
            .update({
              balance: supabase.rpc("increment_balance", { amount: totalReward }),
            })
            .eq("id", result.user_id)

          // Record transaction
          await supabase.from("transactions").insert({
            user_id: result.user_id,
            amount: totalReward,
            type: "tournament_reward",
            status: "completed",
            description: `Reward for tournament: ${tournament.name} (${result.kills} kills${result.user_id === winner.user_id ? " + Winner" : ""})`,
          })

          // Notify user
          const { data: user } = await supabase.from("users").select("telegram_id").eq("id", result.user_id).single()

          if (user) {
            try {
              await ctx.telegram.sendMessage(
                user.telegram_id,
                `🎮 Tournament Results 🎮\n\n` +
                  `Tournament: ${tournament.name}\n\n` +
                  `Your Performance:\n` +
                  `Kills: ${result.kills} (₹${killReward})` +
                  (result.user_id === winner.user_id ? `\nWinner Prize: ₹${winnerReward}` : "") +
                  `\n\nTotal Reward: ₹${totalReward}\n\n` +
                  `The amount has been added to your balance. Use /withdraw to withdraw your earnings.`,
              )
            } catch (err) {
              console.error(`Failed to notify user ${user.telegram_id}:`, err)
            }
          }
        }
      }

      await ctx.reply("✅ Results saved successfully!")
    } catch (error) {
      console.error("Save results error:", error)
      await ctx.reply("An error occurred while saving results. Please try again.")
    }

    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  // Handle results cancellation
  scene.action("cancel_results", async (ctx) => {
    await ctx.reply("Results input cancelled.")
    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  // Handle scene cancellation
  scene.command("cancel", async (ctx) => {
    await ctx.reply("Results input cancelled.")
    return ctx.scene.leave()
  })

  return scene
}

/**
 * Show prompt for current player
 * @param {Context} ctx - Telegraf context
 */
async function showPlayerPrompt(ctx) {
  const currentIndex = ctx.scene.state.currentPlayerIndex
  const registration = ctx.scene.state.registrations[currentIndex]

  await ctx.reply(
    `Player ${currentIndex + 1}/${ctx.scene.state.registrations.length}\n\n` +
      `Name: ${registration.users.name}\n` +
      `BGMI IGN: ${registration.users.bgmi_ign}\n` +
      `BGMI ID: ${registration.users.bgmi_player_id}\n\n` +
      `Please enter the number of kills for this player:`,
  )
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

module.exports = { resultInputScene }

