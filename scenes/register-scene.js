const { Scenes, Markup } = require("telegraf")
const { sendOTP, verifyOTP } = require("../utils/otp")

/**
 * Create registration scene
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Scenes.WizardScene} Registration wizard scene
 */
function registerScene(supabase) {
  const scene = new Scenes.WizardScene(
    "registerScene",
    // Step 1: Ask for name
    async (ctx) => {
      await ctx.reply("Please enter your full name:")
      ctx.wizard.state.userData = {}
      return ctx.wizard.next()
    },
    // Step 2: Ask for mobile number
    async (ctx) => {
      ctx.wizard.state.userData.name = ctx.message.text
      await ctx.reply("Please enter your mobile number:")
      return ctx.wizard.next()
    },
    // Step 3: Ask for UPI ID
    async (ctx) => {
      const mobileNumber = ctx.message.text.trim()
      // Validate mobile number
      if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
        await ctx.reply("Invalid mobile number. Please enter a valid 10-digit Indian mobile number:")
        return
      }

      ctx.wizard.state.userData.mobile = mobileNumber

      // Check if mobile number already exists
      const { data: existingUser } = await supabase.from("users").select("mobile").eq("mobile", mobileNumber).single()

      if (existingUser) {
        await ctx.reply("This mobile number is already registered. Please use a different number or contact support.")
        return ctx.scene.leave()
      }

      // Send OTP for verification
      const otp = await sendOTP(mobileNumber)
      ctx.wizard.state.userData.otp = otp

      await ctx.reply("Please enter the OTP sent to your mobile number:")
      return ctx.wizard.next()
    },
    // Step 4: Verify OTP and ask for UPI ID
    async (ctx) => {
      const enteredOTP = ctx.message.text.trim()
      const storedOTP = ctx.wizard.state.userData.otp

      // Verify OTP
      if (enteredOTP !== storedOTP) {
        await ctx.reply("Invalid OTP. Please try again:")
        return
      }

      await ctx.reply("Please enter your UPI ID (e.g., name@upi):")
      return ctx.wizard.next()
    },
    // Step 5: Ask for BGMI IGN
    async (ctx) => {
      const upiId = ctx.message.text.trim()
      // Validate UPI ID
      if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(upiId)) {
        await ctx.reply("Invalid UPI ID. Please enter a valid UPI ID (e.g., name@upi):")
        return
      }

      ctx.wizard.state.userData.upi_id = upiId
      await ctx.reply("Please enter your BGMI In-Game Name (IGN):")
      return ctx.wizard.next()
    },
    // Step 6: Ask for BGMI Player ID
    async (ctx) => {
      ctx.wizard.state.userData.bgmi_ign = ctx.message.text
      await ctx.reply("Please enter your BGMI Player ID:")
      return ctx.wizard.next()
    },
    // Step 7: Complete registration
    async (ctx) => {
      const playerId = ctx.message.text.trim()
      // Validate player ID
      if (!/^\d{8,12}$/.test(playerId)) {
        await ctx.reply("Invalid Player ID. Please enter a valid BGMI Player ID:")
        return
      }

      ctx.wizard.state.userData.bgmi_player_id = playerId

      try {
        // Save user data to database
        const { data: user, error } = await supabase
          .from("users")
          .insert({
            telegram_id: ctx.from.id,
            telegram_username: ctx.from.username,
            name: ctx.wizard.state.userData.name,
            mobile: ctx.wizard.state.userData.mobile,
            upi_id: ctx.wizard.state.userData.upi_id,
            bgmi_ign: ctx.wizard.state.userData.bgmi_ign,
            bgmi_player_id: ctx.wizard.state.userData.bgmi_player_id,
            balance: 0,
            created_at: new Date(),
          })
          .select()
          .single()

        if (error) throw error

        // Check if user was referred
        const { data: referralData } = await supabase
          .from("referral_pending")
          .select("referrer_telegram_id")
          .eq("referred_telegram_id", ctx.from.id)
          .single()

        if (referralData) {
          // Process referral bonus
          const REFERRAL_BONUS = 10 // ₹10 bonus

          // Update referrer's balance
          await supabase
            .from("users")
            .update({ balance: supabase.rpc("increment_balance", { amount: REFERRAL_BONUS }) })
            .eq("telegram_id", referralData.referrer_telegram_id)

          // Update referred user's balance
          await supabase.from("users").update({ balance: REFERRAL_BONUS }).eq("telegram_id", ctx.from.id)

          // Record referral transaction
          await supabase.from("transactions").insert([
            {
              user_id: referralData.referrer_telegram_id,
              amount: REFERRAL_BONUS,
              type: "referral_bonus",
              status: "completed",
              description: `Referral bonus for inviting a new user`,
            },
            {
              user_id: ctx.from.id,
              amount: REFERRAL_BONUS,
              type: "referral_bonus",
              status: "completed",
              description: `Welcome bonus for joining via referral`,
            },
          ])

          // Delete from pending
          await supabase.from("referral_pending").delete().eq("referred_telegram_id", ctx.from.id)

          await ctx.reply(`🎉 You received ₹${REFERRAL_BONUS} as a welcome bonus!`)
        }

        await ctx.reply(
          `✅ Registration successful!\n\n` +
            `Name: ${user.name}\n` +
            `Mobile: ${user.mobile}\n` +
            `UPI ID: ${user.upi_id}\n` +
            `BGMI IGN: ${user.bgmi_ign}\n` +
            `BGMI Player ID: ${user.bgmi_player_id}\n\n` +
            `You can now participate in tournaments, deposit money, and win cash prizes!`,
          Markup.keyboard([
            ["🏆 Tournaments", "💰 Deposit"],
            ["💸 Withdraw", "👤 Profile"],
            ["📊 Leaderboard", "🔗 Referral"],
          ]).resize(),
        )
      } catch (error) {
        console.error("Registration error:", error)
        await ctx.reply("An error occurred during registration. Please try again or contact support.")
      }

      return ctx.scene.leave()
    },
  )

  // Handle scene cancellation
  scene.command("cancel", async (ctx) => {
    await ctx.reply("Registration cancelled.")
    return ctx.scene.leave()
  })

  return scene
}

module.exports = { registerScene }

