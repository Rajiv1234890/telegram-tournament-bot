import { Scenes } from "telegraf";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper function to update tournament in database
async function updateTournament(ctx) {
  const tournament = ctx.wizard.state.tournament;
  const tournamentId = tournament.id;

  // Remove id from the object to avoid conflicts
  delete tournament.id;

  const { error } = await supabase.from("tournaments").update(tournament).eq("id", tournamentId);

  if (error) {
    console.error("Error updating tournament:", error);
    ctx.reply("An error occurred while saving changes. Please try again later.");
  } else {
    ctx.reply("✅ Tournament updated successfully!");

    // Notify registered users about the changes
    const { data: registrations } = await supabase
      .from("registrations")
      .select("user_id")
      .eq("tournament_id", tournamentId);

    if (registrations && registrations.length > 0) {
      const message =
        `🔄 *Tournament Update*\n\n` +
        `The details for tournament *${tournament.name}* have been updated.\n` +
        `Please check /tournaments for the latest information.`;

      for (const reg of registrations) {
        try {
          await ctx.telegram.sendMessage(reg.user_id, message, {
            parse_mode: "Markdown",
          });
        } catch (e) {
          console.error(`Failed to send notification to user ${reg.user_id}:`, e);
        }
      }
    }
  }
}

// Edit tournament scene
export const editTournamentScene = new Scenes.WizardScene(
  "editTournament",
  // Step 1: Fetch tournament and show current details
  async (ctx) => {
    const tournamentId = ctx.scene.state.tournamentId;

    const { data: tournament, error } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single();

    if (error || !tournament) {
      ctx.reply("Tournament not found. Please check the ID and try again.");
      return ctx.scene.leave();
    }

    ctx.wizard.state.tournament = tournament;

    ctx.reply(
      `Editing Tournament: ${tournament.name}\n\n` +
        `What would you like to edit?\n\n` +
        `1. Name (current: ${tournament.name})\n` +
        `2. Entry Fee (current: ₹${tournament.entry_fee})\n` +
        `3. Prize Pool (current: ₹${tournament.prize_pool})\n` +
        `4. Max Players (current: ${tournament.max_players})\n` +
        `5. Start Time (current: ${new Date(tournament.start_time).toLocaleString()})\n` +
        `6. Save and Exit\n\n` +
        `Please enter the number of your choice:`,
    );

    return ctx.wizard.next();
  },
  // Step 2: Handle edit choice
  async (ctx) => {
    const choice = ctx.message.text;

    switch (choice) {
      case "1":
        ctx.reply(`Enter new name (current: ${ctx.wizard.state.tournament.name}):`);
        ctx.wizard.state.editing = "name";
        break;
      case "2":
        ctx.reply(`Enter new entry fee (current: ₹${ctx.wizard.state.tournament.entry_fee}):`);
        ctx.wizard.state.editing = "entry_fee";
        break;
      case "3":
        ctx.reply(`Enter new prize pool (current: ₹${ctx.wizard.state.tournament.prize_pool}):`);
        ctx.wizard.state.editing = "prize_pool";
        break;
      case "4":
        ctx.reply(`Enter new max players (current: ${ctx.wizard.state.tournament.max_players}):`);
        ctx.wizard.state.editing = "max_players";
        break;
      case "5":
        ctx.reply(`Enter new date (YYYY-MM-DD):`);
        ctx.wizard.state.editing = "date";
        break;
      case "6":
        // Save and exit
        await updateTournament(ctx);
        return ctx.scene.leave();
      default:
        ctx.reply("Invalid choice. Please enter a number from 1 to 6:");
        return;
    }

    return ctx.wizard.next();
  },
  // Step 3: Handle edit value
  async (ctx) => {
    const value = ctx.message.text;
    const editing = ctx.wizard.state.editing;

    if (editing === "name") {
      ctx.wizard.state.tournament.name = value;
    } else if (editing === "entry_fee") {
      ctx.wizard.state.tournament.entry_fee = Number.parseFloat(value);
    } else if (editing === "prize_pool") {
      ctx.wizard.state.tournament.prize_pool = Number.parseFloat(value);
    } else if (editing === "max_players") {
      ctx.wizard.state.tournament.max_players = Number.parseInt(value);
    } else if (editing === "date") {
      ctx.wizard.state.editing = "time";
      ctx.wizard.state.date = value;
      ctx.reply("Enter new time (HH:MM):");
      return;
    } else if (editing === "time") {
      const startTime = new Date(`${ctx.wizard.state.date}T${value}:00`);
      ctx.wizard.state.tournament.start_time = startTime.toISOString();
    }

    // Show menu again
    ctx.reply(
      `Updated! What else would you like to edit?\n\n` +
        `1. Name (current: ${ctx.wizard.state.tournament.name})\n` +
        `2. Entry Fee (current: ₹${ctx.wizard.state.tournament.entry_fee})\n` +
        `3. Prize Pool (current: ₹${ctx.wizard.state.tournament.prize_pool})\n` +
        `4. Max Players (current: ${ctx.wizard.state.tournament.max_players})\n` +
        `5. Start Time (current: ${new Date(ctx.wizard.state.tournament.start_time).toLocaleString()})\n` +
        `6. Save and Exit\n\n` +
        `Please enter the number of your choice:`,
    );

    return ctx.wizard.back();
  },
);