import { Scenes } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { generateTransactionId } from "../utils.js";

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Withdraw scene
export const withdrawScene = new Scenes.WizardScene(
  "withdraw",
  // Step 1: Check wallet balance
  async (ctx) => {
    const userId = ctx.from.id;

    const { data: user, error } = await supabase
      .from("users")
      .select("wallet_balance")
      .eq("telegram_id", userId)
      .single();

    if (error || !user) {
      ctx.reply("Error fetching wallet balance. Please try again later.");
      return ctx.scene.leave();
    }

    if (user.wallet_balance <= 0) {
      ctx.reply("You have no funds to withdraw. Your wallet balance is ₹0.00.");
      return ctx.scene.leave();
    }

    ctx.wizard.state.walletBalance = user.wallet_balance;

    ctx.reply(
      `💰 *Withdrawal*\n\n` +
        `Your wallet balance: ₹${user.wallet_balance.toFixed(2)}\n\n` +
        `How much would you like to withdraw? (Enter amount in ₹)`,
      { parse_mode: "Markdown" },
    );

    return ctx.wizard.next();
  },
  // Step 2: Ask for amount
  async (ctx) => {
    const amount = Number.parseFloat(ctx.message.text);

    if (isNaN(amount) || amount <= 0) {
      ctx.reply("Please enter a valid amount greater than 0.");
      return;
    }

    if (amount > ctx.wizard.state.walletBalance) {
      ctx.reply(`Insufficient balance. Your wallet balance is ₹${ctx.wizard.state.walletBalance.toFixed(2)}.`);
      return;
    }

    ctx.wizard.state.amount = amount;

    ctx.reply("Please enter your UPI ID where you want to receive the funds:");

    return ctx.wizard.next();
  },
  // Step 3: Ask for UPI ID
  async (ctx) => {
    const upiId = ctx.message.text;

    if (!upiId.includes("@")) {
      ctx.reply("Please enter a valid UPI ID (e.g., name@upi).");
      return;
    }

    ctx.wizard.state.upiId = upiId;

    // Confirm withdrawal
    ctx.reply(
      `📤 *Withdrawal Confirmation*\n\n` +
        `Amount: ₹${ctx.wizard.state.amount.toFixed(2)}\n` +
        `UPI ID: ${upiId}\n\n` +
        `Please confirm your withdrawal:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Confirm", callback_data: "confirm" }],
            [{ text: "Cancel", callback_data: "cancel" }],
          ],
        },
      },
    );

    return ctx.wizard.next();
  },
  // Step 4: Process withdrawal
  async (ctx) => {
    if (!ctx.callbackQuery) {
      ctx.reply("Please use the buttons to confirm or cancel your withdrawal.");
      return;
    }

    const choice = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (choice === "cancel") {
      ctx.reply("Withdrawal cancelled.");
      return ctx.scene.leave();
    }

    const userId = ctx.from.id;
    const amount = ctx.wizard.state.amount;
    const upiId = ctx.wizard.state.upiId;

    // Generate transaction ID
    const transactionId = generateTransactionId();

    // Create withdrawal record
    await supabase.from("withdrawals").insert({
      user_id: userId,
      amount: amount,
      upi_id: upiId,
      status: "pending",
      transaction_id: transactionId,
      created_at: new Date(),
    });

    // Deduct from wallet balance
    const newBalance = ctx.wizard.state.walletBalance - amount;

    await supabase.from("users").update({ wallet_balance: newBalance }).eq("telegram_id", userId);

    // Create transaction record
    await supabase.from("transactions").insert({
      user_id: userId,
      amount: -amount, // Negative amount for withdrawal
      type: "withdrawal",
      status: "pending",
      transaction_id: transactionId,
      created_at: new Date(),
    });

    ctx.reply(
      `✅ Withdrawal request submitted!\n\n` +
        `Amount: ₹${amount.toFixed(2)}\n` +
        `UPI ID: ${upiId}\n` +
        `Transaction ID: ${transactionId}\n` +
        `Status: Pending\n\n` +
        `Your request will be processed within 24 hours.\n` +
        `New wallet balance: ₹${newBalance.toFixed(2)}`,
    );

    // Notify admins
    const { data: admins } = await supabase.from("users").select("telegram_id").eq("is_admin", true);

    if (admins && admins.length > 0) {
      const adminMessage =
        `🔔 *New Withdrawal Request*\n\n` +
        `User ID: ${userId}\n` +
        `Amount: ₹${amount.toFixed(2)}\n` +
        `UPI ID: ${upiId}\n` +
        `Transaction ID: ${transactionId}\n\n` +
        `Approve with: /approvewithdraw ${transactionId}`;

      for (const admin of admins) {
        try {
          await ctx.telegram.sendMessage(admin.telegram_id, adminMessage, {
            parse_mode: "Markdown",
          });
        } catch (e) {
          console.error(`Failed to send notification to admin ${admin.telegram_id}:`, e);
        }
      }
    }

    return ctx.scene.leave();
  },
);