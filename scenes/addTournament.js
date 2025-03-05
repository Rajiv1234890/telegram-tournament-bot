import { Scenes } from "telegraf"
import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// Add tournament scene
export const addTournamentScene = new Scenes.WizardScene(
  "addTournament",
  // Step 1: Ask for tournament name
  async (ctx) => {
    ctx.reply("Please enter the tournament name:")
    return ctx.wizard.next()
  },
  // Step 2: Ask for game type
  async (ctx) => {
    ctx.wizard.state.name = ctx.message.text
    ctx.reply("Select game type:", {
      reply_markup: {
        inline_keyboard: [[{ text: "BGMI", callback_data: "BGMI" }], [{ text: "Ludo", callback_data: "Ludo" }]],
      },
    })
    return ctx.wizard.next()
  },
  // Step 3: Ask for entry fee
  async (ctx) => {
    if (ctx.callbackQuery) {
      ctx.wizard.state.gameType = ctx.callbackQuery.data
      await ctx.answerCbQuery()
    } else {
      ctx.wizard.state.gameType = ctx.message.text
    }

    ctx.reply("Enter the entry fee (in ₹):")
    return ctx.wizard.next()
  },
  // Step 4: Ask for prize pool
  async (ctx) => {
    ctx.wizard.state.entryFee = Number.parseFloat(ctx.message.text)
    ctx.reply("Enter the prize pool (in ₹):")
    return ctx.wizard.next()
  },
  // Step 5: Ask for max players
  async (ctx) => {
    ctx.wizard.state.prizePool = Number.parseFloat(ctx.message.text)
    ctx.reply("Enter the maximum number of players:")
    return ctx.wizard.next()
  },
  // Step 6: Ask for tournament date
  async (ctx) => {
    ctx.wizard.state.maxPlayers = Number.parseInt(ctx.message.text)
    ctx.reply("Enter the tournament date (YYYY-MM-DD):")
    return ctx.wizard.next()
  },
  // Step 7: Ask for tournament time
  async (ctx) => {
    ctx.wizard.state.date = ctx.message.text
    ctx.reply("Enter the tournament time (HH:MM):")
    return ctx.wizard.next()
  },
  // Step 8: Save tournament data
  async (ctx) => {
    ctx.wizard.state.time = ctx.message.text

    // Combine date and time
    const startTime = new Date(`${ctx.wizard.state.date}T${ctx.wizard.state.time}:00`)

    // Save tournament data to database
    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        name: ctx.wizard.state.name,
        game_type: ctx.wizard.state.gameType,
        entry_fee: ctx.wizard.state.entryFee,
        prize_pool: ctx.wizard.state.prizePool,
        max_players: ctx.wizard.state.maxPlayers,
        registered_players: 0,
        start_time: startTime.toISOString(),
        created_by: ctx.from.id,
        created_at: new Date(),
      })
      .select()

    if (error) {
      console.error("Error creating tournament:", error)
      ctx.reply("An error occurred. Please try again later.")
    } else {
      const tournamentId = data[0].id

      ctx.reply(
        `✅ Tournament created successfully!\n\n` +
          `ID: ${tournamentId}\n` +
          `Name: ${ctx.wizard.state.name}\n` +
          `Game: ${ctx.wizard.state.gameType}\n` +
          `Entry Fee: ₹${ctx.wizard.state.entryFee}\n` +
          `Prize Pool: ₹${ctx.wizard.state.prizePool}\n` +
          `Max Players: ${ctx.wizard.state.maxPlayers}\n` +
          `Start Time: ${startTime.toLocaleString()}\n\n` +
          `Users can join with: /join ${tournamentId}`,
      )

      // Broadcast to all users
      const { data: users } = await supabase.from("users").select("telegram_id")

      if (users && users.length > 0) {
        const message =
          `🏆 *New Tournament Added*\n\n` +
          `*${ctx.wizard.state.name}*\n` +
          `Game: ${ctx.wizard.state.gameType}\n` +
          `Entry Fee: ₹${ctx.wizard.state.entryFee}\n` +
          `Prize Pool: ₹${ctx.wizard.state.prizePool}\n` +
          `Start Time: ${startTime.toLocaleString()}\n\n` +
          `Join now with: /join ${tournamentId}`

        for (const user of users) {
          try {
            await ctx.telegram.sendMessage(user.telegram_id, message, {
              parse_mode: "Markdown",
            })
          } catch (e) {
            console.error(`Failed to send notification to user ${user.telegram_id}:`, e)
          }
        }
      }
    }

    return ctx.scene.leave()
  },
)
