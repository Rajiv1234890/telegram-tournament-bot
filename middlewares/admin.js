import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// List of admin Telegram IDs
const ADMIN_IDS = []; // Add your admin IDs here

export const adminMiddleware = async (ctx, next) => {
  const userId = ctx.from.id;

  // Check if user ID is in the admin list
  if (ADMIN_IDS.includes(userId)) {
    return next();
  }

  try {
    // Check if user is an admin in the database
    const { data: user, error } = await supabase.from('users').select('is_admin').eq('telegram_id', userId).single();

    if (error) {
      console.error(`Error fetching user data:`, error);
      return ctx.reply('⛔ An error occurred while checking permissions.');
    }

    if (user && user.is_admin) {
      return next();
    }

    // If not an admin, send an error message
    return ctx.reply('⛔ You do not have permission to use this command.');
  } catch (err) {
    console.error(`Unexpected error:`, err);
    return ctx.reply('⛔ An unexpected error occurred.');
  }
};