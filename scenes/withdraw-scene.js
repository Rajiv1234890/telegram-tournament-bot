const { Scenes, Markup } = require("telegraf")

/**
 * Create withdrawal scene
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Scenes.WizardScene} Withdrawal wizard scene
 */
function withdrawScene(supabase) {
  const scene = new Scenes.WizardScene(
    "withdrawScene",
    // Step 1: Ask for withdrawal amount
    async (ctx) => {
      // Check if user is registered
      const { data: user, error } = await supabase.from("users").select("*").eq("telegram_id", ctx.from.id).single()

      if (error || !user) {
        await ctx.reply("You need to register first. Use /register command.")
        return ctx.scene.leave()
      }

      // Check if user has sufficient balance
      if (user.balance < 100) {
        await ctx.reply(
          `Insufficient balance. Minimum withdrawal amount is ₹100.\n\n` +
            `Your current balance: ₹${user.balance.toFixed(2)}\n\n` +
            `Participate in tournaments to earn more!`,
        )
        return ctx.scene.leave()
      }

      await ctx.reply(
        `💸 Withdraw Funds 💸\n\n` +
          `Current Balance: ₹${user.balance.toFixed(2)}\n\n` +
          `Please enter the amount you want to withdraw (minimum ₹100):`,
      )

      ctx.wizard.state.user = user
      return ctx.wizard.next()
    },
    // Step 2: Process withdrawal amount and confirm UPI ID
    async (ctx) => {
      const amountText = ctx.message.text.trim()
      const amount = Number.parseFloat(amountText)

      if (isNaN(amount) || amount < 100) {
        await ctx.reply("Please enter a valid amount (minimum ₹100):")
        return
      }

      if (amount > ctx.wizard.state.user.balance) {
        await ctx.reply(
          `Insufficient balance. You can withdraw up to ₹${ctx.wizard.state.user.balance.toFixed(2)}.\n\n` +
            `Please enter a smaller amount:`,
        )
        return
      }

      ctx.wizard.state.amount = amount

      await ctx.reply(
        `Your registered UPI ID is: ${ctx.wizard.state.user.upi_id}\n\n` +
          `Do you want to use this UPI ID for withdrawal?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("Yes", "use_registered_upi"),
            Markup.button.callback("No, use different UPI", "use_different_upi"),
          ],
          [Markup.button.callback("Cancel", "cancel_withdrawal")],
        ]),
      )

      return ctx.wizard.next()
    },
    // Step 3: Process UPI selection or ask for new UPI
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.wizard.next()
    },
    // Step 4: Confirm withdrawal
    async (ctx) => {
      // If user chose to use a different UPI ID
      if (ctx.wizard.state.askForUPI) {
        const upiId = ctx.message.text.trim()

        // Validate UPI ID
        if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(upiId)) {
          await ctx.reply("Invalid UPI ID. Please enter a valid UPI ID (e.g., name@upi):")
          return
        }

        ctx.wizard.state.upiId = upiId
      }

      const amount = ctx.wizard.state.amount
      const upiId = ctx.wizard.state.upiId || ctx.wizard.state.user.upi_id

      await ctx.reply(
        `📋 Withdrawal Summary 📋\n\n` +
          `Amount: ₹${amount.toFixed(2)}\n` +
          `UPI ID: ${upiId}\n\n` +
          `Please confirm your withdrawal:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Confirm", "confirm_withdrawal"),
            Markup.button.callback("❌ Cancel", "cancel_withdrawal"),
          ],
        ]),
      )

      return ctx.wizard.next()
    },
    // Step 5: Process withdrawal
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.scene.leave()
    },
  )

  // Handle UPI selection
  scene.action("use_registered_upi", async (ctx) => {
    ctx.wizard.state.upiId = ctx.wizard.state.user.upi_id
    ctx.answerCbQuery()
    ctx.wizard.next()

    const amount = ctx.wizard.state.amount
    const upiId = ctx.wizard.state.upiId

    await ctx.reply(
      `📋 Withdrawal Summary 📋\n\n` +
        `Amount: ₹${amount.toFixed(2)}\n` +
        `UPI ID: ${upiId}\n\n` +
        `Please confirm your withdrawal:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm", "confirm_withdrawal"),
          Markup.button.callback("❌ Cancel", "cancel_withdrawal"),
        ],
      ]),
    )
  })

  scene.action("use_different_upi", async (ctx) => {
    ctx.wizard.state.askForUPI = true
    await ctx.reply("Please enter your UPI ID (e.g., name@upi):")
    ctx.answerCbQuery()
  })

  // Handle withdrawal confirmation
  scene.action("confirm_withdrawal", async (ctx) => {
    try {
      const user = ctx.wizard.state.user
      const amount = ctx.wizard.state.amount
      const upiId = ctx.wizard.state.upiId || user.upi_id

      // Check if user still has sufficient balance
      const { data: updatedUser, error: userError } = await supabase
        .from("users")
        .select("balance")
        .eq("id", user.id)
        .single()

      if (userError) throw userError

      if (updatedUser.balance < amount) {
        await ctx.reply(
          `Insufficient balance. Your current balance is ₹${updatedUser.balance.toFixed(2)}.\n\n` +
            `Please try again with a smaller amount.`,
        )
        ctx.answerCbQuery()
        return ctx.scene.leave()
      }

      // Deduct amount from user's balance
      const { error: updateError } = await supabase
        .from("users")
        .update({ balance: updatedUser.balance - amount })
        .eq("id", user.id)

      if (updateError) throw updateError

      // Create withdrawal record
      const { data: withdrawal, error: withdrawalError } = await supabase
        .from("withdrawals")
        .insert({
          user_id: user.id,
          amount,
          upi_id: upiId,
          status: "pending",
          created_at: new Date(),
        })
        .select()
        .single()

      if (withdrawalError) throw withdrawalError

      // Notify admins about withdrawal request
      const { data: admins } = await supabase.from("users").select("telegram_id").eq("is_admin", true)

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          try {
            await ctx.telegram.sendMessage(
              admin.telegram_id,
              `🔔 New Withdrawal Request 🔔\n\n` +
                `User: ${user.name}\n` +
                `Amount: ₹${amount}\n` +
                `UPI ID: ${upiId}\n\n` +
                `Please process this request.`,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback("✅ Approve", `approve_withdrawal_${withdrawal.id}`),
                  Markup.button.callback("❌ Reject", `reject_withdrawal_${withdrawal.id}`),
                ],
              ]),
            )
          } catch (err) {
            console.error(`Failed to notify admin ${admin.telegram_id}:`, err)
          }
        }
      }

      await ctx.reply(
        `✅ Withdrawal request submitted successfully!\n\n` +
          `Amount: ₹${amount}\n` +
          `UPI ID: ${upiId}\n\n` +
          `Your request is being processed. You will receive a notification once it's completed.\n\n` +
          `New Balance: ₹${(updatedUser.balance - amount).toFixed(2)}`,
      )
    } catch (error) {
      console.error("Withdrawal error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }

    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  scene.action("cancel_withdrawal", async (ctx) => {
    await ctx.reply("Withdrawal cancelled.")
    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  // Handle scene cancellation
  scene.command("cancel", async (ctx) => {
    await ctx.reply("Withdrawal cancelled.")
    return ctx.scene.leave()
  })

  return scene
}

module.exports = { withdrawScene }

