const { Scenes } = require("telegraf")
const { registerScene } = require("./register-scene")
const { depositScene } = require("./deposit-scene")
const { withdrawScene } = require("./withdraw-scene")
const { tournamentCreationScene } = require("./tournament-creation-scene")
const { tournamentJoinScene } = require("./tournament-join-scene")
const { resultInputScene } = require("./result-input-scene")
const { otpVerificationScene } = require("./otp-verification-scene")

/**
 * Register all scenes
 * @param {SupabaseClient} supabase - Supabase client
 * @returns {Scenes.Stage} Telegraf stage with all scenes
 */
function registerScenes(supabase) {
  // Create scenes
  const register = registerScene(supabase)
  const deposit = depositScene(supabase)
  const withdraw = withdrawScene(supabase)
  const tournamentCreation = tournamentCreationScene(supabase)
  const tournamentJoin = tournamentJoinScene(supabase)
  const resultInput = resultInputScene(supabase)
  const otpVerification = otpVerificationScene(supabase)

  // Create and return stage
  const stage = new Scenes.Stage([
    register,
    deposit,
    withdraw,
    tournamentCreation,
    tournamentJoin,
    resultInput,
    otpVerification,
  ])

  return stage
}

module.exports = { registerScenes }

