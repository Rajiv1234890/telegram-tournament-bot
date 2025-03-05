import { Scenes } from "telegraf"
import { createClient } from "@supabase/supabase-js"
import { isTournamentFull, updateTournamentCount, generateTransactionId } from "../utils.js"

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// Join tournament scene
export const joinTournamentScene = new Scenes.WizardScene(
  "joinTournament",
  // Step 1: Check tournament and user details
  async (ctx) => {
    const tournamentId = ctx.scene.state.tournamentId
    const userId = ctx.from.id

    // Check if tournament exists
    const { data: tournament, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single()

    if (error || !tournament) {
      ctx.reply("Tournament not found. Please check the ID and try again.")
      return ctx.scene.leave()
    }

    // Check if tournament is full
    if (await isTournamentFull(tournamentId)) {
      ctx.reply("Sorry, this tournament is already full.")
      return ctx.scene.leave()
    }

    // Check if user is already registered
    const { data: registration } = await supabase
      .from("registrations")
      .select("*")
      .eq("user_id", userId)
      .eq("tournament_id", tournamentId)
      .single()

    if (registration) {
      ctx.reply(
        `You are already registered for this tournament.\n\n` +
          `Status: ${registration.payment_status}\n\n` +
          `Use /mytournaments to view your registrations.`,
      )
      return ctx.scene.leave()
    }

    // Check if user has completed profile
    const { data: user } = await supabase
      .from("users")
      .select("in_game_name, game_id, wallet_balance")
      .eq("telegram_id", userId)
      .single()

    if (!user || !user.in_game_name || !user.game_id) {
      ctx.reply(
        "Please complete your profile before joining a tournament.\n\n" + "Use /register to set up your profile.",
      )
      return ctx.scene.leave()
    }

    ctx.wizard.state.tournament = tournament
    ctx.wizard.state.user = user

    // Ask for payment method
    ctx.reply(
      `You are about to join: *${tournament.name}*\n\n` +
        `Entry Fee: ₹${tournament.entry_fee}\n` +
        `Your Wallet Balance: ₹${user.wallet_balance}\n\n` +
        `Choose payment method:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Pay from Wallet", callback_data: "wallet" }],
            [{ text: "Pay via UPI", callback_data: "upi" }],
            [{ text: "Cancel", callback_data: "cancel" }],
          ],
        },
      },
    )

    return ctx.wizard.next()
  },
  // Step 2: Handle payment method
  async (ctx) => {
    if (!ctx.callbackQuery) {
      ctx.reply("Please select a payment method using the buttons above.")
      return
    }

    const choice = ctx.callbackQuery.data
    await ctx.answerCbQuery()

    if (choice === "cancel") {
      ctx.reply("Registration cancelled.")
      return ctx.scene.leave()
    }

    const userId = ctx.from.id
    const tournament = ctx.wizard.state.tournament
    const user = ctx.wizard.state.user

    if (choice === "wallet") {
      // Check if user has enough balance
      if (user.wallet_balance < tournament.entry_fee) {
        ctx.reply(
          `Insufficient wallet balance.\n\n` +
            `Required: ₹${tournament.entry_fee}\n` +
            `Your Balance: ₹${user.wallet_balance}\n\n` +
            `Please add funds to your wallet or choose a different payment method.`,
        )
        return ctx.scene.leave()
      }

      // Deduct from wallet
      const newBalance = user.wallet_balance - tournament.entry_fee

      await supabase.from("users").update({ wallet_balance: newBalance }).eq("telegram_id", userId)

      // Create transaction record
      const transactionId = generateTransactionId()

      await supabase.from("transactions").insert({
        user_id: userId,
        amount: tournament.entry_fee,
        type: "tournament_fee",
        status: "completed",
        transaction_id: transactionId,
        tournament_id: tournament.id,
        created_at: new Date(),
      })

      // Register user for tournament
      await supabase.from("registrations").insert({
        user_id: userId,
        tournament_id: tournament.id,
        payment_status: "completed",
        payment_method: "wallet",
        transaction_id: transactionId,
        registered_at: new Date(),
      })

      // Update tournament count
      await updateTournamentCount(tournament.id)

      ctx.reply(
        `✅ Registration successful!\n\n` +
          `Tournament: ${tournament.name}\n` +
          `Entry Fee: ₹${tournament.entry_fee} (paid from wallet)\n` +
          `New Wallet Balance: ₹${newBalance.toFixed(2)}\n\n` +
          `Use /mytournaments to view your registrations.\n` +
          `Room details will be shared before the tournament starts.`,
      )

      return ctx.scene.leave()
    } else if (choice === "upi") {
      // Generate UPI payment details
      const transactionId = generateTransactionId()
      ctx.wizard.state.transactionId = transactionId

      // Create pending registration
      await supabase.from("registrations").insert({
        user_id: userId,
        tournament_id: tournament.id,
        payment_status: "pending",
        payment_method: "upi",
        transaction_id: transactionId,
        registered_at: new Date(),
      })

      // In a real app, you would integrate with a payment gateway here
      // For this example, we'll simulate a UPI payment

      ctx.reply(
        `📱 *UPI Payment*\n\n` +
          `Amount: ₹${tournament.entry_fee}\n` +
          `Transaction ID: ${transactionId}\n\n` +
          `Please send payment to:\n` +
          `UPI ID: example@upi\n\n` +
          `After sending payment, click the button below:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "I have paid", callback_data: "paid" }],
              [{ text: "Cancel", callback_data: "cancel_payment" }],
            ],
          },
        },
      )

      return ctx.wizard.next()
    }
  },
  // Step 3: Handle UPI payment confirmation
  async (ctx) => {
    if (!ctx.callbackQuery) {
      ctx.reply("Please use the buttons to confirm your payment.")
      return
    }

    const choice = ctx.callbackQuery.data
    await ctx.answerCbQuery()

    if (choice === "cancel_payment") {
      // Delete pending registration
      await supabase.from("registrations").delete().eq("transaction_id", ctx.wizard.state.transactionId)

      ctx.reply("Payment cancelled. Your registration has been cancelled.")
      return ctx.scene.leave()
    }

    if (choice === "paid") {
      // In a real app, you would verify the payment with your payment gateway
      // For this example, we'll assume the payment is successful

      const userId = ctx.from.id
      const tournament = ctx.wizard.state.tournament

      // Update registration status
      await supabase
        .from("registrations")
        .update({ payment_status: "completed" })
        .eq("transaction_id", ctx.wizard.state.transactionId)

      // Create transaction record
      await supabase.from("transactions").insert({
        user_id: userId,
        amount: tournament.entry_fee,
        type: "tournament_fee",
        status: "completed",
        transaction_id: ctx.wizard.state.transactionId,
        tournament_id: tournament.id,
        created_at: new Date(),
      })

      // Update tournament count
      await updateTournamentCount(tournament.id)

      ctx.reply(
        `✅ Payment confirmed! Registration successful.\n\n` +
          `Tournament: ${tournament.name}\n` +
          `Entry Fee: ₹${tournament.entry_fee} (paid via UPI)\n\n` +
          `Use /mytournaments to view your registrations.\n` +
          `Room details will be shared before the tournament starts.`,
      )

      return ctx.scene.leave()
    }
  },
)

