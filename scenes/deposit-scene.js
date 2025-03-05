const { Scenes, Markup } = require("telegraf")
const { createRazorpayOrder, createRazorpayPaymentLink } = require("../payment/razorpay")
const { nanoid } = require("nanoid")

/**
 * Create deposit scene
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Scenes.WizardScene} Deposit wizard scene
 */
function depositScene(supabase) {
  const scene = new Scenes.WizardScene(
    "depositScene",
    // Step 1: Ask for deposit amount
    async (ctx) => {
      // Check if user is registered
      const { data: user, error } = await supabase.from("users").select("*").eq("telegram_id", ctx.from.id).single()

      if (error || !user) {
        await ctx.reply("You need to register first. Use /register command.")
        return ctx.scene.leave()
      }

      await ctx.reply(
        `💰 Deposit Funds 💰\n\n` +
          `Current Balance: ₹${user.balance.toFixed(2)}\n\n` +
          `Please enter the amount you want to deposit (minimum ₹10):`,
      )

      ctx.wizard.state.user = user
      return ctx.wizard.next()
    },
    // Step 2: Process deposit amount and show payment options
    async (ctx) => {
      const amountText = ctx.message.text.trim()
      const amount = Number.parseFloat(amountText)

      if (isNaN(amount) || amount < 10) {
        await ctx.reply("Please enter a valid amount (minimum ₹10):")
        return
      }

      ctx.wizard.state.amount = amount

      await ctx.reply(
        `You are about to deposit ₹${amount.toFixed(2)}.\n\n` + `Choose your payment method:`,
        Markup.inlineKeyboard([
          [Markup.button.callback("UPI / Google Pay / PhonePe", "payment_method_upi")],
          [Markup.button.callback("Credit / Debit Card", "payment_method_card")],
          [Markup.button.callback("Cancel", "cancel_deposit")],
        ]),
      )

      return ctx.wizard.next()
    },
    // Step 3: Process payment method and create payment
    async (ctx) => {
      // This step will be handled by action handlers
      return ctx.wizard.next()
    },
  )

  // Handle payment method selection
  scene.action("payment_method_upi", async (ctx) => {
    await processPayment(ctx, "upi")
  })

  scene.action("payment_method_card", async (ctx) => {
    await processPayment(ctx, "card")
  })

  scene.action("cancel_deposit", async (ctx) => {
    await ctx.reply("Deposit cancelled.")
    ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  // Handle scene cancellation
  scene.command("cancel", async (ctx) => {
    await ctx.reply("Deposit cancelled.")
    return ctx.scene.leave()
  })

  return scene
}

/**
 * Process payment
 * @param {Context} ctx - Telegraf context
 * @param {string} method - Payment method
 */
async function processPayment(ctx, method) {
  try {
    const user = ctx.wizard.state.user
    const amount = ctx.wizard.state.amount

    // Generate order ID
    const orderId = `order_${nanoid(10)}`

    // Create payment in database
    const { data: payment, error } = await ctx.wizard.state.supabase
      .from("payments")
      .insert({
        user_id: user.id,
        amount,
        order_id: orderId,
        status: "pending",
        gateway: process.env.PAYMENT_GATEWAY || "razorpay",
      })
      .select()
      .single()

    if (error) throw error

    // Create payment link based on gateway
    if (process.env.PAYMENT_GATEWAY === "razorpay") {
      // Create Razorpay order
      const order = await createRazorpayOrder(amount, orderId, {
        user_id: user.id,
        telegram_id: user.telegram_id,
      })

      // Create payment link
      const paymentLink = await createRazorpayPaymentLink(
        amount,
        orderId,
        `Deposit ₹${amount} to BGMI Tournament Wallet`,
        user.name,
        user.mobile,
      )

      // Update payment with link details
      await ctx.wizard.state.supabase
        .from("payments")
        .update({
          payment_link_id: paymentLink.id,
          payment_link: paymentLink.short_url,
        })
        .eq("id", payment.id)

      // Send payment link
      await ctx.reply(
        `Click the link below to make payment:\n\n` +
          `${paymentLink.short_url}\n\n` +
          `Amount: ₹${amount}\n` +
          `Order ID: ${orderId}\n\n` +
          `Your balance will be updated automatically after successful payment.`,
      )
    } else if (process.env.PAYMENT_GATEWAY === "paytm") {
      // Implement Paytm payment flow here
      // For now, we'll just show a placeholder
      await ctx.reply(
        `Click the link below to make payment:\n\n` +
          `https://paytm.com/payment-link/${orderId}\n\n` +
          `Amount: ₹${amount}\n` +
          `Order ID: ${orderId}\n\n` +
          `Your balance will be updated automatically after successful payment.`,
      )
    } else {
      throw new Error("Invalid payment gateway configuration")
    }
  } catch (error) {
    console.error("Payment error:", error)
    await ctx.reply("An error occurred. Please try again or contact support.")
  }

  ctx.answerCbQuery()
  return ctx.scene.leave()
}

module.exports = { depositScene }

