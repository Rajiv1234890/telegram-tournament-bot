const { createRazorpayOrder, verifyRazorpayPayment } = require("./razorpay")
const { createPaytmOrder, verifyPaytmPayment } = require("./paytm")

/**
 * Set up payment system
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {SupabaseClient} supabase - Supabase client
 */
function setupPaymentSystem(bot, supabase) {
  // Handle deposit command
  bot.hears("💰 Deposit", async (ctx) => {
    ctx.scene.enter("depositScene")
  })

  // Handle payment callbacks
  bot.action(/payment_razorpay_(.+)/, async (ctx) => {
    const orderId = ctx.match[1]
    try {
      // Get payment details from database
      const { data: payment, error } = await supabase.from("payments").select("*").eq("order_id", orderId).single()

      if (error || !payment) {
        return ctx.reply("Payment not found. Please try again or contact support.")
      }

      // Open Razorpay payment page
      await ctx.reply(
        `Click the link below to make payment:\n\n` +
          `https://rzp.io/i/${payment.payment_link_id}\n\n` +
          `Amount: ₹${payment.amount}\n` +
          `Order ID: ${payment.order_id}\n\n` +
          `Your balance will be updated automatically after successful payment.`,
      )
    } catch (error) {
      console.error("Payment error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }
  })

  bot.action(/payment_paytm_(.+)/, async (ctx) => {
    const orderId = ctx.match[1]
    try {
      // Get payment details from database
      const { data: payment, error } = await supabase.from("payments").select("*").eq("order_id", orderId).single()

      if (error || !payment) {
        return ctx.reply("Payment not found. Please try again or contact support.")
      }

      // Open Paytm payment page
      await ctx.reply(
        `Click the link below to make payment:\n\n` +
          `${payment.payment_link}\n\n` +
          `Amount: ₹${payment.amount}\n` +
          `Order ID: ${payment.order_id}\n\n` +
          `Your balance will be updated automatically after successful payment.`,
      )
    } catch (error) {
      console.error("Payment error:", error)
      await ctx.reply("An error occurred. Please try again or contact support.")
    }
  })

  // Set up webhook for payment verification
  // This would be implemented in a separate server file
}

module.exports = { setupPaymentSystem }

