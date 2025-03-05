import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Format tournament details for display
export const formatTournament = (tournament) => {
  const startTime = new Date(tournament.start_time);

  return (
    `*${tournament.name}* (ID: ${tournament.id})\n` +
    `Type: ${tournament.game_type}\n` +
    `Entry Fee: ₹${tournament.entry_fee}\n` +
    `Prize Pool: ₹${tournament.prize_pool}\n` +
    `Date: ${startTime.toLocaleDateString()}\n` +
    `Time: ${startTime.toLocaleTimeString()}\n` +
    `Slots: ${tournament.registered_players}/${tournament.max_players}\n`
  );
};

// Send notification to a user
export const sendNotification = async (bot, userId, message) => {
  try {
    await bot.telegram.sendMessage(userId, message, { parse_mode: "Markdown" });
    return true;
  } catch (error) {
    console.error(`Failed to send notification to user ${userId}:`, error);
    return false;
  }
};

// Other utility functions...

export const isTournamentFull = async (tournamentId) => {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("max_players, registered_players")
    .eq("id", tournamentId)
    .single();

  return tournament && tournament.registered_players >= tournament.max_players;
};

export const updateTournamentCount = async (tournamentId, increment = true) => {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("registered_players")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return false;

  const newCount = increment ? tournament.registered_players + 1 : tournament.registered_players - 1;

  await supabase.from("tournaments").update({ registered_players: newCount }).eq("id", tournamentId);

  return true;
};

export const generateTransactionId = () => {
  return "TXN" + Date.now() + Math.floor(Math.random() * 1000);
};

export const scheduleTournamentReminders = async (bot) => {
  const oneHourLater = new Date();
  oneHourLater.setHours(oneHourLater.getHours() + 1);

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .gt("start_time", new Date().toISOString())
    .lt("start_time", oneHourLater.toISOString())
    .eq("reminders_sent", false);

  if (!tournaments || tournaments.length === 0) return;

  for (const tournament of tournaments) {
    const { data: registrations } = await supabase
      .from("registrations")
      .select("user_id")
      .eq("tournament_id", tournament.id)
      .eq("payment_status", "completed");

    if (!registrations || registrations.length === 0) continue;

    for (const reg of registrations) {
      const message =
        `🔔 *Reminder*: Your tournament *${tournament.name}* starts in less than an hour!\n\n` +
        `Time: ${new Date(tournament.start_time).toLocaleString()}\n` +
        `Use /roomid ${tournament.id} to get room details.`;

      await sendNotification(bot, reg.user_id, message);
    }

    await supabase.from("tournaments").update({ reminders_sent: true }).eq("id", tournament.id);
  }
};