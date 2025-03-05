-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  name TEXT NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  upi_id TEXT NOT NULL,
  bgmi_ign TEXT NOT NULL,
  bgmi_player_id TEXT NOT NULL,
  balance DECIMAL(10, 2) DEFAULT 0,
  is_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  tournament_notifications BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournaments table
CREATE TABLE tournaments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  entry_fee DECIMAL(10, 2) NOT NULL,
  per_kill_reward DECIMAL(10, 2) NOT NULL,
  winner_prize DECIMAL(10, 2) NOT NULL,
  max_players INTEGER NOT NULL,
  registered_players INTEGER DEFAULT 0,
  room_id TEXT,
  room_password TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'open',
  created_by BIGINT REFERENCES users(telegram_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournament registrations table
CREATE TABLE tournament_registrations (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id),
  user_id INTEGER REFERENCES users(id),
  registration_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournament results table
CREATE TABLE tournament_results (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id),
  user_id INTEGER REFERENCES users(id),
  kills INTEGER DEFAULT 0,
  position INTEGER,
  kill_reward DECIMAL(10, 2) DEFAULT 0,
  winner_reward DECIMAL(10, 2) DEFAULT 0,
  total_reward DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  payment_link_id TEXT,
  payment_link TEXT,
  status TEXT NOT NULL,
  gateway TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Withdrawals table
CREATE TABLE withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  upi_id TEXT NOT NULL,
  status TEXT NOT NULL,
  transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Referral pending table
CREATE TABLE referral_pending (
  id SERIAL PRIMARY KEY,
  referrer_telegram_id BIGINT REFERENCES users(telegram_id),
  referred_telegram_id BIGINT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create functions for leaderboard
CREATE OR REPLACE FUNCTION get_top_killers(limit_count INTEGER)
RETURNS TABLE (
  user_id INTEGER,
  bgmi_ign TEXT,
  total_kills BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tr.user_id,
    u.bgmi_ign,
    SUM(tr.kills)::BIGINT AS total_kills
  FROM
    tournament_results tr
  JOIN
    users u ON tr.user_id = u.id
  GROUP BY
    tr.user_id, u.bgmi_ign
  ORDER BY
    total_kills DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_top_winners(limit_count INTEGER)
RETURNS TABLE (
  user_id INTEGER,
  bgmi_ign TEXT,
  total_wins BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tr.user_id,
    u.bgmi_ign,
    COUNT(*)::BIGINT AS total_wins
  FROM
    tournament_results tr
  JOIN
    users u ON tr.user_id = u.id
  WHERE
    tr.position = 1
  GROUP BY
    tr.user_id, u.bgmi_ign
  ORDER BY
    total_wins DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_top_earners(limit_count INTEGER)
RETURNS TABLE (
  user_id INTEGER,
  bgmi_ign TEXT,
  total_earnings DECIMAL(10, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tr.user_id,
    u.bgmi_ign,
    SUM(tr.total_reward) AS total_earnings
  FROM
    tournament_results tr
  JOIN
    users u ON tr.user_id = u.id
  GROUP BY
    tr.user_id, u.bgmi_ign
  ORDER BY
    total_earnings DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to increment balance
CREATE OR REPLACE FUNCTION increment_balance(user_id INTEGER, amount DECIMAL(10, 2))
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  current_balance DECIMAL(10, 2);
BEGIN
  SELECT balance INTO current_balance FROM users WHERE id = user_id;
  RETURN current_balance + amount;
END;
$$ LANGUAGE plpgsql;

