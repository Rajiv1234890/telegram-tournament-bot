const { processRazorpayPayout } = require("../payment/razorpay")
const { processPaytmPayout } = require("../payment/paytm")

/**
 * Set up withdrawal system
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function setupWithdrawalSystem(bot, supabase) {
  // Handle withdraw command
  bot.command("withdraw", (ctx) => {
    ctx.scene.enter("withdrawScene")
  })

  // Handle withdraw button
  bot.hears("💸 Withdraw", (ctx) => {
    ctx.scene.enter("withdrawScene")
  })

  // Handle withdrawal approval (admin only)
  bot.action(/approve_withdrawal_(.+)/, async (ctx) => {
    const withdrawalId = ctx.match[1]

    // Check if user is admin
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) {
      return ctx.reply("You do not have permission to approve withdrawals.")
    }

    try {
      // Get withdrawal details
      const { data: withdrawal, error } = await supabase
        .from("withdrawals")
        .select("*, users(*)")
        .eq("id", withdrawalId)
        .single()

      if (error || !withdrawal) {
        return ctx.reply("Withdrawal not found. Please try again.")
      }

      if (withdrawal.status !== "pending") {
        return ctx.reply(`This withdrawal is already ${withdrawal.status}.`)
      }

      // Process withdrawal based on payment method
      let payoutResult

      if (process.env.PAYMENT_GATEWAY === "razorpay") {
        payoutResult = await processRazorpayPayout(
          withdrawal.upi_id,
          null, // IFSC code not needed for UPI
          withdrawal.amount,
          withdrawal.users.name,
          `withdrawal_${withdrawal.id}`,
        )
      } else if (process.env.PAYMENT_GATEWAY === "paytm") {
        payoutResult = await processPaytmPayout(withdrawal.upi_id, withdrawal.amount, `withdrawal_${withdrawal.id}`)
      } else {
        throw new Error("Invalid payment gateway configuration")
      }

      // Update withdrawal status
      await supabase
        .from("withdrawals")
        .update({
          status: "completed",
          processed_at: new Date(),
          transaction_id: payoutResult.id || payoutResult.orderId,
        })
        .eq("id", withdrawalId)

      // Record transaction
      await supabase.from("transactions").insert({
        user_id: withdrawal.user_id,
        amount: -withdrawal.amount,
        type: "withdrawal",
        status: "completed",
        description: `Withdrawal to UPI ID: ${withdrawal.upi_id}`,
      })

      // Notify user
      await bot.telegram.sendMessage(
        withdrawal.users.telegram_id,
        `💸 Withdrawal Successful 💸\n\n` +
          `Amount: ₹${withdrawal.amount}\n` +
          `UPI ID: ${withdrawal.upi_id}\n` +
          `Transaction ID: ${payoutResult.id || payoutResult.orderId}\n\n` +
          `The amount has been transferred to your UPI ID. It may take a few minutes to reflect in your account.`,
      )

      await ctx.reply(`Withdrawal #${withdrawalId} has been approved and processed successfully.`)
    } catch (error) {
      console.error("Withdrawal approval error:", error)
      await ctx.reply(`An error occurred while processing the withdrawal: ${error.message}`)
    }
  })

  // Handle withdrawal rejection (admin only)
  bot.action(/reject_withdrawal_(.+)/, async (ctx) => {
    const withdrawalId = ctx.match[1]

    // Check if user is admin
    const isAdmin = await checkAdmin(ctx.from.id, supabase)
    if (!isAdmin) {
      return ctx.reply("You do not have permission to reject withdrawals.")
    }

    try {
      // Get withdrawal details
      const { data: withdrawal, error } = await supabase
        .from("withdrawals")
        .select("*, users(*)")
        .eq("id", withdrawalId)
        .single()

      if (error || !withdrawal) {
        return ctx.reply("Withdrawal not found. Please try again.")
      }

      if (withdrawal.status !== "pending") {
        return ctx.reply(`This withdrawal is already ${withdrawal.status}.`)
      }

      // Update withdrawal status
      await supabase
        .from("withdrawals")
        .update({
          status: "rejected",
          processed_at: new Date(),
        })
        .eq("id", withdrawalId)

      // Refund amount to user's balance
      await supabase
        .from("users")
        .update({
          balance: supabase.rpc("increment_balance", { amount: withdrawal.amount }),
        })
        .eq("id", withdrawal.user_id)

      // Record transaction
      await supabase.from("transactions").insert({
        user_id: withdrawal.user_id,
        amount: withdrawal.amount,
        type: "withdrawal_refund",
        status: "completed",
        description: `Refund for rejected withdrawal #${withdrawalId}`,
      })

      // Notify user
      await bot.telegram.sendMessage(
        withdrawal.users.telegram_id,
        `❌ Withdrawal Rejected ❌\n\n` +
          `Amount: ₹${withdrawal.amount}\n` +
          `UPI ID: ${withdrawal.upi_id}\n\n` +
          `Your withdrawal request has been rejected. The amount has been refunded to your balance.\n\n` +
          `Please contact support for more information.`,
      )

      await ctx.reply(`Withdrawal #${withdrawalId} has been rejected and the amount has been refunded.`)
    } catch (error) {
      console.error("Withdrawal rejection error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }
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

module.exports = { setupWithdrawalSystem }

