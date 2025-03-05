const Razorpay = require("razorpay")
const crypto = require("crypto")

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

/**
 * Create a Razorpay order
 * @param {number} amount - Amount in INR
 * @param {string} receipt - Receipt ID
 * @param {Object} notes - Additional notes
 * @returns {Promise<Object>} Razorpay order
 */
async function createRazorpayOrder(amount, receipt, notes = {}) {
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt,
      notes,
    })

    return order
  } catch (error) {
    console.error("Razorpay order creation error:", error)
    throw error
  }
}

/**
 * Create a Razorpay payment link
 * @param {number} amount - Amount in INR
 * @param {string} orderId - Order ID
 * @param {string} description - Payment description
 * @param {string} customerName - Customer name
 * @param {string} customerEmail - Customer email
 * @param {string} customerPhone - Customer phone
 * @returns {Promise<Object>} Razorpay payment link
 */
async function createRazorpayPaymentLink(amount, orderId, description, customerName, customerPhone) {
  try {
    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100, // Amount in paise
      currency: "INR",
      accept_partial: false,
      description,
      customer: {
        name: customerName,
        contact: customerPhone,
      },
      notify: {
        sms: true,
      },
      reminder_enable: true,
      notes: {
        order_id: orderId,
      },
      callback_url: `${process.env.WEBHOOK_URL}/razorpay-callback`,
      callback_method: "get",
    })

    return paymentLink
  } catch (error) {
    console.error("Razorpay payment link creation error:", error)
    throw error
  }
}

/**
 * Verify Razorpay payment
 * @param {string} orderId - Order ID
 * @param {string} paymentId - Payment ID
 * @param {string} signature - Razorpay signature
 * @returns {boolean} Whether payment is valid
 */
function verifyRazorpayPayment(orderId, paymentId, signature) {
  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex")

  return generatedSignature === signature
}

/**
 * Process Razorpay payout (withdrawal)
 * @param {string} accountNumber - Account number
 * @param {string} ifscCode - IFSC code
 * @param {number} amount - Amount in INR
 * @param {string} name - Account holder name
 * @param {string} reference - Reference ID
 * @returns {Promise<Object>} Payout details
 */
async function processRazorpayPayout(accountNumber, ifscCode, amount, name, reference) {
  try {
    const payout = await razorpay.payouts.create({
      account_number: process.env.RAZORPAY_PAYOUT_ACCOUNT,
      fund_account: {
        account_type: "bank_account",
        bank_account: {
          name,
          ifsc: ifscCode,
          account_number: accountNumber,
        },
      },
      amount: amount * 100, // Amount in paise
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference,
      narration: "Tournament Winnings",
    })

    return payout
  } catch (error) {
    console.error("Razorpay payout error:", error)
    throw error
  }
}

module.exports = {
  createRazorpayOrder,
  createRazorpayPaymentLink,
  verifyRazorpayPayment,
  processRazorpayPayout,
}

