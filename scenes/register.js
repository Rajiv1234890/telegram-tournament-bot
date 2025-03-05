import { Scenes, Markup } from "telegraf"
import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// Registration scene
export const registerScene = new Scenes.WizardScene(
  "register",
  // Step 1: Ask for name
  async (ctx) => {
    ctx.reply("Please enter your in-game name:")
    return ctx.wizard.next()
  },
  // Step 2: Ask for game ID
  async (ctx) => {
    ctx.wizard.state.name = ctx.message.text
    ctx.reply("Please enter your game ID:")
    return ctx.wizard.next()
  },
  // Step 3: Ask for phone number
  async (ctx) => {
    ctx.wizard.state.gameId = ctx.message.text
    ctx.reply(
      "Please enter your phone number (for payment and notifications):",
      Markup.keyboard([[Markup.button.contactRequest("Share my contact")]]).resize(),
    )
    return ctx.wizard.next()
  },
  // Step 4: Save user data
  async (ctx) => {
    let phoneNumber

    if (ctx.message.contact) {
      phoneNumber = ctx.message.contact.phone_number
    } else {
      phoneNumber = ctx.message.text
    }

    ctx.wizard.state.phone = phoneNumber

    // Save user data to database
    const userId = ctx.from.id

    const { error } = await supabase
      .from("users")
      .update({
        in_game_name: ctx.wizard.state.name,
        game_id: ctx.wizard.state.gameId,
        phone: phoneNumber,
        updated_at: new Date(),
      })
      .eq("telegram_id", userId)

    if (error) {
      console.error("Error updating user:", error)
      ctx.reply("An error occurred. Please try again later.")
    } else {
      ctx.reply(
        "✅ Registration successful!\n\n" + "You can now join tournaments using the /tournaments command.",
        Markup.keyboard([["🏆 Tournaments", "📝 Register"], ["🎮 My Tournaments", "💰 Wallet"], ["❓ Help"]]).resize(),
      )
    }

    return ctx.scene.leave()
  },
)

